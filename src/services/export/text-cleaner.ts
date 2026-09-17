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
      .replace(/\ufffd/g, '')
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
    if (val === null || val === undefined || val === '') return '';
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

  const r0 = rows[0];
  const r1 = rows[1];
  const isR0SubHeader = Boolean(
    rows.length >= 2 &&
    r0 &&
    (!r0[0]?.trim() || r0[0].trim() === '-' || r0[0].trim() === '—') &&
    r1 &&
    Boolean(r1[0]?.trim()) &&
    r0.some(c => /^(đơn vị|đvt|số liệu|kế hoạch|thực hiện|tỷ lệ|kết quả|kinh phí|ngân sách|số lượng|ghi chú|tháng|năm|nam|nữ)/i.test(String(c || '').trim()) || (headers.some(h => !h.trim()) && Boolean(c?.trim()))) &&
    r0.every(c => String(c || '').trim().length <= 40)
  );

  const effectiveRows = isR0SubHeader ? rows.slice(1) : rows;
  const isDxa = totalWidth > 1000;
  const scale = isDxa ? (totalWidth / 482) : 1;
  const isLandscapeOrWide = isDxa ? (totalWidth > 11000) : (totalWidth > 600);

  // Phân loại vai trò từng cột
  const isSttCol0 = /^(stt|#|số tt|tt)$/i.test((headers[0] || '').trim()) || (rows.length > 0 && String(rows[0]?.[0] || '').length <= 4 && String(rows[1]?.[0] || '').length <= 4);

  // Tính minColWidth cho từng cột dựa vào vai trò và nội dung hành chính
  const minWidths = new Array(colCount).fill(0);
  for (let c = 0; c < colCount; c++) {
    if (c === 0 && isSttCol0) {
      minWidths[c] = Math.round((isLandscapeOrWide ? 38 : 30) * scale);
      continue;
    }
    const hText = String(headers[c] || '').trim();
    const subText = isR0SubHeader ? String(r0[c] || '').trim() : '';
    const combinedHeader = (hText + ' ' + subText).trim().toLowerCase();

    const isUnit = /^(đơn vị|đvt|đơn vị tính)/i.test(combinedHeader) || /đơn vị|đvt/i.test(subText);
    const isNum = /^(số liệu|kết quả|thực hiện|kế hoạch|tỷ lệ|ước thực hiện)/i.test(combinedHeader) || /^(số liệu|tỷ lệ)/i.test(subText);
    const isNote = /^(ghi chú|note)/i.test(combinedHeader);

    if (isUnit) {
      minWidths[c] = Math.round((isLandscapeOrWide ? 90 : 75) * scale);
    } else if (isNum) {
      minWidths[c] = Math.round((isLandscapeOrWide ? 68 : 55) * scale);
    } else if (isNote) {
      minWidths[c] = Math.round((isLandscapeOrWide ? 85 : 70) * scale);
    } else {
      minWidths[c] = Math.round((isLandscapeOrWide ? 75 : 55) * scale);
    }
  }

  // Đảm bảo tổng minWidths không bao giờ vượt quá 92% totalWidth
  const sumMin = minWidths.reduce((a, b) => a + b, 0);
  if (sumMin > totalWidth * 0.92) {
    const ratio = (totalWidth * 0.92) / sumMin;
    for (let c = 0; c < colCount; c++) {
      minWidths[c] = Math.max(isDxa ? 400 : 20, Math.floor(minWidths[c] * ratio));
    }
  }

  // Tính độ dài hiệu dụng của từng cột
  const colLengths = new Array(colCount).fill(1);
  for (let c = 0; c < colCount; c++) {
    const hText = String(headers[c] || '').trim();
    const subText = isR0SubHeader ? String(r0[c] || '').trim() : '';
    const hLen = Math.max(hText.length, subText.length);
    const cellLens = effectiveRows.slice(0, 30).map(r => String(r[c] || '').trim().length).filter(l => l > 0);
    const avgLen = cellLens.length > 0 ? (cellLens.reduce((a, b) => a + b, 0) / cellLens.length) : 0;
    const maxLen = cellLens.length > 0 ? Math.max(...cellLens) : 0;
    const rep = Math.min(Math.round(avgLen * 0.5 + maxLen * 0.5), 150);
    colLengths[c] = Math.max(hLen, rep, 4);
  }

  const sttWidth = isSttCol0 ? minWidths[0] : 0;
  const startIndex = isSttCol0 ? 1 : 0;
  const remWidth = isSttCol0 ? (totalWidth - sttWidth) : totalWidth;

  // Sử dụng hàm mũ 0.65 để giảm thiểu độ chênh lệch cực đoan giữa cột dài và ngắn
  const weights: number[] = [];
  for (let c = startIndex; c < colCount; c++) {
    weights.push(Math.pow(colLengths[c], 0.65));
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  // Cấp phát ban đầu
  const result = new Array(colCount).fill(0);
  if (isSttCol0) result[0] = sttWidth;

  for (let i = 0; i < weights.length; i++) {
    const c = startIndex + i;
    const rawW = Math.round((weights[i] / totalWeight) * remWidth);
    result[c] = Math.max(minWidths[c], rawW);
  }

  // Khống chế cột chiếm ưu thế lớn nhất không quá 48% remainingWidth nếu colCount >= 4
  if (colCount >= 4) {
    let maxIdx = startIndex;
    for (let c = startIndex; c < colCount; c++) {
      if (result[c] > result[maxIdx]) maxIdx = c;
    }
    const maxAllowed = Math.round(remWidth * 0.48);
    if (result[maxIdx] > maxAllowed) {
      const excess = result[maxIdx] - maxAllowed;
      result[maxIdx] = maxAllowed;
      const otherCols: number[] = [];
      for (let c = startIndex; c < colCount; c++) {
        if (c !== maxIdx) otherCols.push(c);
      }
      const addPerCol = Math.floor(excess / otherCols.length);
      otherCols.forEach(c => result[c] += addPerCol);
    }
  }

  // Điều chỉnh tổng chính xác bằng totalWidth
  let curSum = result.reduce((a, b) => a + b, 0);
  let diff = totalWidth - curSum;
  let adjustIdx = startIndex;
  for (let c = startIndex; c < colCount; c++) {
    if (result[c] > result[adjustIdx]) adjustIdx = c;
  }
  result[adjustIdx] += diff;

  for (let i = 0; i < result.length; i++) {
    if (result[i] <= 0 || isNaN(result[i])) {
      result[i] = Math.max(isDxa ? 500 : 25, Math.floor(totalWidth / colCount));
    }
  }

  return result;
}
