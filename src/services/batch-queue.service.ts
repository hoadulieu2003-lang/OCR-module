import fs from 'fs';
import path from 'path';
import { ProcessDocumentUseCase } from '../use-cases/process-document.use-case.js';
import { ExecutiveReportIR } from '../schemas/report-ir.schema.js';

export type BatchJobStatus = 'PENDING' | 'PARSING' | 'EXTRACTING' | 'RANKING' | 'COMPLETED' | 'FAILED';

export interface BatchJobItem {
  jobId: string;
  filePath: string;
  fileName: string;
  status: BatchJobStatus;
  progressPercent: number;
  result?: ExecutiveReportIR;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface BatchProgressSummary {
  batchId: string;
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  overallProgressPercent: number;
  isComplete: boolean;
  createdAt: string;
  jobs: BatchJobItem[];
}

export interface QueueMetrics {
  totalBatchesTracked: number;
  activeBatches: number;
  completedBatches: number;
  concurrencyLimit: number;
  maxBatchSize: number;
  activeWorkers: number;
}

export interface BatchQueueOptions {
  concurrencyLimit?: number;
  maxBatchSize?: number;
  maxRetainedBatches?: number;
  processDocumentUseCase?: ProcessDocumentUseCase;
  storageFilePath?: string;
  enablePersistence?: boolean;
}

/**
 * Service Bounded Batch Queue chống tràn RAM (OOM Prevention)
 * Quản lý hàng đợi xử lý tài liệu đồng thời có giới hạn và cơ chế dọn rác TTL/LRU
 */
export class BatchQueueService {
  private processDocumentUseCase: ProcessDocumentUseCase;
  private batches: Map<string, BatchProgressSummary>;
  private concurrencyLimit: number;
  private maxBatchSize: number;
  private maxRetainedBatches: number;
  private activeWorkersCount: number;
  private storageFilePath: string;

  constructor(options: BatchQueueOptions = {}) {
    this.concurrencyLimit = options.concurrencyLimit || 3;
    this.maxBatchSize = options.maxBatchSize || 100;
    this.maxRetainedBatches = options.maxRetainedBatches || 50;
    this.processDocumentUseCase = options.processDocumentUseCase || new ProcessDocumentUseCase();
    this.batches = new Map();
    this.activeWorkersCount = 0;
    
    const shouldPersist = options.enablePersistence ?? (process.env.NODE_ENV !== 'test');
    this.storageFilePath = shouldPersist ? (options.storageFilePath || path.resolve(__dirname, '../../data/batch-queue-state.json')) : '';
    if (this.storageFilePath) {
      this.loadStateFromDisk();
    }
  }

  private loadStateFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const content = fs.readFileSync(this.storageFilePath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && item.batchId) {
              this.batches.set(item.batchId, item);
            }
          }
        }
      }
    } catch {
      // Bỏ qua lỗi đọc file
    }
  }

  private saveStateToDisk(): void {
    if (!this.storageFilePath) return;
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.batches.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Bỏ qua lỗi ghi file
    }
  }

  /**
   * Khởi tạo và đưa một lô tài liệu vào hàng đợi xử lý ngầm (Bounded Batch Queue)
   */
  createBatch(filePaths: string[]): BatchProgressSummary {
    if (!filePaths || filePaths.length === 0) {
      throw new Error('Danh sách file tài liệu không được để trống.');
    }

    if (filePaths.length > this.maxBatchSize) {
      throw new Error(`Số lượng tài liệu trong một đợt (${filePaths.length}) vượt quá giới hạn an toàn tối đa (${this.maxBatchSize}).`);
    }

    // Tự động dọn dẹp các batch cũ nếu vượt quá dung lượng lưu trữ bộ nhớ
    this.pruneOldBatches();

    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const jobs: BatchJobItem[] = filePaths.map((fp, idx) => ({
      jobId: `job-${batchId}-${idx + 1}`,
      filePath: fp,
      fileName: fp.split(/[\\/]/).pop() || `doc_${idx + 1}`,
      status: 'PENDING',
      progressPercent: 0
    }));

    const batchSummary: BatchProgressSummary = {
      batchId,
      totalJobs: jobs.length,
      pendingJobs: jobs.length,
      processingJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      overallProgressPercent: 0,
      isComplete: false,
      createdAt: new Date().toISOString(),
      jobs
    };

    this.batches.set(batchId, batchSummary);
    this.saveStateToDisk();

    // Kích hoạt tiến trình xử lý bất đồng bộ trong microtask tiếp theo
    queueMicrotask(() => {
      this.processBatchAsync(batchId);
    });

    return batchSummary;
  }

  /**
   * Lấy trạng thái tiến độ thời gian thực của một Batch
   */
  getBatchStatus(batchId: string): BatchProgressSummary | null {
    return this.batches.get(batchId) || null;
  }

  /**
   * Lấy các số liệu giám sát hàng đợi (Queue Metrics)
   */
  getQueueMetrics(): QueueMetrics {
    let active = 0;
    let completed = 0;

    for (const batch of this.batches.values()) {
      if (batch.isComplete) completed++;
      else active++;
    }

    return {
      totalBatchesTracked: this.batches.size,
      activeBatches: active,
      completedBatches: completed,
      concurrencyLimit: this.concurrencyLimit,
      maxBatchSize: this.maxBatchSize,
      activeWorkers: this.activeWorkersCount
    };
  }

  /**
   * Dọn dẹp các batch cũ nhất khi đạt ngưỡng maxRetainedBatches
   */
  private pruneOldBatches(): void {
    if (this.batches.size >= this.maxRetainedBatches) {
      const keysToDelete: string[] = [];
      for (const [id, batch] of this.batches.entries()) {
        if (batch.isComplete) {
          keysToDelete.push(id);
        }
        if (this.batches.size - keysToDelete.length < this.maxRetainedBatches) {
          break;
        }
      }

      for (const key of keysToDelete) {
        this.batches.delete(key);
      }
    }
  }

  /**
   * Điều phối công nhân xử lý song song có giới hạn đồng thời chuẩn xác
   */
  private async processBatchAsync(batchId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) return;

    const pendingJobs = [...batch.jobs];
    const executing = new Set<Promise<void>>();

    for (const job of pendingJobs) {
      let p: Promise<void>;
      p = this.executeJob(batchId, job).finally(() => {
        executing.delete(p);
      });
      executing.add(p);

      if (executing.size >= this.concurrencyLimit) {
        await Promise.race(executing);
      }
    }

    await Promise.allSettled(Array.from(executing));
    this.updateBatchSummary(batchId);
  }

  /**
   * Xử lý từng Job qua ProcessDocumentUseCase
   */
  private async executeJob(batchId: string, job: BatchJobItem): Promise<void> {
    const startTime = Date.now();
    job.startedAt = new Date().toISOString();
    job.status = 'PARSING';
    job.progressPercent = 20;
    this.activeWorkersCount++;
    this.updateBatchSummary(batchId);

    try {
      // Thực thi qua ProcessDocumentUseCase
      job.status = 'EXTRACTING';
      job.progressPercent = 50;
      this.updateBatchSummary(batchId);

      const result = await this.processDocumentUseCase.execute(job.filePath);

      job.status = 'RANKING';
      job.progressPercent = 85;
      this.updateBatchSummary(batchId);

      job.result = result.rankedIR;
      job.status = 'COMPLETED';
      job.progressPercent = 100;
      job.completedAt = new Date().toISOString();
      job.durationMs = Date.now() - startTime;
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = err?.message || 'Lỗi không xác định trong quá trình xử lý';
      job.completedAt = new Date().toISOString();
      job.durationMs = Date.now() - startTime;
    } finally {
      this.activeWorkersCount = Math.max(0, this.activeWorkersCount - 1);
      this.updateBatchSummary(batchId);
    }
  }

  /**
   * Cập nhật số liệu thống kê tổng hợp của Batch
   */
  private updateBatchSummary(batchId: string): void {
    const batch = this.batches.get(batchId);
    if (!batch) return;

    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    let totalProgress = 0;

    for (const job of batch.jobs) {
      if (job.status === 'PENDING') pending++;
      else if (job.status === 'COMPLETED') completed++;
      else if (job.status === 'FAILED') failed++;
      else processing++;

      totalProgress += job.progressPercent;
    }

    batch.pendingJobs = pending;
    batch.processingJobs = processing;
    batch.completedJobs = completed;
    batch.failedJobs = failed;
    batch.overallProgressPercent = Math.round(totalProgress / batch.totalJobs);
    batch.isComplete = (completed + failed) === batch.totalJobs;
    this.saveStateToDisk();
  }
}
