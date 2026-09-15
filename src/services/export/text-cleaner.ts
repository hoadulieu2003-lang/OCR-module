/**
 * Bộ làm sạch văn bản hành chính (Clean Text Engine & Watermark Excluder)
 */
export class ExecutiveTextCleaner {
  static clean(text: string | null | undefined): string {
    if (!text) return '';
    return String(text)
      .replace(/\[\s*(?:CRITICAL|HIGH|MEDIUM|LOW|NGHIEM_TRONG|CAO|TRUNG_BINH|THAP|CAN_XU_LY|CẦN XỬ LÝ)\s*\]/gi, '')
      .replace(/\[\s*(?:Trang|trang|Page|page)\s*[^\]]+\]/gi, '')
      .replace(/\(\s*Mức độ\s*:\s*[^)]+\)/gi, '')
      .replace(/\[\s*Quyết định\s*:\s*([^\]]+)\]/gi, 'Quyết định: $1')
      .replace(/\[\s*Chỉ đạo\s*:\s*([^\]]+)\]/gi, 'Chỉ đạo: $1')
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .replace(/([.,;:!?])\s*\1+/g, '$1')
      .trim();
  }
}

/**
 * Bộ Chuẩn Hóa Đơn Vị Đo & Xử Lý Số Liệu Hành Chính
 */
export class AdministrativeDataProcessor {
  private static UNIT_RULES: Array<{ patterns: RegExp[]; unit: string }> = [
    { patterns: [/tỷ lệ/i, /tỉ lệ/i, /độ che phủ/i, /độ bao phủ/i, /tỷ trọng/i, /tăng trưởng/i, /giảm nghèo/i, /hoàn thành/i], unit: '%' },
    { patterns: [/diện tích/i, /đất đai/i, /rừng/i, /tự nhiên/i, /canh tác/i, /quy hoạch/i, /mặt bằng/i, /thổ nhưỡng/i], unit: 'ha' },
    { patterns: [/ngân sách/i, /vốn đầu tư/i, /kế hoạch vốn/i, /giải ngân/i, /dự toán/i, /tổng thu/i, /tổng chi/i, /doanh thu/i, /đầu tư công/i], unit: 'tỷ đồng' },
    { patterns: [/kinh phí/i, /mức trợ cấp/i, /chi trả/i, /tiền mặt/i, /mức phạt/i, /thu nhập/i], unit: 'triệu đồng' },
    { patterns: [/đối tượng btxh/i, /bảo trợ xã hội/i, /chính sách/i, /hưởng trợ cấp/i, /nhận trợ cấp/i, /đối tượng/i], unit: 'Đối tượng' },
    { patterns: [/hộ nghèo/i, /hộ cận nghèo/i, /hộ dân/i, /hộ gia đình/i], unit: 'Hộ' },
    { patterns: [/dân số/i, /nhân khẩu/i, /cư dân/i, /đồng bào/i, /dân tộc/i, /trẻ em/i, /người cao tuổi/i, /người khuyết tật/i, /phụ nữ/i, /học sinh/i, /bệnh nhân/i, /công chức/i, /viên chức/i, /cán bộ/i, /y bác sĩ/i, /lao động/i, /người có thẻ/i], unit: 'Người' },
    { patterns: [/trạm y tế/i, /điểm trạm/i, /trường học/i, /phòng khám/i, /cơ sở y tế/i, /điểm trường/i], unit: 'Điểm' },
    { patterns: [/khám chữa bệnh/i, /lượt khám/i, /tiếp công dân/i, /lượt tiếp/i], unit: 'Lượt' },
    { patterns: [/đơn thư/i, /khiếu nại/i, /tố cáo/i, /phản ánh/i, /vụ việc/i, /vụ án/i, /tranh chấp/i, /hồ sơ/i, /văn bản/i, /quyết định/i], unit: 'Vụ' },
    { patterns: [/dự án/i, /công trình/i, /gói thầu/i], unit: 'Dự án' }
  ];

  public static inferStandardUnit(metricName: string, explicitUnit?: string | null): string {
    if (explicitUnit && explicitUnit.trim().length > 0) {
      const clean = explicitUnit.trim().toLowerCase();
      if (clean === '%' || clean === 'phần trăm') return '%';
      if (clean === 'nguoi' || clean === 'người') return 'Người';
      if (clean === 'ho' || clean === 'hộ') return 'Hộ';
      if (clean === 'ha' || clean === 'hecta') return 'ha';
      if (clean === 'ty dong' || clean === 'tỷ đồng') return 'tỷ đồng';
      if (clean === 'trieu dong' || clean === 'triệu đồng') return 'triệu đồng';
      if (clean === 'dong' || clean === 'đồng') return 'đồng';
      if (clean === 'ca' || clean === 'ca bệnh') return 'Ca';
      if (clean === 'vu' || clean === 'vụ') return 'Vụ';
      if (clean === 'luot' || clean === 'lượt' || clean === 'lượt khám') return 'Lượt';
      if (clean === 'truong hop' || clean === 'trường hợp') return 'Trường hợp';
      if (clean === 'doi tuong' || clean === 'đối tượng') return 'Đối tượng';
      return explicitUnit.trim();
    }

    const match = (metricName || '').match(/\(([^)]+)\)$/);
    if (match) return match[1].trim();

    for (const rule of this.UNIT_RULES) {
      if (rule.patterns.some(pattern => pattern.test(metricName || ''))) {
        return rule.unit;
      }
    }
    return '';
  }

  public static formatVNNumber(val: string | number | null | undefined, unit?: string): string {
    if (val === null || val === undefined || val === '') return '—';
    const s = String(val).trim();
    if (/^[0-9]+([.,][0-9]+)?$/.test(s)) {
      const num = parseFloat(s.replace(',', '.'));
      if (!isNaN(num)) {
        return num.toLocaleString('vi-VN') + (unit ? ` ${unit}` : '');
      }
    }
    return s + (unit && !s.endsWith(unit) ? ` ${unit}` : '');
  }
}

/**
 * Helper làm sạch giá trị cell CSV chống CSV Formula Injection (Type-Safe)
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str: string;
  if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value).trim();
  }
  // Thay thế double quote thành 2 double quotes
  str = str.replace(/"/g, '""');
  // Nếu bắt đầu bằng các ký tự formula nguy hiểm: =, +, -, @, \t, \r, thêm nháy đơn '
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some(p => str.startsWith(p))) {
    str = `'${str}`;
  }
  return `"${str}"`;
}

/**
 * Tính toán chiều rộng từng cột tỉ lệ thuận với độ dài nội dung (Dùng chung cho Docx & PDF)
 */
export function calculateTableColumnWidths(headers: string[], rows: string[][], totalWidth: number): number[] {
  const colCount = Math.max(headers.length, rows[0]?.length || 1);
  if (colCount <= 1) return [totalWidth];

  const colLengths: number[] = new Array(colCount).fill(1);
  headers.forEach((h, i) => {
    colLengths[i] = Math.max(colLengths[i], String(h || '').length);
  });
  rows.slice(0, 30).forEach(r => {
    r.forEach((c, i) => {
      if (i < colCount) {
        colLengths[i] = Math.max(colLengths[i], Math.min(String(c || '').length, 50));
      }
    });
  });

  const isSttCol0 = /^(stt|#|số tt|tt)$/i.test((headers[0] || '').trim()) || colLengths[0] <= 4;
  const minColWidth = totalWidth > 1000 ? 900 : 35;
  const sttWidth = isSttCol0 ? (totalWidth > 1000 ? 700 : 30) : 0;

  const remainingWidth = isSttCol0 ? totalWidth - sttWidth : totalWidth;
  const remainingLengths = isSttCol0 ? colLengths.slice(1) : colLengths;
  const totalRemainingLen = remainingLengths.reduce((a, b) => a + b, 0) || 1;

  const result: number[] = [];
  if (isSttCol0) {
    result.push(sttWidth);
  }

  remainingLengths.forEach((len) => {
    const rawW = Math.round((len / totalRemainingLen) * remainingWidth);
    const clampedW = Math.max(minColWidth, rawW);
    result.push(clampedW);
  });

  const currentSum = result.reduce((a, b) => a + b, 0);
  const diff = totalWidth - currentSum;
  if (result.length > (isSttCol0 ? 1 : 0)) {
    let maxIdx = isSttCol0 ? 1 : 0;
    for (let i = maxIdx; i < result.length; i++) {
      if (result[i] > result[maxIdx]) maxIdx = i;
    }
    result[maxIdx] += diff;
  }

  return result;
}
