import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ExecutiveReportIR } from '../schemas/report-ir.schema.js';

export interface WarehouseIndexRecord {
  record_id: string;
  synced_at: string;
  document_title: string;
  issuing_authority: string;
  issuance_date: string | null;
  primary_domain: string;
  domain_tags: string[];
  indicators_count: number;
  tables_count: number;
  relationships_count: number;
  file_hash_sha256?: string | null;
  storage_file: string;
  status: 'SYNCED_TO_EXECUTIVE_WAREHOUSE';
}

export interface WarehouseQueryFilter {
  domain?: string;
  authority?: string;
  limit?: number;
  offset?: number;
}

export interface RelationalReportRecord {
  id: string;
  document_title: string;
  document_type: string;
  document_number: string | null;
  issuing_authority: string;
  receiving_authority: string | null;
  issuance_date: string | null;
  reporting_period: string | null;
  primary_domain: string;
  domain_tags: string[];
  file_hash_sha256: string | null;
  status: string;
  created_at: string;
}

export interface RelationalMetricRecord {
  id: string;
  report_id: string;
  issuing_authority: string;
  issuance_date: string | null;
  reporting_period: string | null;
  indicator_name: string;
  plan_target: string | null;
  actual_value: string | null;
  percentage: string | null;
  unit: string | null;
  status: string;
  trend: string;
  page_ref: number;
  quote: string | null;
}

export interface RelationalTableRecord {
  id: string;
  report_id: string;
  table_title: string;
  headers: string[];
  row_count: number;
  col_count: number;
  page_ref: number;
}

export interface RelationalBottleneckRecord {
  id: string;
  report_id: string;
  issuing_authority: string;
  issuance_date: string | null;
  problem: string;
  root_cause: string | null;
  consequence: string | null;
  category: string;
  urgency: string;
  responsible_agency: string | null;
}

export interface RelationalTaskRecord {
  id: string;
  report_id: string;
  issuing_authority: string;
  task_title: string;
  lead_assignee: string | null;
  deadline: string | null;
  completion_status: string;
}

/**
 * Service Quản lý Lưu Trữ Bền Vững & Kho Dữ Liệu Quan Hệ Điều Hành KGLVS
 * Hỗ trợ: Lưu trữ bản ghi JSON, Bảng quan hệ phẳng (Reports, Metrics, Tables, Bottlenecks, Tasks) và Khử trùng lặp qua SHA-256
 */
export class WarehouseStorageService {
  private baseDir: string;
  private recordsDir: string;
  private tablesDir: string;
  private indexFilePath: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.resolve(__dirname, '../../data/warehouse');
    this.recordsDir = path.join(this.baseDir, 'records');
    this.tablesDir = path.join(this.baseDir, 'tables');
    this.indexFilePath = path.join(this.baseDir, 'index.json');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.recordsDir)) {
      fs.mkdirSync(this.recordsDir, { recursive: true });
    }
    if (!fs.existsSync(this.tablesDir)) {
      fs.mkdirSync(this.tablesDir, { recursive: true });
    }
    if (!fs.existsSync(this.indexFilePath)) {
      fs.writeFileSync(this.indexFilePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private readTable<T>(tableName: string): T[] {
    const filePath = path.join(this.tablesDir, `${tableName}.json`);
    try {
      if (!fs.existsSync(filePath)) return [];
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T[];
    } catch {
      return [];
    }
  }

  private writeTable<T>(tableName: string, data: T[]): void {
    const filePath = path.join(this.tablesDir, `${tableName}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Lỗi khi ghi bảng warehouse ${tableName}:`, err);
    }
  }

  private readIndex(): WarehouseIndexRecord[] {
    try {
      if (!fs.existsSync(this.indexFilePath)) return [];
      const content = fs.readFileSync(this.indexFilePath, 'utf-8');
      return JSON.parse(content) as WarehouseIndexRecord[];
    } catch {
      return [];
    }
  }

  private writeIndex(records: WarehouseIndexRecord[]): void {
    try {
      fs.writeFileSync(this.indexFilePath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (err) {
      console.error('Lỗi khi ghi index warehouse:', err);
    }
  }

  /**
   * Tính toán mã băm SHA-256 cho tệp hoặc nội dung chuỗi (Chống trùng lặp dữ liệu)
   */
  computeHash(contentOrPath: string): string {
    const hash = crypto.createHash('sha256');
    if (fs.existsSync(contentOrPath) && fs.statSync(contentOrPath).isFile()) {
      const fileBuffer = fs.readFileSync(contentOrPath);
      hash.update(fileBuffer);
    } else {
      hash.update(contentOrPath);
    }
    return hash.digest('hex');
  }

  /**
   * Kiểm tra xem tệp đã tồn tại trong kho theo mã băm SHA-256 hay chưa
   */
  findDuplicateByHash(fileHash: string): WarehouseIndexRecord | null {
    const index = this.readIndex();
    return index.find(r => r.file_hash_sha256 === fileHash) || null;
  }

  /**
   * Lưu trữ và phân rã báo cáo vào cả Kho Dữ Liệu Gốc và Các Bảng Quan Hệ Phẳng
   */
  saveReport(reportData: ExecutiveReportIR | any, rawText?: string, filePath?: string): WarehouseIndexRecord {
    const meta = reportData.metadata || {};
    const level2 = reportData.level2_details || {};
    const nowIso = new Date().toISOString();

    // Tính mã băm SHA-256
    let fileHash: string | null = null;
    if (filePath && fs.existsSync(filePath)) {
      fileHash = this.computeHash(filePath);
    } else if (rawText) {
      fileHash = this.computeHash(rawText);
    } else {
      fileHash = this.computeHash(JSON.stringify(meta));
    }

    // Kiểm tra trùng lặp qua mã băm SHA-256
    const existing = this.findDuplicateByHash(fileHash);
    if (existing) {
      return existing;
    }

    const recordId = `kglvs-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const fileName = `${recordId}.json`;
    const recordFilePath = path.join(this.recordsDir, fileName);

    const fullRecord = {
      record_id: recordId,
      file_hash_sha256: fileHash,
      synced_at: nowIso,
      metadata: meta,
      raw_text: rawText || null,
      report_data: reportData
    };

    fs.writeFileSync(recordFilePath, JSON.stringify(fullRecord, null, 2), 'utf-8');

    const indexEntry: WarehouseIndexRecord = {
      record_id: recordId,
      synced_at: nowIso,
      document_title: meta.document_title || 'Báo cáo hành chính',
      issuing_authority: meta.issuing_authority || 'UBND',
      issuance_date: meta.issuance_date || null,
      primary_domain: meta.primary_domain || 'Hành chính tổng hợp',
      domain_tags: meta.domain_tags || [],
      indicators_count: level2.metrics?.length || 0,
      tables_count: level2.tables?.length || 0,
      relationships_count: level2.relationships?.length || 0,
      file_hash_sha256: fileHash,
      storage_file: fileName,
      status: 'SYNCED_TO_EXECUTIVE_WAREHOUSE'
    };

    const index = this.readIndex();
    const existingIdx = index.findIndex(r => r.record_id === recordId);
    if (existingIdx >= 0) {
      index[existingIdx] = indexEntry;
    } else {
      index.unshift(indexEntry);
    }
    this.writeIndex(index);

    // Lưu trữ phân rã vào các Bảng Quan Hệ Phẳng (Relational Tables)
    this.persistRelationalTables(recordId, reportData, fileHash, nowIso);

    return indexEntry;
  }

  /**
   * Phân rã IR vào các bảng quan hệ phục vụ truy vấn OLAP & Cross-Document Analytics
   */
  private persistRelationalTables(recordId: string, reportData: any, fileHash: string | null, nowIso: string): void {
    const meta = reportData.metadata || {};
    const level2 = reportData.level2_details || {};

    // 1. Bảng reports
    const reports = this.readTable<RelationalReportRecord>('reports');
    const newReport: RelationalReportRecord = {
      id: recordId,
      document_title: meta.document_title || 'Báo cáo hành chính',
      document_type: meta.document_type || 'BAO_CAO',
      document_number: meta.document_number || null,
      issuing_authority: meta.issuing_authority || 'UBND',
      receiving_authority: meta.receiving_authority || null,
      issuance_date: meta.issuance_date || null,
      reporting_period: meta.reporting_period || null,
      primary_domain: meta.primary_domain || 'Hành chính tổng hợp',
      domain_tags: meta.domain_tags || [],
      file_hash_sha256: fileHash,
      status: 'ACTIVE',
      created_at: nowIso
    };
    const rIdx = reports.findIndex(r => r.id === recordId);
    if (rIdx >= 0) reports[rIdx] = newReport; else reports.push(newReport);
    this.writeTable('reports', reports);

    // 2. Bảng report_metrics
    let metricsTable = this.readTable<RelationalMetricRecord>('report_metrics').filter(m => m.report_id !== recordId);
    const newMetrics: RelationalMetricRecord[] = (level2.metrics || []).map((m: any, idx: number) => ({
      id: `rm-${recordId}-${idx + 1}`,
      report_id: recordId,
      issuing_authority: meta.issuing_authority || 'UBND',
      issuance_date: meta.issuance_date || null,
      reporting_period: meta.reporting_period || null,
      indicator_name: m.indicator || 'Chỉ số',
      plan_target: m.plan_target || null,
      actual_value: m.actual || null,
      percentage: m.percentage || null,
      unit: m.unit || null,
      status: m.status || 'GREEN',
      trend: m.trend || 'ON_DINH',
      page_ref: m.page_ref || 1,
      quote: m.quote || null
    }));
    this.writeTable('report_metrics', [...metricsTable, ...newMetrics]);

    // 3. Bảng report_tables
    let tablesTable = this.readTable<RelationalTableRecord>('report_tables').filter(t => t.report_id !== recordId);
    const newTables: RelationalTableRecord[] = (level2.tables || []).map((t: any, idx: number) => ({
      id: `rt-${recordId}-${idx + 1}`,
      report_id: recordId,
      table_title: t.table_title || `Bảng ${idx + 1}`,
      headers: t.headers || [],
      row_count: t.row_count || 0,
      col_count: t.col_count || 0,
      page_ref: t.page_ref || 1
    }));
    this.writeTable('report_tables', [...tablesTable, ...newTables]);

    // 4. Bảng report_bottlenecks
    let bottlenecksTable = this.readTable<RelationalBottleneckRecord>('report_bottlenecks').filter(b => b.report_id !== recordId);
    const newBottlenecks: RelationalBottleneckRecord[] = (level2.relationships || []).map((rel: any, idx: number) => ({
      id: `rb-${recordId}-${idx + 1}`,
      report_id: recordId,
      issuing_authority: meta.issuing_authority || 'UBND',
      issuance_date: meta.issuance_date || null,
      problem: rel.problem || rel.cause_description || 'Khó khăn vướng mắc',
      root_cause: rel.root_cause || null,
      consequence: rel.consequence || null,
      category: this.classifyBottleneckCategory(rel.problem || rel.cause_description || ''),
      urgency: rel.urgency || 'MEDIUM',
      responsible_agency: rel.responsible_agency || null
    }));
    this.writeTable('report_bottlenecks', [...bottlenecksTable, ...newBottlenecks]);

    // 5. Bảng report_tasks
    let tasksTable = this.readTable<RelationalTaskRecord>('report_tasks').filter(t => t.report_id !== recordId);
    const newTasks: RelationalTaskRecord[] = (level2.action_items || []).map((act: any, idx: number) => ({
      id: `rtk-${recordId}-${idx + 1}`,
      report_id: recordId,
      issuing_authority: meta.issuing_authority || 'UBND',
      task_title: act.task_title || act.action || 'Nhiệm vụ',
      lead_assignee: act.lead_assignee || act.assigned_to || null,
      deadline: act.deadline || null,
      completion_status: act.status || 'PENDING'
    }));
    this.writeTable('report_tasks', [...tasksTable, ...newTasks]);
  }

  private classifyBottleneckCategory(text: string): string {
    const t = text.toLowerCase();
    if (/mặt bằng|đất đai|bồi thường|tái định cư|giải phóng/i.test(t)) return 'GIAI_PHONG_MAT_BANG';
    if (/vốn|giải ngân|kinh phí|ngân sách|đầu tư/i.test(t)) return 'VON_DAU_TU';
    if (/thủ tục|pháp lý|luật|nghị định|hồ sơ|thẩm định|quy hoạch/i.test(t)) return 'THU_TUC_PHAP_LY';
    if (/nhân lực|cán bộ|biên chế|nhân sự/i.test(t)) return 'NHAN_SU';
    if (/vật liệu|cát|đá|thi công|nhà thầu/i.test(t)) return 'THI_CONG_VAT_LIEU';
    return 'KHAC';
  }

  /**
   * Truy vấn danh sách các bản ghi trong Kho Dữ Liệu
   */
  listReports(filter: WarehouseQueryFilter = {}): { total: number; records: WarehouseIndexRecord[] } {
    let index = this.readIndex();

    if (filter.domain) {
      const q = filter.domain.toLowerCase();
      index = index.filter(r => r.primary_domain.toLowerCase().includes(q) || r.domain_tags.some(t => t.toLowerCase().includes(q)));
    }

    if (filter.authority) {
      const q = filter.authority.toLowerCase();
      index = index.filter(r => r.issuing_authority.toLowerCase().includes(q));
    }

    const total = index.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    const paged = index.slice(offset, offset + limit);

    return { total, records: paged };
  }

  /**
   * Lấy chi tiết toàn bộ dữ liệu gốc của một bản ghi trong Kho
   */
  getReportById(recordId: string): any | null {
    const recordFile = path.join(this.recordsDir, `${recordId}.json`);
    if (!fs.existsSync(recordFile)) return null;
    try {
      const content = fs.readFileSync(recordFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // --- CÁC PHƯƠNG THỨC TRUY VẤN BẢNG QUAN HỆ (RELATIONAL OLAP QUERIES) ---

  getAllRelationalReports(): RelationalReportRecord[] {
    return this.readTable<RelationalReportRecord>('reports');
  }

  getAllRelationalMetrics(): RelationalMetricRecord[] {
    return this.readTable<RelationalMetricRecord>('report_metrics');
  }

  getAllRelationalBottlenecks(): RelationalBottleneckRecord[] {
    return this.readTable<RelationalBottleneckRecord>('report_bottlenecks');
  }

  getAllRelationalTasks(): RelationalTaskRecord[] {
    return this.readTable<RelationalTaskRecord>('report_tasks');
  }

  getMetricsByAuthorityAndPeriod(authority?: string, fromDate?: string, toDate?: string): RelationalMetricRecord[] {
    let metrics = this.getAllRelationalMetrics();
    if (authority) {
      const a = authority.toLowerCase();
      metrics = metrics.filter(m => m.issuing_authority.toLowerCase().includes(a));
    }
    if (fromDate) {
      metrics = metrics.filter(m => !m.issuance_date || m.issuance_date >= fromDate);
    }
    if (toDate) {
      metrics = metrics.filter(m => !m.issuance_date || m.issuance_date <= toDate);
    }
    return metrics;
  }
}

