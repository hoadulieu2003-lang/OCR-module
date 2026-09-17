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

    const grid = headers.length > 0 ? [headers, ...rows] : rows;
    const flatFirstRow = (headers.length > 0 ? headers.join(' ') : (rows[0] ? rows[0].join(' ') : '')).toUpperCase();
    const flatAllText = [headers.join(' '), ...rows.map((r: string[]) => r.join(' '))].join(' ').toUpperCase();

    // 1. Header hành chính (Quốc hiệu / Cơ quan ban hành)
    const headerKeywords = [
      'CỘNG HÒA XÃ HỘI', 'CỘNG HOÀ XÃ HỘI', 'ĐỘC LẬP - TỰ DO', 'ĐỘC LẬP – TỰ DO', 'ĐỘC LẬP',
      'ỦY BAN NHÂN DÂN', 'UỶ BAN NHÂN DÂN', 'HỘI ĐỒNG NHÂN DÂN', 'SỐ:'
    ];
    if (headerKeywords.some(kw => flatAllText.includes(kw)) && rowsCnt <= 4) {
      if ((flatAllText.includes('CỘNG HÒA') || flatAllText.includes('CỘNG HOÀ')) && flatAllText.includes('ĐỘC LẬP')) {
        return false;
      }
      if (headerKeywords.some(kw => flatFirstRow.includes(kw)) && rowsCnt <= 3) {
        return false;
      }
    }

    // 2. Tiêu đề hoặc Ký duyệt văn bản bị chia cột
    const titleKeywords = ['BÁO CÁO', 'PHIẾU TRÌNH', 'TỜ TRÌNH', 'KẾ HOẠCH', 'PHẦN THỨ', 'KÍNH GỬI', 'NƠI NHẬN', 'TM. ỦY BAN', 'CHỦ TỊCH', 'PHÓ CHỦ TỊCH'];
    if (rowsCnt <= 2 && titleKeywords.some(tk => flatAllText.includes(tk))) return false;
    if (['NƠI NHẬN', 'TM. ỦY BAN'].some(tk => flatFirstRow.includes(tk))) return false;

    // 3. Phân bố ô & cột
    const colFilled = new Array(colsCnt).fill(0);
    const colChars = new Array(colsCnt).fill(0);
    let numericCells = 0;
    let totalNonEmpty = 0;
    let bulletCells = 0;

    for (const r of grid) {
      for (let c = 0; c < Math.min(r.length, colsCnt); c++) {
        const val = String(r[c] || '').trim();
        if (val) {
          totalNonEmpty++;
          colFilled[c]++;
          colChars[c] += val.length;
          if (/^[0-9]+([.,][0-9]+)?%?$/.test(val) || ['-', '—', 'x', 'X'].includes(val)) {
            numericCells++;
          }
          if (/^[-+*•]\s+/.test(val)) {
            bulletCells++;
          }
        }
      }
    }

    const totalChars = colChars.reduce((a, b) => a + b, 0);
    if (totalChars < 15 || totalNonEmpty < 4) return false;

    // Nếu có từ 2 cột trở lên hoàn toàn rỗng hoặc >= 35% số cột bị rỗng hoàn toàn
    const emptyCols = colFilled.filter(cnt => cnt === 0).length;
    if (emptyCols >= 2 || (emptyCols > 0 && emptyCols / colsCnt >= 0.35)) {
      return false;
    }

    // Nếu có từ 2 ô trở lên bắt đầu bằng ký tự gạch đầu dòng liệt kê (danh sách đoạn văn)
    if (bulletCells >= 2) {
      return false;
    }

    // Nếu hàng đầu tiên chứa câu văn xuôi dài bắt đầu bằng giới từ hoặc cụm từ hành chính
    if (grid[0]?.some((c: any) => {
      const s = String(c || '').trim();
      return s.length > 50 && /^(Tính từ|Căn cứ|Thực hiện|Đánh giá|Theo|UBND|Tại|Sau khi)\b/i.test(s);
    })) {
      return false;
    }

    // Bảng 2 hàng (Header + 1 hàng dữ liệu hoặc Hàng nối tiếp tràn trang):
    if (rowsCnt === 2) {
      if (numericCells < 2) return false;
      const firstCell = String(grid[0]?.[0] || '').trim();
      const secondCell = String(grid[1]?.[0] || '').trim();
      if (!firstCell && !/^\d+\.?$/.test(secondCell)) return false;
      if (/^([-+*•]|\d+\.|\([a-z0-9]+\)|[a-zà-ỹ]\))\s+/i.test(firstCell) || /^[a-zà-ỹ]/.test(firstCell)) {
        return false;
      }
    }

    // Functional columns: Cột có dữ liệu ở ít nhất minFill hàng và có >= 5 ký tự hoặc là số
    const minFill = rowsCnt <= 2 ? 1 : Math.max(2, Math.floor(rowsCnt * 0.25));
    const functionalCols = colFilled.filter((fill, c) => fill >= minFill && (colChars[c] >= 5 || fill >= 2)).length;
    if (functionalCols < 2) return false;

    // 4. Kiểm tra mức độ bất cân xứng (Một cột chiếm hầu hết nội dung)
    const maxColChar = Math.max(...colChars);
    const ratio = maxColChar / totalChars;
    const dominantCol = colChars.indexOf(maxColChar);

    if (ratio > 0.75) {
      const otherColsFilled = colFilled.filter((_, c) => c !== dominantCol);
      const otherColsChars = totalChars - maxColChar;
      const maxOtherFill = otherColsFilled.length > 0 ? Math.max(...otherColsFilled) : 0;
      if ((maxOtherFill / rowsCnt < 0.35 && numericCells < 2) || otherColsChars < 20) {
        return false;
      }
    }

    // 5. Kiểm tra dạng văn xuôi (Narrative prose check)
    const domFirstCell = String(grid[0]?.[dominantCol] || '').trim();
    if (domFirstCell.length > 40 && /^([-+*•]|\d+\.|\([a-z0-9]+\)|[a-zà-ỹ]\))\s+/i.test(domFirstCell)) {
      return false;
    }
    if (domFirstCell.length > 60 && /^[a-zà-ỹ]/.test(domFirstCell)) {
      return false;
    }

    // Mật độ ô không được quá rỗng (< 20%)
    const totalCells = rowsCnt * colsCnt;
    const density = totalNonEmpty / totalCells;
    if (density < 0.20) return false;

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
