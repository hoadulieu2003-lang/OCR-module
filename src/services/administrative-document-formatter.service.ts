/**
 * Administrative Document Formatter & Parser according to Nghị định 30/2020/NĐ-CP
 * Chuẩn hóa thể thức văn bản hành chính Việt Nam và lọc bỏ Watermark
 */

export interface FormattedAdministrativeDoc {
  header: {
    superiorAgency: string | null;
    issuingAgency: string;
    docNumber: string;
    nationalMotto: string;
    subMotto: string;
    locationAndDate: string;
  };
  title: string;
  subject: string | null;
  recipientsLine: string | null;
  submittingUnit: string | null;
  bodyElements: Array<{
    type: 'HEADING_1' | 'HEADING_2' | 'PARAGRAPH' | 'LIST_ITEM' | 'TABLE_REF';
    text: string;
    tableIndex?: number;
  }>;
  footer: {
    recipients: string[];
    signerTitle: string | null;
    signerName: string | null;
  };
  cleanText: string;
}

const WATERMARK_PATTERNS = [
  /dự\s*thảo/i,
  /bản\s*dự\s*thảo/i,
  /tài\s*liệu\s*mật/i,
  /tuyệt\s*mật/i,
  /tối\s*mật/i,
  /mật/i,
  /bản\s*lưu/i,
  /confidential/i,
  /draft/i,
  /sample\s*document/i,
  /watermark/i,
  /dấu\s*chìm/i,
  /bản\s*nháp/i,
  /camscanner/i,
  /adobe\s*scan/i,
  /scanned\s*by/i
];

export class AdministrativeDocumentFormatterService {
  /**
   * Lọc bỏ hoàn toàn các dòng chứa watermark
   */
  static cleanWatermarks(rawText: string): string {
    if (!rawText) return '';
    const lines = rawText.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed.length < 25) {
        for (const pattern of WATERMARK_PATTERNS) {
          if (pattern.test(trimmed)) return false;
        }
      }
      return true;
    });
    return filteredLines.join('\n');
  }

  /**
   * Phân tích văn bản thành các thành phần thể thức chuẩn Nghị định 30/2020/NĐ-CP
   */
  static parseDocumentStructure(fullText: string, metadata?: any): FormattedAdministrativeDoc {
    const cleaned = this.cleanWatermarks(fullText);
    const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let superiorAgency: string | null = null;
    let issuingAgency = metadata?.issuing_authority || 'ỦY BAN NHÂN DÂN';
    let docNumber = metadata?.document_number || 'Số: .../BC-UBND';
    let locationAndDate = 'Ngày ... tháng ... năm ...';
    let title = 'BÁO CÁO';
    let subject: string | null = null;
    let recipientsLine: string | null = metadata?.receiving_authority ? `Kính gửi: ${metadata.receiving_authority}` : null;
    let submittingUnit: string | null = null;

    let signerTitle: string | null = metadata?.signer?.title || null;
    let signerName: string | null = metadata?.signer?.name || null;
    const recipients: string[] = metadata?.recipients && Array.isArray(metadata.recipients)
      ? metadata.recipients
          .map((r: string) => String(r || '').trim())
          .filter((r: string) => {
            const clean = r.replace(/^[-*•+\s]+/, '').trim();
            return clean.length >= 3;
          })
      : [];

    const bodyElements: FormattedAdministrativeDoc['bodyElements'] = [];

    // Quét tìm thông tin phần đầu (Header)
    let bodyStartIndex = 0;
    let bodyEndIndex = lines.length;

    for (let i = 0; i < Math.min(25, lines.length); i++) {
      const line = lines[i];

      // Cơ quan cấp trên / cơ quan ban hành
      if (/^(?:ỦY BAN NHÂN DÂN|UỶ BAN NHÂN DÂN|UBND|BỘ|SỞ|PHÒNG|BAN|CÔNG AN|VĂN PHÒNG)\b/i.test(line)) {
        if (!superiorAgency && !line.includes('VĂN PHÒNG') && !line.includes('PHÒNG')) {
          superiorAgency = line.toUpperCase();
        } else if (!issuingAgency || issuingAgency === 'ỦY BAN NHÂN DÂN') {
          issuingAgency = line.toUpperCase();
        }
      }

      // Số và ký hiệu
      const numMatch = line.match(/(?:Số|Số:)\s*([0-9a-zA-Z\/\-_.]+)/i);
      if (numMatch) {
        docNumber = line.startsWith('Số') ? line : `Số: ${numMatch[1]}`;
      }

      // Địa danh và ngày tháng
      const dateMatch = line.match(/(?:[A-ZÀ-Ỹa-zà-ỹ\s]+,\s*)?ngày\s*\d{1,2}\s*tháng\s*\d{1,2}\s*năm\s*\d{4}/i);
      if (dateMatch) {
        locationAndDate = dateMatch[0].trim();
      }

      // Tên loại văn bản
      if (/^(?:BÁO CÁO|PHIẾU TRÌNH|TỜ TRÌNH|QUYẾT ĐỊNH|THÔNG BÁO|KẾ HOẠCH|CÔNG VĂN|GIẤY MỜI)\b/i.test(line)) {
        title = line.toUpperCase();
        bodyStartIndex = i + 1;

        // Trích yếu nội dung: chỉ thu thập nếu dòng tiếp theo thực sự là trích yếu (bắt đầu bằng Về việc, Kết quả, Kế hoạch, Tình hình...)
        const hasSubjectIndicator = i + 1 < lines.length && (
          /^(?:Về việc|V\/v|Kết quả|Kế hoạch|Tình hình|Tổng kết|Sơ kết|Đánh giá|Công tác|Phương hướng|Nội dung|Báo cáo)(?:\s|[:\-,.]|$)/i.test(lines[i + 1]) ||
          (/^“[^”]+”/.test(lines[i + 1]) && lines[i + 1].length < 160)
        );

        if (hasSubjectIndicator) {
          const subjectParts: string[] = [];
          let curIdx = i + 1;
          while (curIdx < Math.min(i + 4, lines.length)) {
            const checkLine = lines[curIdx];
            // Dừng ngay nếu gặp đề mục, kính gửi, đơn vị trình, bullet, hoặc các từ mở đầu thân bài
            if (
              /^(?:Kính gửi|Đơn vị trình|Thực hiện|Căn cứ|Nơi nhận|Theo đề nghị)(?:\s|[:\-,.]|$)/i.test(checkLine) ||
              /^(?:[I|V|X]+\.|\d+[\.\)]|\bPHẦN\b|[-*•+]|[a-zđ]\))/i.test(checkLine) ||
              /^(?:CỘNG HÒA|ỦY BAN|UBND|Số:)/i.test(checkLine)
            ) {
              break;
            }
            if (checkLine.length > 200) {
              break;
            }
            subjectParts.push(checkLine);
            curIdx++;
            if (/[.:]\s*$/.test(checkLine)) {
              break;
            }
          }
          if (subjectParts.length > 0) {
            subject = subjectParts.join(' ').replace(/\s+/g, ' ').trim();
            bodyStartIndex = curIdx;
          }
        }
        break;
      }
    }

    // Quét tìm Kính gửi & Đơn vị trình
    for (let i = bodyStartIndex; i < Math.min(bodyStartIndex + 10, lines.length); i++) {
      const line = lines[i];
      if (/^Kính gửi\s*[:\s]/i.test(line)) {
        recipientsLine = line;
        bodyStartIndex = Math.max(bodyStartIndex, i + 1);
      } else if (/^Đơn vị trình\s*[:\s]/i.test(line)) {
        submittingUnit = line;
        bodyStartIndex = Math.max(bodyStartIndex, i + 1);
      } else if (/^Về việc\b/i.test(line) && !subject) {
        subject = line;
        bodyStartIndex = Math.max(bodyStartIndex, i + 1);
      }
    }

    // Quét phần kết thúc (Footer): Nơi nhận & Chữ ký từ cuối lên
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      const line = lines[i];

      // Chức danh người ký
      if (/^(?:CHỦ TỊCH|Q\.\s*CHỦ TỊCH|PHÓ CHỦ TỊCH|GIÁM ĐỐC|TRƯỞNG PHÒNG|TRƯỞNG CÔNG AN|CHÁNH VĂN PHÒNG|KT\.\s*CHỦ TỊCH|TM\.\s*ỦY BAN NHÂN DÂN)/i.test(line)) {
        signerTitle = line.toUpperCase();
        bodyEndIndex = Math.min(bodyEndIndex, i);

        // Tên người ký ở dòng sau
        if (i + 1 < lines.length) {
          const possibleName = lines[i + 1];
          if (!/^(?:Nơi nhận|Lưu:)/i.test(possibleName) && possibleName.length < 40) {
            signerName = possibleName;
          }
        }
      }

      // Nơi nhận
      if (/^Nơi nhận\s*[:\s]/i.test(line)) {
        bodyEndIndex = Math.min(bodyEndIndex, i);
        for (let j = i + 1; j < lines.length; j++) {
          const recLine = lines[j];
          const recClean = recLine.replace(/^[-*•+\s]+/, '').trim();
          if (recClean.length >= 3 && (recLine.startsWith('-') || recLine.startsWith('*') || recLine.startsWith('+') || recLine.toLowerCase().startsWith('lưu:'))) {
            if (!recipients.includes(recLine)) recipients.push(recLine);
          }
        }
      }
    }

    // Phân tích các đoạn nội dung thân bài với Bộ Nối Liền Thông Minh (Intelligent Paragraph & Heading Stitcher)
    for (let i = bodyStartIndex; i < bodyEndIndex; i++) {
      const line = lines[i];

      // Bỏ qua dòng trống, dòng đơn ký tự hoặc số trang cô lập
      if (line.length <= 1) continue;
      if (/^\d{1,3}$/.test(line)) continue; // Số trang

      const cleanContent = line.replace(/^[-*•+\s]+/, '').trim();
      if (cleanContent.length <= 2 && !/^\d+\.?$/.test(cleanContent)) continue; // Bỏ qua ký tự dọc cô lập do scan lỗi

      // Bỏ qua các dòng lặp lại header/motto
      if (/^(?:CỘNG HÒA XÃ HỘI|Độc lập - Tự do|Độc lập – Tự do|UBND|Số:)/i.test(line)) continue;
      if (line === title || line === subject || line === recipientsLine || line === submittingUnit) continue;

      // 1. Phân loại cấu trúc dòng
      const isHeading1 = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s*/i.test(line) || /^PHẦN\s+(?:THỨ\s+)?[I|V|X\d]+/i.test(line);
      const isHeading2 = /^\d+[\.\)]\s+[A-ZÀ-Ỹ\p{Lu}]/u.test(line);
      const isListItem = /^[-*•+]\s*/.test(line) || /^[a-zđ]\)\s+/i.test(line);

      const prevElement = bodyElements.length > 0 ? bodyElements[bodyElements.length - 1] : null;

      // TRƯỜNG HỢP 1: NỐI VÀO TIÊU ĐỀ LA MÃ (HEADING_1 BỊ NGẮT DÒNG, VÍ DỤ: "I. ... PHONG" + "TRÀO")
      if (
        prevElement &&
        prevElement.type === 'HEADING_1' &&
        !isHeading1 &&
        !isHeading2 &&
        !isListItem
      ) {
        const prevText = prevElement.text.trim();
        const prevEndsTerminal = /[.:!?]\s*$/.test(prevText);
        if (!prevEndsTerminal && (line === line.toUpperCase() || /^\p{Ll}/u.test(line))) {
          prevElement.text = `${prevElement.text} ${line}`.replace(/\s+/g, ' ');
          continue;
        }
      }

      // TRƯỜNG HỢP 2: NỐI VÀO TIÊU ĐỀ SỐ (HEADING_2 BỊ NGẮT DÒNG)
      if (
        prevElement &&
        prevElement.type === 'HEADING_2' &&
        !isHeading1 &&
        !isHeading2 &&
        !isListItem
      ) {
        const prevText = prevElement.text.trim();
        const prevEndsTerminal = /[.:!?]\s*$/.test(prevText);
        if (!prevEndsTerminal && (/^\p{Ll}/u.test(line) || /^(?:và|về|của|trong|tại|theo|giai đoạn)\b/i.test(line))) {
          prevElement.text = `${prevElement.text} ${line}`.replace(/\s+/g, ' ');
          continue;
        }
      }

      // TRƯỜNG HỢP 3: NỐI VÀO MỤC DANH SÁCH (LIST_ITEM BỊ NGẮT DÒNG)
      if (
        prevElement &&
        prevElement.type === 'LIST_ITEM' &&
        !isHeading1 &&
        !isHeading2 &&
        !isListItem
      ) {
        const prevText = prevElement.text.trim();
        const prevEndsTerminal = /[.;!?]\s*$/.test(prevText);
        const startsLowerOrContinuation = /^(?:[\p{Ll},;)\]\d+%“"']|[-–—]\s+[a-zà-ỹ\p{Ll}])/u.test(line);

        if (!prevEndsTerminal || startsLowerOrContinuation) {
          prevElement.text = `${prevElement.text} ${line}`.replace(/\s+/g, ' ');
          continue;
        }
      }

      // TRƯỜNG HỢP 4: NỐI VÀO ĐOẠN VĂN (PARAGRAPH CONTINUATION)
      // Giải quyết triệt để lỗi các từ như "cận", "trọng" hoặc câu văn bị cắt rời
      if (
        prevElement &&
        prevElement.type === 'PARAGRAPH' &&
        !isHeading1 &&
        !isHeading2 &&
        !isListItem
      ) {
        const prevText = prevElement.text.trim();

        // Kiểm tra từ viết tắt hành chính không được coi là kết thúc đoạn
        const isAbbreviationEnd = /(?:TP|Tx|Tt|Ths|Bs|Gs|TS|PGS|K\/g|Đ\/c|Đc|đ\/c|đc|v\.v|v\.v\.|NĐ-CP|QĐ-UBND|BC-UBND|TTr-UBND|CV-UBND|Số|số)\.\s*$/i.test(prevText);
        const isDecimalSplit = /\d+\.\s*$/.test(prevText) && /^\d+/.test(line);
        const prevEndsWithTerminal = /[.:!?]["'”’]?\s*$/.test(prevText) && !isAbbreviationEnd && !isDecimalSplit;

        const startsLowerOrContinuation = /^(?:[\p{Ll},;)\]\d+%“"']|[-–—]\s+[a-zà-ỹ\p{Ll}])/u.test(line);

        // Nối tiếp nếu dòng trước chưa có dấu câu kết thúc HOẶC dòng này bắt đầu bằng chữ thường / ký tự tiếp diễn
        if (!prevEndsWithTerminal || startsLowerOrContinuation) {
          prevElement.text = `${prevElement.text} ${line}`.replace(/\s+/g, ' ');
          continue;
        }
      }

      // NẾU KHÔNG NỐI ĐƯỢC VÀO PHẦN TỬ TRƯỚC: TẠO PHẦN TỬ MỚI
      if (isHeading1) {
        bodyElements.push({ type: 'HEADING_1', text: line });
      } else if (isHeading2) {
        bodyElements.push({ type: 'HEADING_2', text: line });
      } else if (isListItem) {
        bodyElements.push({ type: 'LIST_ITEM', text: line });
      } else {
        bodyElements.push({ type: 'PARAGRAPH', text: line });
      }
    }

    return {
      header: {
        superiorAgency: superiorAgency || (issuingAgency !== 'ỦY BAN NHÂN DÂN' ? 'ỦY BAN NHÂN DÂN' : null),
        issuingAgency: issuingAgency || 'ỦY BAN NHÂN DÂN',
        docNumber: docNumber || 'Số: .../BC-UBND',
        nationalMotto: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
        subMotto: 'Độc lập - Tự do - Hạnh phúc',
        locationAndDate: locationAndDate || 'Ngày ... tháng ... năm ...'
      },
      title: title || 'BÁO CÁO',
      subject,
      recipientsLine,
      submittingUnit,
      bodyElements,
      footer: {
        recipients: recipients.length > 0 ? recipients : ['- Như trên;', '- Lưu: VT.'],
        signerTitle: signerTitle || 'CHỦ TỊCH',
        signerName: signerName || null
      },
      cleanText: cleaned
    };
  }
}
