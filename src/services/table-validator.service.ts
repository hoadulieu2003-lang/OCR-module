export interface TableAuditFinding {
  type: 'SUM_MISMATCH' | 'PERCENTAGE_MISMATCH' | 'UNIT_INCONSISTENCY';
  location: string;
  expectedValue: number | string;
  actualValue: number | string;
  confidence: number;
  message: string;
}

export interface TableAuditReport {
  tableId: string;
  status: 'AUDIT_PASSED' | 'REVIEW_REQUIRED';
  findings: TableAuditFinding[];
}

export type RowSemanticRole = 'TOTAL' | 'SUBTOTAL' | 'BREAKDOWN' | 'BASE_ITEM';

export class TableValidatorService {
  /**
   * Phân loại vai trò ngữ nghĩa của từng dòng trong bảng dữ liệu
   */
  private static detectRowRole(row: string[]): RowSemanticRole {
    const firstCell = (row[0] || '').toLowerCase().trim();
    const secondCell = (row[1] || '').toLowerCase().trim();
    const combined = `${firstCell} ${secondCell}`;

    // 1. Hàng con / Breakdown ("Trong đó", "Gồm", "Bao gồm")
    if (
      firstCell.startsWith('trong đó') ||
      firstCell.startsWith('trong do') ||
      firstCell.includes('trong đó:') ||
      firstCell.startsWith('- trong đó') ||
      firstCell.startsWith('+ trong đó') ||
      firstCell.startsWith('gồm:') ||
      firstCell.startsWith('bao gồm') ||
      firstCell.startsWith('cụ thể:')
    ) {
      return 'BREAKDOWN';
    }

    // 2. Hàng Tổng cộng toàn bảng (Grand Total)
    if (
      firstCell === 'tổng cộng' ||
      firstCell === 'tổng số' ||
      firstCell === 'tổng chung' ||
      firstCell === 'cộng' ||
      firstCell === 'tổng' ||
      firstCell.startsWith('tổng cộng:') ||
      firstCell.startsWith('tổng số:') ||
      firstCell.startsWith('tổng chung:') ||
      firstCell.startsWith('tổng chi') ||
      firstCell.startsWith('tổng thu')
    ) {
      return 'TOTAL';
    }

    // 3. Hàng Tổng mục con (Subtotal)
    if (
      firstCell.startsWith('cộng mục') ||
      firstCell.startsWith('tổng mục') ||
      firstCell.startsWith('tiểu kết') ||
      firstCell.startsWith('tổng phần') ||
      (firstCell.includes('cộng') && !firstCell.includes('tổng cộng'))
    ) {
      return 'SUBTOTAL';
    }

    return 'BASE_ITEM';
  }

  /**
   * Kiểm toán tính nhất quán số học, tỷ lệ % và đơn vị trong bảng biểu
   */
  static validate(table: {
    table_id: string;
    headers: string[];
    rows: string[][];
  }): TableAuditReport {
    const findings: TableAuditFinding[] = [];
    if (!table.rows || table.rows.length === 0) {
      return { tableId: table.table_id, status: 'AUDIT_PASSED', findings: [] };
    }

    const rowRoles = table.rows.map(row => this.detectRowRole(row));

    // =========================================================================
    // 1. KIỂM TOÁN TỔNG CỘNG DỌC (VERTICAL SUM & SUBTOTALS DE-DUPLICATION)
    // =========================================================================
    table.rows.forEach((row, rowIdx) => {
      const role = rowRoles[rowIdx];

      if (role === 'TOTAL') {
        for (let colIdx = 1; colIdx < row.length; colIdx++) {
          const totalValStr = row[colIdx];
          const totalVal = this.parseNumericValue(totalValStr);

          if (totalVal !== null && totalVal > 0) {
            // Xác định danh sách các hàng trước đó
            const prevRowsBeforeTotal: { val: number; role: RowSemanticRole; idx: number }[] = [];
            for (let r = 0; r < rowIdx; r++) {
              const cellVal = this.parseNumericValue(table.rows[r][colIdx]);
              if (cellVal !== null) {
                prevRowsBeforeTotal.push({ val: cellVal, role: rowRoles[r], idx: r });
              }
            }

            const subtotals = prevRowsBeforeTotal.filter(item => item.role === 'SUBTOTAL');
            const baseItems = prevRowsBeforeTotal.filter(item => item.role === 'BASE_ITEM');

            let targetSum = 0;
            let sumStrategy = '';

            if (subtotals.length >= 2) {
              // Nếu có nhiều hơn 1 subtotal, kiểm tra tổng các Subtotals
              targetSum = subtotals.reduce((sum, item) => sum + item.val, 0);
              sumStrategy = 'tổng các mục con (Subtotals)';
            } else if (baseItems.length >= 2) {
              // Bỏ qua hoàn toàn các dòng BREAKDOWN ("Trong đó...") để chống tính trùng hai lần
              targetSum = baseItems.reduce((sum, item) => sum + item.val, 0);
              sumStrategy = 'tổng các khoản mục chính (loại trừ mục "Trong đó")';
            }

            if (targetSum > 0) {
              const diff = Math.abs(targetSum - totalVal);
              const diffRatio = diff / totalVal;

              // Cho phép sai số làm tròn 1.5% hoặc độ lệch <= 0.5
              if (diffRatio > 0.015 && diff > 0.5) {
                // Kiểm tra thêm: nếu cộng tất cả có thể khớp (fallback)
                const allSum = prevRowsBeforeTotal.reduce((sum, item) => sum + item.val, 0);
                if (Math.abs(allSum - totalVal) / totalVal <= 0.015 || Math.abs(allSum - totalVal) <= 0.5) {
                  // Khớp khi tính toàn bộ
                  continue;
                }

                findings.push({
                  type: 'SUM_MISMATCH',
                  location: `Hàng ${rowIdx + 1}, Cột ${colIdx + 1} (${table.headers[colIdx] || ''})`,
                  expectedValue: Math.round(targetSum * 100) / 100,
                  actualValue: totalVal,
                  confidence: 0.92,
                  message: `Số liệu tổng cộng (${totalVal}) không khớp với ${sumStrategy} (${Math.round(targetSum * 100) / 100}, lệch ${Math.round(diff * 100) / 100}).`
                });
              }
            }
          }
        }
      }
    });

    // =========================================================================
    // 2. KIỂM TOÁN TỶ LỆ PHẦN TRĂM (%) CHÉO (CROSS-COLUMN PERCENTAGE AUDIT)
    // =========================================================================
    let planColIdx = -1;
    let actualColIdx = -1;
    let rateColIdx = -1;

    table.headers.forEach((h, idx) => {
      const hClean = h.toLowerCase().trim();
      // Nhận diện cột Tỷ lệ %
      if (/(tỷ lệ|tỉ lệ|%|tỷ trọng)/i.test(hClean)) {
        if (rateColIdx === -1) rateColIdx = idx;
      } else if (/(kế hoạch|dự toán|giao|plan|chỉ tiêu năm|chỉ tiêu kế hoạch)/i.test(hClean)) {
        if (planColIdx === -1) planColIdx = idx;
      } else if (/(thực hiện|đạt được|giải ngân|đã làm|ước thực hiện|actual)/i.test(hClean)) {
        if (actualColIdx === -1) actualColIdx = idx;
      }
    });

    if (planColIdx !== -1 && actualColIdx !== -1 && rateColIdx !== -1) {
      table.rows.forEach((row, rowIdx) => {
        const plan = this.parseNumericValue(row[planColIdx]);
        const actual = this.parseNumericValue(row[actualColIdx]);
        const reportedRate = this.parseNumericValue(row[rateColIdx]);

        if (plan !== null && plan > 0 && actual !== null && actual >= 0 && reportedRate !== null) {
          const expectedRate = Math.round(((actual / plan) * 100) * 10) / 10;
          const diff = Math.abs(expectedRate - reportedRate);

          // Nếu lệch tỷ lệ lớn hơn 3.0% và lệch tuyệt đối > 1.5%
          if (diff > 3.0 && Math.abs(diff / (expectedRate || 1)) > 0.03) {
            findings.push({
              type: 'PERCENTAGE_MISMATCH',
              location: `Hàng ${rowIdx + 1}, Cột ${rateColIdx + 1} (${table.headers[rateColIdx] || 'Tỷ lệ %'})`,
              expectedValue: `${expectedRate}%`,
              actualValue: `${reportedRate}%`,
              confidence: 0.88,
              message: `Tỷ lệ ghi nhận (${reportedRate}%) không khớp với công thức [Thực hiện ${actual} / Kế hoạch ${plan} * 100 = ${expectedRate}%].`
            });
          }
        }
      });
    }

    // =========================================================================
    // 3. KIỂM TOÁN TÍNH ĐỒNG NHẤT ĐƠN VỊ ĐO LƯỜNG (UNIT CONSISTENCY AUDIT)
    // =========================================================================
    for (let cIdx = 0; cIdx < (table.headers.length || 0); cIdx++) {
      const unitsDetected: string[] = [];

      table.rows.forEach((row, rIdx) => {
        const cellText = row[cIdx] || '';
        const unitMatch = cellText.match(/(tỷ đồng|triệu đồng|nghìn đồng|đồng|ha|m2|người|hộ|vụ|%)/i);
        if (unitMatch) {
          const u = unitMatch[1].toLowerCase();
          if (!unitsDetected.includes(u)) {
            unitsDetected.push(u);
          }
        }
      });

      // Nếu trong cùng 1 cột có sự pha trộn giữa các đơn vị tiền tệ khác quy mô (vd: tỷ đồng và triệu đồng)
      if (unitsDetected.includes('tỷ đồng') && unitsDetected.includes('triệu đồng')) {
        findings.push({
          type: 'UNIT_INCONSISTENCY',
          location: `Cột ${cIdx + 1} (${table.headers[cIdx] || ''})`,
          expectedValue: 'Đồng nhất đơn vị',
          actualValue: unitsDetected.join(', '),
          confidence: 0.85,
          message: `Cột dữ liệu tồn tại sự không đồng nhất về đơn vị đo lường (${unitsDetected.join(' và ')}).`
        });
      }
    }

    return {
      tableId: table.table_id,
      status: findings.length === 0 ? 'AUDIT_PASSED' : 'REVIEW_REQUIRED',
      findings
    };
  }

  /**
   * Parse số thực từ chuỗi tiếng Việt (hỗ trợ phẩy thập phân, chấm hàng nghìn và loại bỏ đơn vị đính kèm)
   */
  public static parseNumericValue(valStr: string | null | undefined): number | null {
    if (!valStr) return null;
    let clean = valStr.replace(/\s+/g, '').replace(/%/g, '');

    // Loại bỏ các chữ cái đơn vị như tỷ, triệu, nghìn, đồng, ha, m2
    clean = clean.replace(/[a-zA-ZÀ-ỹ]/g, '').trim();
    if (!clean) return null;

    // Nếu chứa cả dấu chấm và dấu phẩy (vd: 1.250,5)
    if (clean.includes('.') && clean.includes(',')) {
      const normalized = clean.replace(/\./g, '').replace(',', '.');
      const num = parseFloat(normalized);
      return isNaN(num) ? null : num;
    }

    // Nếu chỉ chứa dấu phẩy (vd: 12,5)
    if (clean.includes(',') && !clean.includes('.')) {
      const normalized = clean.replace(',', '.');
      const num = parseFloat(normalized);
      return isNaN(num) ? null : num;
    }

    // Nếu chỉ chứa dấu chấm (vd: 1.500 hoặc 12.5)
    if (clean.includes('.') && !clean.includes(',')) {
      const parts = clean.split('.');
      if (parts[1] && parts[1].length === 3 && parts.length === 2) {
        // Dấu chấm hàng nghìn (vd: 1.500)
        const num = parseFloat(clean.replace(/\./g, ''));
        return isNaN(num) ? null : num;
      } else {
        // Dấu chấm thập phân (vd: 12.5)
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
      }
    }

    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }
}
