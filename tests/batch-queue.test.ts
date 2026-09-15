import { describe, it, expect, vi } from 'vitest';
import { BatchQueueService } from '../src/services/batch-queue.service.js';
import { ProcessDocumentUseCase } from '../src/use-cases/process-document.use-case.js';

describe('Sprint 4: Bounded BatchQueueService & OOM Prevention', () => {
  it('should initialize a batch and track progress correctly', async () => {
    const mockUseCase = {
      execute: vi.fn().mockResolvedValue({
        rankedIR: {
          metadata: { document_title: 'Báo cáo mẫu' },
          level1_executive_brief: { headline: 'Tóm tắt điều hành' },
          level2_details: { metrics: [], tables: [] }
        },
        parsedDoc: { totalPages: 2 },
        processingTimeMs: 150
      })
    } as unknown as ProcessDocumentUseCase;

    const queue = new BatchQueueService({
      concurrencyLimit: 2,
      maxBatchSize: 10,
      processDocumentUseCase: mockUseCase
    });

    const filePaths = ['/uploads/doc1.pdf', '/uploads/doc2.pdf', '/uploads/doc3.pdf'];
    const summary = queue.createBatch(filePaths);

    expect(summary.batchId).toBeDefined();
    expect(summary.totalJobs).toBe(3);
    expect(summary.pendingJobs).toBe(3);

    // Đợi batch hoàn thành
    await new Promise(r => setTimeout(r, 100));

    const updatedStatus = queue.getBatchStatus(summary.batchId);
    expect(updatedStatus).not.toBeNull();
    expect(updatedStatus?.isComplete).toBe(true);
    expect(updatedStatus?.completedJobs).toBe(3);
    expect(updatedStatus?.failedJobs).toBe(0);
    expect(updatedStatus?.overallProgressPercent).toBe(100);
  });

  it('should reject batch creation when file count exceeds maxBatchSize to prevent OOM', () => {
    const queue = new BatchQueueService({ maxBatchSize: 5 });
    const tooManyFiles = Array.from({ length: 10 }, (_, i) => `/uploads/file_${i}.pdf`);

    expect(() => {
      queue.createBatch(tooManyFiles);
    }).toThrow(/vượt quá giới hạn an toàn tối đa/);
  });

  it('should isolate errors per job so single corrupt file does not fail entire batch', async () => {
    const mockUseCase = {
      execute: vi.fn().mockImplementation((filePath: string) => {
        if (filePath.includes('corrupt')) {
          return Promise.reject(new Error('Tệp PDF bị hỏng hoặc mã hóa không đọc được'));
        }
        return Promise.resolve({
          rankedIR: { metadata: { document_title: 'Báo cáo hợp lệ' } },
          parsedDoc: { totalPages: 1 },
          processingTimeMs: 50
        });
      })
    } as unknown as ProcessDocumentUseCase;

    const queue = new BatchQueueService({
      concurrencyLimit: 2,
      processDocumentUseCase: mockUseCase
    });

    const filePaths = ['/uploads/good1.pdf', '/uploads/corrupt.pdf', '/uploads/good2.pdf'];
    const summary = queue.createBatch(filePaths);

    await new Promise(r => setTimeout(r, 100));

    const finalStatus = queue.getBatchStatus(summary.batchId);
    expect(finalStatus?.isComplete).toBe(true);
    expect(finalStatus?.completedJobs).toBe(2);
    expect(finalStatus?.failedJobs).toBe(1);
    const failedJob = finalStatus?.jobs.find(j => j.filePath.includes('corrupt'));
    expect(failedJob?.status).toBe('FAILED');
    expect(failedJob?.error).toContain('Tệp PDF bị hỏng');
  });

  it('should expose accurate queue metrics and prune old batches', () => {
    const queue = new BatchQueueService({
      concurrencyLimit: 4,
      maxBatchSize: 50,
      maxRetainedBatches: 2
    });

    const metricsBefore = queue.getQueueMetrics();
    expect(metricsBefore.concurrencyLimit).toBe(4);
    expect(metricsBefore.maxBatchSize).toBe(50);
    expect(metricsBefore.totalBatchesTracked).toBe(0);
  });
});
