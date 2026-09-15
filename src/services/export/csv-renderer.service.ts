import { CoreTable } from '../../schemas/report-ir.schema.js';
import { sanitizeCsvCell } from './text-cleaner.js';

/**
 * Renderer chuyên biệt xuất bảng dữ liệu gốc ra CSV (UTF-8 BOM, an toàn CSV Formula Injection)
 */
export class CsvRendererService {
  render(tables: CoreTable[]): string {
    if (!tables || tables.length === 0) {
      return '\uFEFFKhông có bảng biểu nào được trích xuất trong tài liệu này.';
    }

    const csvSections: string[] = ['\uFEFF']; // UTF-8 BOM

    tables.forEach((tbl, idx) => {
      const title = tbl.table_title ? tbl.table_title.replace(/"/g, '""') : 'Bảng số liệu';
      csvSections.push(`"=== BẢNG ${idx + 1}: ${title} (Trang ${tbl.page_ref || 1}) ==="`);

      if (tbl.headers && tbl.headers.length > 0) {
        const headerLine = tbl.headers.map(h => sanitizeCsvCell(h)).join(',');
        csvSections.push(headerLine);
      }

      if (tbl.rows && tbl.rows.length > 0) {
        tbl.rows.forEach(row => {
          const rowLine = row.map(cell => sanitizeCsvCell(cell)).join(',');
          csvSections.push(rowLine);
        });
      }

      csvSections.push('');
      csvSections.push('');
    });

    return csvSections.join('\r\n');
  }
}
