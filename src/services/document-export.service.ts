import { ExecutiveReportIR, CoreTable } from '../schemas/report-ir.schema.js';
import { DocxRendererService } from './export/docx-renderer.service.js';
import { PdfRendererService } from './export/pdf-renderer.service.js';
import { CsvRendererService } from './export/csv-renderer.service.js';
import {
  ExecutiveTextCleaner,
  AdministrativeDataProcessor,
  sanitizeCsvCell,
  calculateTableColumnWidths
} from './export/text-cleaner.js';

// Re-export helpers for backward compatibility
export {
  ExecutiveTextCleaner,
  AdministrativeDataProcessor,
  sanitizeCsvCell,
  calculateTableColumnWidths
};

/**
 * Service Xuất Dữ Liệu Gốc Đa Định Dạng Chuẩn Nghị Định 30/2020/NĐ-CP (Facade Orchestrator)
 */
export class DocumentExportService {
  private docxRenderer: DocxRendererService;
  private pdfRenderer: PdfRendererService;
  private csvRenderer: CsvRendererService;

  constructor() {
    this.docxRenderer = new DocxRendererService();
    this.pdfRenderer = new PdfRendererService();
    this.csvRenderer = new CsvRendererService();
  }

  /**
   * 1. Xuất file Microsoft Word (.docx) Chuẩn Nghị định 30/2020/NĐ-CP
   */
  async exportToDocx(ir: ExecutiveReportIR, rawFullText?: string): Promise<Buffer> {
    return this.docxRenderer.render(ir, rawFullText);
  }

  /**
   * 2. Xuất file PDF (.pdf) Chuẩn Nghị định 30/2020/NĐ-CP (Hỗ trợ 100% Tiếng Việt UTF-8 & Vector Tables)
   */
  async exportToPdf(ir: ExecutiveReportIR, rawFullText?: string): Promise<Buffer> {
    return this.pdfRenderer.render(ir, rawFullText);
  }

  /**
   * 3. Xuất toàn bộ bảng dữ liệu gốc ra CSV (UTF-8 BOM tương thích Excel, đã sanitize Formula Injection)
   */
  exportTablesToCsv(tables: CoreTable[]): string {
    return this.csvRenderer.render(tables);
  }

  /**
   * Helper sanitize CSV cell
   */
  public sanitizeCsvCell(value: unknown): string {
    return sanitizeCsvCell(value);
  }
}
