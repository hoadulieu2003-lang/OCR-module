import { DocumentExportService } from '../services/document-export.service.js';
import { ExecutiveReportIR, CoreTable } from '../schemas/report-ir.schema.js';

export interface ExportResult<T = Buffer | string> {
  content: T;
  filename: string;
  contentType: string;
}

/**
 * Format tên file tải xuống chuẩn hoá
 */
export function formatExecutiveDownloadFilename(rawTitle: string, ext: 'docx' | 'pdf' | 'csv' | 'json'): string {
  const base = (rawTitle || 'Bao_Cao_Du_Lieu_Goc')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50)
    .replace(/^_|_$/g, '');
  return `${base}_DU_LIEU_GOC.${ext}`;
}

/**
 * Format header Content-Disposition chuẩn RFC 5987 / RFC 6266
 */
export function formatContentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const encodedUtf8 = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
}

/**
 * Use Case: Quản lý và thực hiện xuất báo cáo đa định dạng (DOCX, PDF, CSV, JSON)
 */
export class ExportReportUseCase {
  private documentExporter: DocumentExportService;

  constructor(documentExporter?: DocumentExportService) {
    this.documentExporter = documentExporter || new DocumentExportService();
  }

  async exportDocx(reportData: ExecutiveReportIR, rawText?: string): Promise<ExportResult<Buffer>> {
    const buffer = await this.documentExporter.exportToDocx(reportData, rawText);
    const rawTitle = reportData.metadata?.document_title || 'Báo Cáo Dữ Liệu Gốc';
    const filename = formatExecutiveDownloadFilename(rawTitle, 'docx');

    return {
      content: buffer,
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  }

  async exportPdf(reportData: ExecutiveReportIR, rawText?: string): Promise<ExportResult<Buffer>> {
    const buffer = await this.documentExporter.exportToPdf(reportData, rawText);
    const rawTitle = reportData.metadata?.document_title || 'Báo Cáo Dữ Liệu Gốc';
    const filename = formatExecutiveDownloadFilename(rawTitle, 'pdf');

    return {
      content: buffer,
      filename,
      contentType: 'application/pdf'
    };
  }

  exportCsv(tables: CoreTable[], rawTitle: string = 'Bang_So_Lieu_Goc'): ExportResult<string> {
    const content = this.documentExporter.exportTablesToCsv(tables);
    const filename = formatExecutiveDownloadFilename(rawTitle, 'csv');

    return {
      content,
      filename,
      contentType: 'text/csv; charset=utf-8'
    };
  }

  exportJson(reportData: any): ExportResult<string> {
    const rawTitle = (reportData.metadata && reportData.metadata.document_title) || 'Du_Lieu_Goc_KGLVS';
    const filename = formatExecutiveDownloadFilename(rawTitle, 'json');
    const content = JSON.stringify(reportData, null, 2);

    return {
      content,
      filename,
      contentType: 'application/json; charset=utf-8'
    };
  }
}
