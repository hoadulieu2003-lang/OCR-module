import { CoreTable } from '../schemas/report-ir.schema.js';
import { EvidenceTable, EvidenceTableCell } from '../schemas/document-evidence.schema.js';
import { TableValidatorService, TableAuditReport } from './table-validator.service.js';

export interface StructuredTableMatrix {
  table_id: string;
  page_ref: number;
  table_title: string | null;
  headers: string[];
  header_tree?: Record<string, any>;
  rows: string[][];
  row_count: number;
  col_count: number;
  bbox?: number[];
  audit_report: TableAuditReport;
  markdown_table: string;
  cells: EvidenceTableCell[];
}

export class TableMatrixService {
  /**
   * Bộ lọc chất lượng bảng dữ liệu hành chính
   */
  static isValidDataTable(rawTable: any): boolean {
    if (!rawTable) return false;
    const headers = rawTable.headers || [];
    const rows = rawTable.rows || [];
    const rowsCnt = rows.length + (headers.length > 0 ? 1 : 0);
    const colsCnt = headers.length || (rows[0] ? rows[0].length : 0);

    if (rowsCnt < 2 || colsCnt < 2 || colsCnt > 16) return false;

    const flatFirstRow = (headers.length > 0 ? headers.join(' ') : (rows[0] ? rows[0].join(' ') : '')).toUpperCase();
    const flatAllText = [headers.join(' '), ...rows.map((r: string[]) => r.join(' '))].join(' ').toUpperCase();

    const headerKeywords = [
      'CỘNG HÒA XÃ HỘI', 'ĐỘC LẬP - TỰ DO', 'ĐỘC LẬP – TỰ DO',
      'ỦY BAN NHÂN DÂN', 'UỶ BAN NHÂN DÂN', 'HỘI ĐỒNG NHÂN DÂN', 'SỐ:'
    ];
    if (headerKeywords.some(kw => flatFirstRow.includes(kw)) && rowsCnt <= 3) return false;

    const titleKeywords = ['BÁO CÁO', 'PHIẾU TRÌNH', 'TỜ TRÌNH', 'KẾ HOẠCH', 'PHẦN THỨ', 'KÍNH GỬI', 'NƠI NHẬN'];
    if (rowsCnt <= 2 && titleKeywords.some(tk => flatAllText.includes(tk))) return false;

    const nonEmpties: string[] = [];
    let numericCount = 0;
    const allCells = [...headers, ...rows.flat()];
    for (const c of allCells) {
      const s = String(c || '').trim();
      if (s) {
        nonEmpties.push(s);
        if (/\d+/.test(s) || ['-', '—', 'x', 'X', '%'].includes(s)) numericCount++;
      }
    }

    if (nonEmpties.length < 4) return false;

    const avgLen = nonEmpties.reduce((sum, c) => sum + c.length, 0) / nonEmpties.length;
    if (avgLen <= 3 && colsCnt >= 4 && rowsCnt <= 2) return false;

    const totalCells = rowsCnt * colsCnt;
    const density = nonEmpties.length / totalCells;
    if (density < 0.25) return false;

    if (rowsCnt === 2 && numericCount < 2 && density < 0.5) return false;

    return true;
  }

  /**
   * Tái tạo ma trận bảng đa cấp và kiểm toán số học
   */
  processTable(rawTable: EvidenceTable | CoreTable): StructuredTableMatrix {
    const tableId = (rawTable as any).table_id || `table-${Date.now()}`;
    const pageRef = (rawTable as any).page_number || (rawTable as any).page_ref || 1;
    const title = (rawTable as any).title || (rawTable as any).table_title || null;
    const headers = ((rawTable as any).headers || []).map((h: string) => this.cleanCellText(h));
    const rawRows = (rawTable as any).rows || [];

    // 1. Làm sạch text từng ô
    const cleanRows: string[][] = rawRows.map((row: string[]) =>
      row.map(cell => this.cleanCellText(cell))
    );

    // 2. Tái tạo cây Header phân cấp (nếu có cột chứa dấu / hoặc gạch chéo)
    const headerTree = this.buildHeaderTree(headers);

    // 3. Chạy Kiểm toán Số học tự động
    const auditReport = TableValidatorService.validate({
      table_id: tableId,
      headers,
      rows: cleanRows
    });

    // 4. Sinh định dạng Markdown Table chuẩn
    const markdownTable = this.toMarkdown(headers, cleanRows);

    // 5. Chuẩn hóa danh sách Cells
    const cells: EvidenceTableCell[] = ((rawTable as any).cells || []).map((c: any) => ({
      cell_id: c.cell_id,
      row_index: c.row_index,
      col_index: c.col_index,
      row_span: c.row_span || 1,
      col_span: c.col_span || 1,
      raw_text: this.cleanCellText(c.raw_text),
      confidence: c.confidence || 0.98,
      bbox: c.bbox
    }));

    return {
      table_id: tableId,
      page_ref: pageRef,
      table_title: title,
      headers,
      header_tree: headerTree,
      rows: cleanRows,
      row_count: cleanRows.length,
      col_count: headers.length,
      bbox: (rawTable as any).bbox,
      audit_report: auditReport,
      markdown_table: markdownTable,
      cells
    };
  }

  /**
   * Tách và làm sạch watermark / ký tự rác trong ô
   */
  private cleanCellText(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .replace(/\r\n/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Xây dựng cây tiêu đề phân cấp
   */
  private buildHeaderTree(headers: string[]): Record<string, any> {
    const tree: Record<string, any> = {};

    headers.forEach((h, idx) => {
      if (h.includes(' - ') || h.includes(' / ')) {
        const parts = h.split(/[-/]/).map(p => p.trim());
        const parent = parts[0];
        const child = parts.slice(1).join(' - ');
        if (!tree[parent]) tree[parent] = [];
        tree[parent].push({ colIndex: idx, label: child });
      } else {
        tree[h] = { colIndex: idx, label: h };
      }
    });

    return tree;
  }

  /**
   * Chuyển đổi thành Markdown Table
   */
  private toMarkdown(headers: string[], rows: string[][]): string {
    if (headers.length === 0) return '';
    const headerLine = `| ${headers.join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const rowLines = rows.map(r => `| ${r.join(' | ')} |`);
    return [headerLine, separatorLine, ...rowLines].join('\n');
  }
}
