import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { ProcessDocumentUseCase } from '../use-cases/process-document.use-case.js';
import { ExportReportUseCase, formatContentDispositionHeader } from '../use-cases/export-report.use-case.js';
import { AdministrativeOntologyService } from '../services/administrative-ontology.service.js';
import { BatchQueueService } from '../services/batch-queue.service.js';
import { WarehouseStorageService } from '../services/warehouse-storage.service.js';
import { CrossDocumentAnalyticsService } from '../services/cross-document-analytics.service.js';

const ExtractRequestSchema = z.object({
  filePath: z.string().min(1, 'filePath is required')
});

const SyncRequestSchema = z.object({
  reportData: z.record(z.any()),
  rawText: z.string().optional()
});

/**
 * Tự động dọn dẹp file tạm cũ trong thư mục uploads (chống tràn đĩa cứng)
 * Chỉ xóa các file tạm sinh ra từ endpoint upload (có prefix timestamp 13 số), bảo vệ an toàn fixtures
 */
function cleanupOldUploads(dir: string, maxAgeMs = 2 * 3600 * 1000): void {
  try {
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    const files = fs.readdirSync(dir);
    for (const file of files) {
      // Chỉ dọn các file có timestamp upload (ví dụ 1787123456789_filename.pdf)
      if (!/^\d{13}_/.test(file)) continue;
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Bỏ qua nếu file đang bị lock
      }
    }
  } catch {
    // Bỏ qua lỗi đọc thư mục
  }
}

/**
 * Kiểm tra đường dẫn có nằm an toàn trong danh sách các thư mục cho phép hay không.
 * Phòng chống tấn công Path Traversal và Sibling Directory Prefix Escapes (ví dụ uploads_fake, uploads-leak).
 */
export function isPathInsideAllowedRoots(targetPath: string, allowedRoots: string[]): boolean {
  const resolved = path.resolve(targetPath);
  return allowedRoots.some(root => {
    const resolvedRoot = path.resolve(root);
    const rel = path.relative(resolvedRoot, resolved);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

export const reportOcrRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const processDocumentUseCase = new ProcessDocumentUseCase();
  const exportReportUseCase = new ExportReportUseCase();
  const batchQueueService = new BatchQueueService({ processDocumentUseCase });
  const warehouseStorageService = new WarehouseStorageService();
  const analyticsService = new CrossDocumentAnalyticsService(warehouseStorageService);

  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Chạy dọn dẹp file rác khi khởi động
  cleanupOldUploads(uploadsDir);

  // 1. Healthcheck Endpoint
  fastify.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Kiểm tra trạng thái máy chủ (Healthcheck)',
      description: 'Trả về trạng thái hoạt động của Động cơ Nạp & Xuất Chuẩn Dữ Liệu Gốc'
    }
  }, async () => {
    return { status: 'healthy', mode: 'GROUND_TRUTH_DETERMINISTIC', timestamp: new Date().toISOString(), version: '3.0.0-ground-truth' };
  });

  // 2. Upload file PDF / Word (.docx) và Nạp Bóc Tách Dữ Liệu Gốc
  fastify.post('/reports/upload', {
    validatorCompiler: () => () => true,
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Nạp và Bóc Tách Dữ Liệu Gốc Báo Cáo PDF / Word (.docx)',
      description: 'Nhận file PDF hoặc Word (.docx), trích xuất nguyên bản toàn bộ text, phân đoạn layout blocks, tọa độ bbox và ma trận bảng biểu.'
    }
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: 'NO_FILE_UPLOADED', message: 'Vui lòng chọn file PDF hoặc Word (.docx) để tải lên.' });
    }

    const filename = `${Date.now()}_${data.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const targetPath = path.join(uploadsDir, filename);

    await pipeline(data.file, fs.createWriteStream(targetPath));

    try {
      // Thực thi ProcessDocumentUseCase
      const { rankedIR, parsedDoc, processingTimeMs } = await processDocumentUseCase.execute(targetPath);

      return reply.send({
        success: true,
        data: rankedIR,
        raw_pages: parsedDoc.pages.map(p => ({
          pageNumber: p.pageNumber,
          charCount: p.charCount,
          text: p.text,
          blocks: p.blocks,
          words: p.words,
          tables: p.tables,
          tablesCount: p.tables.length
        })),
        tables: parsedDoc.tables,
        evidence_ir: parsedDoc.evidenceIR,
        watermarks_detected: parsedDoc.watermarks_detected || [],
        meta: {
          processing_time_ms: processingTimeMs,
          total_pages: parsedDoc.totalPages,
          total_chars: parsedDoc.totalChars,
          is_scanned: parsedDoc.isScanned,
          uploaded_file: filename
        }
      });
    } catch (err: any) {
      // Dọn dẹp file tạm khi pipeline gặp lỗi
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch (cleanupErr: any) {
        fastify.log.warn(`Không thể xóa file tạm ${targetPath}: ${cleanupErr?.message || cleanupErr}`);
      }
      fastify.log.error(err);
      return reply.status(500).send({
        success: false,
        error: 'INGESTION_PIPELINE_ERROR',
        message: err.message
      });
    }
  });

  // 3. Danh sách 50 mẫu báo cáo thực tế
  fastify.get('/reports/samples', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Lấy danh sách các tài liệu mẫu thực tế',
      description: 'Trả về danh sách 50 file PDF/Word mẫu phục vụ kiểm thử nhanh'
    }
  }, async () => {
    const candidateDirs: string[] = [
      path.resolve(__dirname, '../../dataset-50-real-reports'),
      process.env.SAMPLES_DIR || '',
      path.resolve(__dirname, '../../samples')
    ].filter((p): p is string => Boolean(p) && fs.existsSync(p));

    if (candidateDirs.length === 0) {
      return { success: false, message: 'Thư mục tài liệu mẫu không tồn tại', files: [] };
    }

    const sampleDir = candidateDirs[0];
    const files = fs.readdirSync(sampleDir)
      .filter(f => f.toLowerCase().endsWith('.pdf') || f.toLowerCase().endsWith('.docx'))
      .map((f, idx) => ({
        id: `sample-${idx + 1}`,
        name: f,
        path: path.join(sampleDir, f),
        sizeKb: Math.round(fs.statSync(path.join(sampleDir, f)).size / 1024)
      }));

    return { success: true, count: files.length, files };
  });

  // 4. Nạp và bóc tách theo đường dẫn file có sẵn trên máy chủ
  fastify.post('/reports/extract-by-path', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Nạp và bóc tách dữ liệu gốc theo đường dẫn file trên Server',
      description: 'Nhận đường dẫn tuyệt đối của file PDF hoặc Word (.docx) trên máy chủ để nạp trực tiếp'
    }
  }, async (request, reply) => {
    const parseResult = ExtractRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format()
      });
    }

    const { filePath } = parseResult.data;
    const resolvedPath = path.resolve(filePath);
    const allowedRoots = [
      uploadsDir,
      path.resolve(__dirname, '../../dataset-50-real-reports')
    ];

    const isSandboxSafe = isPathInsideAllowedRoots(resolvedPath, allowedRoots);
    if (!isSandboxSafe) {
      return reply.status(403).send({
        success: false,
        error: 'FORBIDDEN_PATH_ACCESS',
        message: 'Truy cập bị từ chối: Đường dẫn file nằm ngoài phạm vi thư mục được cấp phép trên hệ thống (Sandbox Security Protection).'
      });
    }

    if (!fs.existsSync(resolvedPath)) {
      return reply.status(404).send({
        success: false,
        error: 'FILE_NOT_FOUND',
        message: `File không tồn tại tại đường dẫn: ${filePath}`
      });
    }

    try {
      const { rankedIR, parsedDoc, processingTimeMs } = await processDocumentUseCase.execute(resolvedPath);

      return reply.send({
        success: true,
        data: rankedIR,
        raw_pages: parsedDoc.pages.map(p => ({
          pageNumber: p.pageNumber,
          charCount: p.charCount,
          text: p.text,
          blocks: p.blocks,
          words: p.words,
          tables: p.tables,
          tablesCount: p.tables.length
        })),
        tables: parsedDoc.tables,
        evidence_ir: parsedDoc.evidenceIR,
        watermarks_detected: parsedDoc.watermarks_detected || [],
        meta: {
          processing_time_ms: processingTimeMs,
          total_pages: parsedDoc.totalPages,
          total_chars: parsedDoc.totalChars,
          is_scanned: parsedDoc.isScanned,
          uploaded_file: path.basename(resolvedPath)
        }
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({
        success: false,
        error: 'INGESTION_PIPELINE_ERROR',
        message: err.message
      });
    }
  });

  // 4b. Tạo Batch xử lý hàng đợi ngầm nhiều tài liệu (Bounded Batch Queue)
  fastify.post('/reports/batch', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Đưa danh sách tài liệu vào hàng đợi xử lý ngầm có giới hạn đồng thời',
      description: 'Nhận mảng filePaths, đưa vào BatchQueueService và trả về batchId để theo dõi tiến độ'
    }
  }, async (request, reply) => {
    const body: any = request.body || {};
    const filePaths: string[] = body.filePaths || [];

    try {
      const summary = batchQueueService.createBatch(filePaths);
      return reply.send({ success: true, batch: summary });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: 'BATCH_CREATION_FAILED', message: err.message });
    }
  });

  // 4c. Truy vấn trạng thái tiến độ thời gian thực của một Batch
  fastify.get('/reports/batch/:batchId', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Lấy trạng thái và tiến độ xử lý của một Batch',
      description: 'Trả về chi tiết số job hoàn thành, đang chạy, lỗi và kết quả IR'
    }
  }, async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const summary = batchQueueService.getBatchStatus(batchId);

    if (!summary) {
      return reply.status(404).send({ success: false, error: 'BATCH_NOT_FOUND', message: `Không tìm thấy batch với ID: ${batchId}` });
    }

    return reply.send({ success: true, batch: summary });
  });

  // 4d. Giám sát tài nguyên và metrics hàng đợi
  fastify.get('/reports/batch/metrics', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Lấy số liệu giám sát hàng đợi (Queue Metrics)',
      description: 'Trả về số worker đang chạy, số batch đang kích hoạt và giới hạn an toàn'
    }
  }, async () => {
    return { success: true, metrics: batchQueueService.getQueueMetrics() };
  });

  // 5. Đồng bộ Dữ Liệu Gốc vào Kho Dữ Liệu Điều Hành KGLVS (Lưu trữ bền vững)
  fastify.post('/reports/sync-to-warehouse', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Đồng bộ kết quả bóc tách dữ liệu gốc vào Kho Dữ Liệu Điều Hành (Bền vững)',
      description: 'Lưu trữ bản ghi báo cáo đã được số hóa vào cơ sở dữ liệu kho bền vững'
    }
  }, async (request, reply) => {
    const parseResult = SyncRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format()
      });
    }

    const { reportData, rawText } = parseResult.data;
    const syncRecord = warehouseStorageService.saveReport(reportData, rawText);

    return reply.send({
      success: true,
      message: 'Đã số hóa và đồng bộ thành công dữ liệu gốc vào Kho Dữ liệu KGLVS!',
      syncRecord
    });
  });

  // 5b. Truy vấn danh mục các báo cáo đã lưu trong Kho Dữ Liệu
  fastify.get('/reports/warehouse', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Truy vấn danh mục báo cáo trong Kho Dữ Liệu Điều Hành',
      description: 'Trả về danh sách các báo cáo đã được lưu trữ bền vững trong Kho Dữ Liệu KGLVS'
    }
  }, async (request, reply) => {
    const query: any = request.query || {};
    const result = warehouseStorageService.listReports({
      domain: query.domain,
      authority: query.authority,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0
    });
    return reply.send({ success: true, ...result });
  });

  // 5c. Lấy chi tiết một báo cáo trong Kho Dữ Liệu theo ID
  fastify.get('/reports/warehouse/:recordId', {
    schema: {
      tags: ['Reports Ingestion'],
      summary: 'Lấy chi tiết dữ liệu gốc một báo cáo trong Kho',
      description: 'Trả về toàn bộ IR và văn bản gốc của một bản ghi đã lưu'
    }
  }, async (request, reply) => {
    const { recordId } = request.params as { recordId: string };
    const record = warehouseStorageService.getReportById(recordId);
    if (!record) {
      return reply.status(404).send({ success: false, error: 'RECORD_NOT_FOUND', message: `Không tìm thấy bản ghi với ID: ${recordId}` });
    }
    return reply.send({ success: true, data: record });
  });

  // 5d. API Phân tích Xu Hướng Chỉ Số KPI (Longitudinal KPI Trends)
  fastify.get('/analytics/kpi-trends', {
    schema: {
      tags: ['Executive Analytics'],
      summary: 'Phân tích Xu Hướng Chỉ Số KPI Xuyên Báo Cáo',
      description: 'Gom nhóm và theo dõi biến động chỉ số theo cơ quan và chuỗi thời gian dọc'
    }
  }, async (request, reply) => {
    const query: any = request.query || {};
    const trends = analyticsService.getKpiTrends({
      indicatorName: query.indicator,
      authority: query.authority
    });
    return reply.send({ success: true, count: trends.length, data: trends });
  });

  // 5e. API Bản Đồ Nhiệt Điểm Nghẽn Hệ Thống (Systemic Bottleneck Heatmap)
  fastify.get('/analytics/bottleneck-heatmap', {
    schema: {
      tags: ['Executive Analytics'],
      summary: 'Bản Đồ Nhiệt Điểm Nghẽn & Khó Khăn Vướng Mắc Toàn Hệ Thống',
      description: 'Phân tích tần suất các nguyên nhân gốc rễ và điểm nghẽn theo nhóm lĩnh vực trên toàn bộ đơn vị trực thuộc'
    }
  }, async (request, reply) => {
    const heatmap = analyticsService.getSystemicBottleneckHeatmap();
    return reply.send({ success: true, count: heatmap.length, data: heatmap });
  });

  // 5f. API So Sánh Đối Đầu 2 Báo Cáo (Period-over-Period Reconciliation)
  fastify.get('/analytics/period-comparison', {
    schema: {
      tags: ['Executive Analytics'],
      summary: 'So Sánh Đối Đầu 2 Kỳ Báo Cáo',
      description: 'So sánh chỉ số, chênh lệch thực hiện và đối soát nhiệm vụ cam kết giữa 2 báo cáo'
    }
  }, async (request, reply) => {
    const query: any = request.query || {};
    const { reportIdA, reportIdB } = query;
    if (!reportIdA || !reportIdB) {
      return reply.status(400).send({
        success: false,
        error: 'MISSING_PARAMS',
        message: 'Cần cung cấp đủ 2 tham số: reportIdA và reportIdB để so sánh đối đầu.'
      });
    }
    const comparison = analyticsService.comparePeriods(reportIdA, reportIdB);
    if (!comparison) {
      return reply.status(404).send({
        success: false,
        error: 'REPORT_NOT_FOUND',
        message: 'Không tìm thấy một trong hai báo cáo cần so sánh trong kho dữ liệu.'
      });
    }
    return reply.send({ success: true, data: comparison });
  });

  // 5g. API Thẻ Tổng Quan Điều Hành Lãnh Đạo (Executive Summary KPI Cards)
  fastify.get('/analytics/executive-summary', {
    schema: {
      tags: ['Executive Analytics'],
      summary: 'Thẻ Tổng Quan Điều Hành Cho Màn Hình Chào Lãnh Đạo',
      description: 'Tổng hợp số lượng báo cáo, chỉ số theo dõi, cảnh báo đỏ và điểm nghẽn hệ thống'
    }
  }, async (request, reply) => {
    const summary = analyticsService.getExecutiveSummary();
    return reply.send({ success: true, data: summary });
  });

  // 6. Danh Mục Lĩnh Vực Hành Chính (Taxonomy Catalog)
  fastify.get('/reports/taxonomy', {
    schema: {
      tags: ['System'],
      summary: 'Lấy Danh mục Phân loại Hành chính Tiêu chuẩn (60+ Lĩnh vực)',
      description: 'Trả về bảng taxonomy chuẩn theo Quyết định 28/2018/QĐ-TTg.'
    }
  }, async () => {
    const taxonomies = AdministrativeOntologyService.getAllTaxonomies();
    return { success: true, count: taxonomies.length, data: taxonomies };
  });

  // 7. Xuất Dữ Liệu Gốc Ra File Word (.docx) Chuẩn Nghị Định 30/2020/NĐ-CP
  fastify.post('/reports/export/docx', {
    schema: {
      tags: ['Document Export'],
      summary: 'Xuất Dữ Liệu Gốc ra Word (.docx) Chuẩn Nghị Định 30/2020/NĐ-CP',
      description: 'Nhận ExecutiveReportIR JSON và tạo file Word (.docx) chứa đúng văn bản và toàn bộ bảng biểu gốc'
    }
  }, async (request, reply) => {
    const parseResult = SyncRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format()
      });
    }

    try {
      const { reportData, rawText } = parseResult.data;
      const result = await exportReportUseCase.exportDocx(reportData as any, rawText);

      reply.header('Content-Type', result.contentType);
      reply.header('Content-Disposition', formatContentDispositionHeader(result.filename));
      return reply.send(result.content);
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ success: false, error: 'DOCX_EXPORT_ERROR', message: err.message });
    }
  });

  // 8. Xuất Dữ Liệu Gốc Ra File PDF (.pdf)
  fastify.post('/reports/export/pdf', {
    schema: {
      tags: ['Document Export'],
      summary: 'Xuất Dữ Liệu Gốc ra PDF (.pdf)',
      description: 'Nhận ExecutiveReportIR JSON và tạo file PDF báo cáo dữ liệu gốc trực quan'
    }
  }, async (request, reply) => {
    const parseResult = SyncRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(422).send({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.format()
      });
    }

    try {
      const { reportData, rawText } = parseResult.data;
      const result = await exportReportUseCase.exportPdf(reportData as any, rawText);

      reply.header('Content-Type', result.contentType);
      reply.header('Content-Disposition', formatContentDispositionHeader(result.filename));
      return reply.send(result.content);
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ success: false, error: 'PDF_EXPORT_ERROR', message: err.message });
    }
  });

  // 9. Xuất Toàn Bộ Bảng Dữ Liệu Gốc Ra CSV (.csv)
  fastify.post('/reports/export/tables-csv', {
    schema: {
      tags: ['Document Export'],
      summary: 'Xuất Toàn Bộ Bảng Dữ Liệu Gốc ra CSV (.csv)',
      description: 'Nhận danh sách tables và trả về file CSV UTF-8 tương thích mở trên Excel'
    }
  }, async (request, reply) => {
    const body: any = request.body || {};
    const tables = body.tables || (body.reportData && body.reportData.level2_details && body.reportData.level2_details.tables) || [];
    const rawTitle = (body.reportData && body.reportData.metadata && body.reportData.metadata.document_title) || 'Bang_So_Lieu_Goc';

    try {
      const result = exportReportUseCase.exportCsv(tables, rawTitle);

      reply.header('Content-Type', result.contentType);
      reply.header('Content-Disposition', formatContentDispositionHeader(result.filename));
      return reply.send(result.content);
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ success: false, error: 'CSV_EXPORT_ERROR', message: err.message });
    }
  });

  // 10. Xuất Toàn Bộ Cây Dữ Liệu Gốc Ra File JSON (.json)
  fastify.post('/reports/export/raw-json', {
    schema: {
      tags: ['Document Export'],
      summary: 'Xuất Toàn Bộ Cây Dữ Liệu Gốc ra file JSON (.json)',
      description: 'Nhận reportData và trả về file JSON tải xuống trực tiếp'
    }
  }, async (request, reply) => {
    const body: any = request.body || {};
    const reportData = body.reportData || body;

    try {
      const result = exportReportUseCase.exportJson(reportData);

      reply.header('Content-Type', result.contentType);
      reply.header('Content-Disposition', formatContentDispositionHeader(result.filename));
      return reply.send(result.content);
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ success: false, error: 'JSON_EXPORT_ERROR', message: err.message });
    }
  });
};
