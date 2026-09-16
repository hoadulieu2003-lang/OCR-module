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
    type: 'HEADING_1' | 'HEADING_2' | 'PARAGRAPH' | 'LIST_ITEM' | 'TABLE_REF' | 'SUB_NOTE' | 'FOOTNOTE';
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
    // Xóa bỏ các ký tự ẩn soft-hyphen, zero-width, và chuẩn hóa non-breaking spaces
    const sanitized = rawText
      .replace(/\u00ad/g, '')
      .replace(/[\u200b\ufeff]/g, '')
      .replace(/\u00a0/g, ' ');

    const lines = sanitized.split('\n');
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
    const rawLines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Lọc bỏ các dòng bảng thô hoặc tiêu đề bảng thừa trong thân bài (tránh lặp dữ liệu)
    const lines = rawLines.filter(line => {
      if (/^\[Bảng:\s*[^\]]+\]/i.test(line)) return false;
      if (line.includes('|') && (line.split('|').length >= 3 || line.startsWith('|') || /[-*•]\s*\|/.test(line))) return false;
      if (/^TT\s*\|\s*CHỈ TIÊU/i.test(line)) return false;
      if (/^(?:BIỂU|BẢNG|PHỤ LỤC)\s*[:.]\s*KẾT QUẢ THỰC HIỆN CÁC CHỈ TIÊU/i.test(line)) return false;
      return true;
    });

    let superiorAgency: string | null = null;
    let issuingAgency = metadata?.issuing_authority || 'ỦY BAN NHÂN DÂN';
    let docNumber = metadata?.document_number ? `Số: ${String(metadata.document_number).replace(/^Số:?\s*/i, '')}` : 'Số: .../BC-UBND';
    let locationAndDate = 'Ngày ... tháng ... năm ...';
    let title = 'BÁO CÁO';
    let subject: string | null = null;
    let recipientsLine: string | null = null;
    // Chỉ lấy Kính gửi nếu KHÔNG PHẢI BÁO CÁO và metadata có receiving_authority rõ ràng
    if (metadata?.receiving_authority && !/^(?:BÁO CÁO|Cơ quan cấp trên|Ủy ban nhân dân)/i.test(metadata.receiving_authority) && !/^BÁO CÁO/i.test(metadata?.document_title || '')) {
      recipientsLine = `Kính gửi: ${metadata.receiving_authority}`;
    }
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

    let hasExplicitTitle = false;
    for (let i = 0; i < Math.min(25, lines.length); i++) {
      const line = lines[i];

      // Cơ quan cấp trên / cơ quan ban hành (hỗ trợ cả cơ quan nhà nước và tập đoàn, tổng công ty)
      if (line.length <= 80 && !/ban\s*hành|hướng\s*dẫn|công\s*văn/i.test(line) && /^(?:ỦY\s*BAN\s*NHÂN\s*DÂN|UỶ\s*BAN\s*NHÂN\s*DÂN|UBND|BỘ|SỞ|PHÒNG|BAN|CÔNG\s*AN|VĂN\s*PHÒNG|TẬP\s*ĐOÀN|TỔNG\s*CÔNG\s*TY|CÔNG\s*TY|TRUNG\s*TÂM)\b/i.test(line)) {
        if (/^(?:TẬP\s*ĐOÀN|BỘ|ỦY\s*BAN|UBND)/i.test(line) && !superiorAgency) {
          superiorAgency = line.toUpperCase();
        } else if (!issuingAgency || issuingAgency === 'ỦY BAN NHÂN DÂN') {
          issuingAgency = line.toUpperCase();
        } else if (!superiorAgency && superiorAgency !== line.toUpperCase()) {
          superiorAgency = issuingAgency;
          issuingAgency = line.toUpperCase();
        }
      }

      // Số và ký hiệu
      const numMatch = line.match(/(?:^|\n)\s*Số\s*(?!liệu\b|lượng\b|thứ\b|phận\b|hóa\b)[:.]?\s*([0-9a-zA-Z\/\-_.]+)/i);
      if (numMatch && numMatch[1].length >= 2 && !/^(trong|ngày|tháng|năm|li)$/i.test(numMatch[1])) {
        docNumber = `Số: ${numMatch[1]}`;
      } else if (/^Số\s*:\s*$/i.test(line) && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (/^[0-9a-zA-Z\/\-_.]+$/.test(nextLine) && !/^li$/i.test(nextLine)) {
          docNumber = `Số: ${nextLine}`;
        }
      }

      // Địa danh và ngày tháng
      const dateMatch = line.match(/(?:[A-ZÀ-Ỹa-zà-ỹ\s]+,\s*)?ngày\s*\d{1,2}\s*tháng\s*\d{1,2}\s*năm\s*\d{4}/i);
      if (dateMatch) {
        locationAndDate = dateMatch[0].trim();
      }

      // Tên loại văn bản
      if (/^(?:BÁO CÁO|PHIẾU TRÌNH|TỜ TRÌNH|QUYẾT ĐỊNH|THÔNG BÁO|KẾ HOẠCH|CÔNG VĂN|GIẤY MỜI)\b/i.test(line)) {
        hasExplicitTitle = true;
        title = line.toUpperCase();
        bodyStartIndex = i + 1;

        // Trích yếu nội dung: dòng ngay sau hoặc ghép các dòng viết hoa/dấu hai chấm
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (
            !/^(?:Kính gửi|Đơn vị trình|Thực hiện|Căn cứ|Nơi nhận|Theo đề nghị)(?:\s|[:\-,.]|$)/i.test(nextLine) &&
            !/^(?:[I|V|X]+\.|\d+[\.\)]|\bPHẦN\b|[-*•+]|[a-zđ]\))/i.test(nextLine) &&
            !/^(?:CỘNG HÒA|ỦY BAN|UBND|Số:)/i.test(nextLine) &&
            !/^\(/.test(nextLine) &&
            nextLine.length < 250
          ) {
            const isExplicitSubjectStart =
              (nextLine === nextLine.toUpperCase() && nextLine.length > 5) ||
              /^(?:Về việc|V\/v)(?:\s|[:\-,.]|$)/i.test(nextLine) ||
              /^(?:Kết quả|Tình hình|Phương hướng|Kế hoạch|Nhiệm vụ|Sơ kết|Tổng kết|Đánh giá|Báo cáo|Về)(?:\s|[:\-,.]|$)/i.test(nextLine);

            if (isExplicitSubjectStart) {
              const subjectParts: string[] = [nextLine];
              let curIdx = i + 2;
              while (curIdx < Math.min(i + 6, lines.length)) {
                const checkLine = lines[curIdx];
                if (
                  /^(?:Kính gửi|Đơn vị trình|Thực hiện|Căn cứ|Nơi nhận|Theo đề nghị)(?:\s|[:\-,.]|$)/i.test(checkLine) ||
                  /^(?:[A-Z]\.|\bPHẦN\b|[I|V|X]+\.|\d+[\.\)]|[-*•+]|[a-zđ]\))/i.test(checkLine) ||
                  /^(?:CỘNG HÒA|ỦY BAN|UBND|Số:)/i.test(checkLine) ||
                  /^\(/.test(checkLine) ||
                  checkLine.length > 250
                ) {
                  break;
                }
                subjectParts.push(checkLine);
                curIdx++;
                if (/[.:]\s*$/.test(checkLine)) {
                  break;
                }
              }
              subject = subjectParts.join(' ').replace(/\s+/g, ' ').trim();
              bodyStartIndex = curIdx;
            }
          }
        }
        break;
      }
    }

    // Tách chuẩn superiorAgency và issuingAgency nếu bị dính hoặc trùng lặp
    if (superiorAgency && issuingAgency) {
      if (issuingAgency.includes(superiorAgency)) {
        const remaining = issuingAgency.replace(superiorAgency, '').replace(/^[\s\-–—:]+/, '').trim();
        if (remaining) {
          issuingAgency = remaining;
        }
      }
    } else if (!superiorAgency && issuingAgency) {
      const matchSplit = issuingAgency.match(/^(ỦY BAN NHÂN DÂN|UỶ BAN NHÂN DÂN|UBND|TẬP ĐOÀN|TỔNG CÔNG TY)\s+(.+)$/i);
      if (matchSplit) {
        superiorAgency = matchSplit[1].toUpperCase();
        issuingAgency = matchSplit[2].toUpperCase();
      }
    }

    // Nhận diện Công văn hành chính khi không có dòng tiêu đề to
    if (!hasExplicitTitle) {
      for (let i = 0; i < Math.min(18, lines.length); i++) {
        const line = lines[i];
        if (/^(?:V\/v|Về việc)\b/i.test(line)) {
          title = 'CÔNG VĂN';
          const subParts: string[] = [line];
          let curIdx = i + 1;
          while (curIdx < Math.min(i + 4, lines.length)) {
            const cl = lines[curIdx];
            if (/^(?:Kính gửi|Hà Nội|TP|Ngày|Căn cứ|[I|V|X]+\.|\d+\.)/i.test(cl)) break;
            if (cl.length > 150) break;
            subParts.push(cl);
            curIdx++;
          }
          subject = subParts.join(' ').replace(/\s+/g, ' ').trim();
          bodyStartIndex = Math.max(bodyStartIndex, curIdx);
          break;
        }
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

    // Quét phần kết thúc (Footer): Nơi nhận & Chữ ký từ cuối lên (quét toàn bộ phần sau bodyStartIndex)
    for (let i = lines.length - 1; i >= bodyStartIndex; i--) {
      const line = lines[i];

      // Chức danh người ký
      if (/^(?:CHỦ TỊCH|Q\.\s*CHỦ TỊCH|PHÓ CHỦ TỊCH|GIÁM ĐỐC|PHÓ GIÁM ĐỐC|TỔNG GIÁM ĐỐC|PHÓ TỔNG GIÁM ĐỐC|TRƯỞNG PHÒNG|TRƯỞNG CÔNG AN|CHÁNH VĂN PHÒNG|KT\.\s*CHỦ TỊCH|KT\.\s*TỔNG GIÁM ĐỐC|KT\.\s*GIÁM ĐỐC|TM\.\s*ỦY BAN NHÂN DÂN)/i.test(line)) {
        if (!signerTitle) {
          const titleParts: string[] = [line];
          let k = i + 1;
          while (k < lines.length && k <= i + 3) {
            const nextL = lines[k];
            if (/^(?:PHÓ\s+CHỦ\s+TỊCH|CHỦ\s+TỊCH|PHÓ\s+GIÁM\s+ĐỐC|GIÁM\s+ĐỐC|ỦY\s+VIÊN)/i.test(nextL)) {
              titleParts.push(nextL);
              k++;
            } else {
              break;
            }
          }
          signerTitle = titleParts.join('\n');
          bodyEndIndex = Math.min(bodyEndIndex, i);

          // Tên người ký ở dòng sau các chức danh
          if (k < lines.length) {
            const possibleName = lines[k];
            if (!/^(?:Nơi nhận|Lưu:|BIỂU|BẢNG|PHỤ LỤC)/i.test(possibleName) && possibleName.length < 40 && possibleName.split(' ').length >= 2 && !/[0-9:.]/.test(possibleName)) {
              signerName = possibleName;
            }
          }
        }
      }

      // Nơi nhận
      if (/^Nơi nhận\s*[:\s]/i.test(line)) {
        bodyEndIndex = Math.min(bodyEndIndex, i);
        for (let j = i + 1; j < lines.length; j++) {
          const recLine = lines[j];
          const recClean = recLine.replace(/^[-*•+\s]+/, '').replace(/;$/, '').trim();
          if (recClean.length >= 3 && (recLine.startsWith('-') || recLine.startsWith('*') || recLine.startsWith('+') || recLine.toLowerCase().startsWith('lưu:'))) {
            if (!recipients.includes(recClean)) recipients.push(recClean);
          } else if (!/^\s*$/.test(recLine) && !recLine.startsWith('-')) {
            break;
          }
        }
      }
    }

    let isInsideFootnote = false;
    let lastUnclosedBodyElIndex = -1;

    // Phân tích các đoạn nội dung thân bài với Bộ Nối Liền Thông Minh (Intelligent Paragraph & Heading Stitcher)
    for (let i = bodyStartIndex; i < bodyEndIndex; i++) {
      const line = lines[i];

      // Bỏ qua dòng trống, dòng đơn ký tự hoặc số trang cô lập
      if (line.length <= 1) continue;
      if (/^---\s*PAGE\s+\d+\s*---$/i.test(line) || /^\d{1,3}$/.test(line)) {
        isInsideFootnote = false;
        continue;
      }

      const cleanContent = line.replace(/^[-*•+\s]+/, '').trim();
      if (cleanContent.length <= 2 && !/^\d+\.?$/.test(cleanContent)) continue; // Bỏ qua ký tự dọc cô lập do scan lỗi

      // Bỏ qua các dòng lặp lại header/motto
      if (/^(?:CỘNG\s*HÒA\s*XÃ\s*HỘI|CỘNGHÒAXÃHỘI|Độc\s*lập\s*-\s*Tự\s*do|Độc\s*lập\s*–\s*Tự\s*do|Độclập-Tựdo|UBND|Số:)/i.test(line)) continue;
      if (line === superiorAgency || line === issuingAgency || line === docNumber || line === locationAndDate) continue;
      if (line === title || line === subject || line === recipientsLine || line === submittingUnit) continue;

      // 1. Phân loại cấu trúc dòng
      const isHeading1 = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s*/i.test(line) || /^(?:PHẦN|Phần|MỤC|Mục)\s+(?:THỨ\s+|thứ\s+)?[A-ZÀ-Ỹa-zà-ỹ\d]+/i.test(line) || /^[A-Z]\.\s+[A-ZÀ-Ỹ\p{Lu}]/u.test(line);
      const isHeading2 = /^\d+(?:\s*\.\s*\d+)*[\.\)]\s+[A-ZÀ-Ỹ\p{Lu}]/u.test(line);
      const isListItem = /^[-*•+]\s*/.test(line) || /^[a-zđ]\)\s+/i.test(line);
      const isSubNote = /^\([^\)]+\)$/.test(line.trim());
      const isFootnote = /^(?:\*?\s*(?:Ghi chú|Chú thích|Nguồn|Lưu ý)\s*:|\(\*\)|\(\d+\)\s+|\[\d+\]\s*|[*†‡]\s*(?:Bảng|Nguồn|Số liệu|Ghi chú)|^[1-9]\d?(?:\s*[-–—]\s*|\s+)[A-ZÀ-Ỹ\p{Lu}])/u.test(line.trim());

      if (isHeading1 || isHeading2) {
        isInsideFootnote = false;
      }

      // Ghi nhận ghi chú dưới tiêu đề dạng riêng biệt
      if (isSubNote) {
        bodyElements.push({ type: 'SUB_NOTE', text: line });
        isInsideFootnote = false;
        continue;
      }

      // Ghi nhận chú thích / ghi chú cuối trang hoặc dưới bảng
      if (isFootnote) {
        isInsideFootnote = true;
        bodyElements.push({ type: 'FOOTNOTE', text: line });
        continue;
      }

      const prevElement = bodyElements.length > 0 ? bodyElements[bodyElements.length - 1] : null;

      // Xử lý nối tiếp ghi chú FOOTNOTE nhiều dòng (bao gồm các câu diễn giải tiếp theo và bullet points trong cùng chú thích)
      if (isInsideFootnote && prevElement && prevElement.type === 'FOOTNOTE') {
        if (!isHeading1 && !isHeading2) {
          const prevEndsTerminal = /[.;!?]\s*$/.test(prevElement.text.trim());
          const isBullet = /^[-*•+]\s*/.test(line);
          const sep = (isBullet || (prevEndsTerminal && !/^\p{Ll}/u.test(line))) ? '\n' : ' ';
          prevElement.text = `${prevElement.text}${sep}${line}`.replace(/[ \t]+/g, ' ');
          continue;
        } else {
          isInsideFootnote = false;
        }
      }

      // Xử lý nối câu thân bài bị ngắt qua trang bởi khối chú thích chân trang
      if (!isInsideFootnote && lastUnclosedBodyElIndex >= 0) {
        const unclosedEl = bodyElements[lastUnclosedBodyElIndex];
        const startsLower = /^\p{Ll}/u.test(line);
        const prevEndsTerminal = /[.:!?]["'”’]?\s*$/.test(unclosedEl.text.trim());

        if (startsLower && !prevEndsTerminal && !isHeading1 && !isHeading2 && !isListItem && !isFootnote && !isSubNote) {
          unclosedEl.text = `${unclosedEl.text} ${line}`.replace(/\s+/g, ' ');
          if (/[.:!?]["'”’]?\s*$/.test(unclosedEl.text.trim())) {
            lastUnclosedBodyElIndex = -1;
          }
          continue;
        }
      }

      // Không bao giờ nối tiếp vào SUB_NOTE
      if (prevElement && prevElement.type === 'SUB_NOTE') {
        if (isHeading1) {
          bodyElements.push({ type: 'HEADING_1', text: line });
        } else if (isHeading2) {
          bodyElements.push({ type: 'HEADING_2', text: line });
        } else if (isListItem) {
          bodyElements.push({ type: 'LIST_ITEM', text: line });
        } else if (isFootnote) {
          bodyElements.push({ type: 'FOOTNOTE', text: line });
        } else {
          bodyElements.push({ type: 'PARAGRAPH', text: line });
        }
        continue;
      }

      // TRƯỜNG HỢP 1: NỐI VÀO TIÊU ĐỀ LA MÃ / PHẦN (HEADING_1 BỊ NGẮT DÒNG, VÍ DỤ: "I. ... PHONG" + "TRÀO")
      if (
        prevElement &&
        prevElement.type === 'HEADING_1' &&
        !isHeading1 &&
        !isHeading2 &&
        !isListItem
      ) {
        const prevText = prevElement.text.trim();
        const prevEndsTerminal = /[.:!?]\s*$/.test(prevText);
        if (!prevEndsTerminal) {
          const isSectionOnly = /^(?:PHẦN|Phần|MỤC|Mục)\s+(?:THỨ\s+|thứ\s+)?[A-ZÀ-Ỹa-zà-ỹ\d]+$/i.test(prevText);
          const sep = isSectionOnly ? ': ' : ' ';
          if (line === line.toUpperCase() || /^\p{Ll}/u.test(line)) {
            prevElement.text = `${prevText}${sep}${line}`.replace(/\s+/g, ' ');
            continue;
          }
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
        !isListItem &&
        !isFootnote
      ) {
        const prevText = prevElement.text.trim();
        const prevEndsTerminal = /[.;!?]\s*$/.test(prevText);
        const startsLowerOrContinuation = /^(?:[\p{Ll},;)\]”’]|[-–—]\s+[a-zà-ỹ\p{Ll}])/u.test(line);

        if (!prevEndsTerminal || startsLowerOrContinuation) {
          prevElement.text = `${prevElement.text} ${line}`.replace(/\s+/g, ' ');
          lastUnclosedBodyElIndex = !/[.;!?]\s*$/.test(prevElement.text.trim()) ? bodyElements.length - 1 : -1;
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
        !isListItem &&
        !isFootnote
      ) {
        const prevText = prevElement.text.trim();

        // Kiểm tra từ viết tắt hành chính không được coi là kết thúc đoạn
        const isAbbreviationEnd = /(?:TP|Tx|Tt|Ths|Bs|Gs|TS|PGS|K\/g|Đ\/c|Đc|đ\/c|đc|v\.v|v\.v\.|NĐ-CP|QĐ-UBND|BC-UBND|TTr-UBND|CV-UBND|Số|số)\.\s*$/i.test(prevText);
        const isDecimalSplit = /\d+\.\s*$/.test(prevText) && /^\d+/.test(line);
        const prevEndsWithTerminal = /[.:!?]["'”’]?\s*$/.test(prevText) && !isAbbreviationEnd && !isDecimalSplit;

        const startsLowerOrContinuation = /^(?:[\p{Ll},;)\]”’]|[-–—]\s+[a-zà-ỹ\p{Ll}])/u.test(line);

        // Nối tiếp nếu dòng trước chưa có dấu câu kết thúc HOẶC dòng này bắt đầu bằng chữ thường / ký tự tiếp diễn
        if (!prevEndsWithTerminal || startsLowerOrContinuation) {
          prevElement.text = `${prevElement.text} ${line}`.replace(/\s+/g, ' ');
          lastUnclosedBodyElIndex = !/[.:!?]["'”’]?\s*$/.test(prevElement.text.trim()) ? bodyElements.length - 1 : -1;
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
      } else if (isFootnote) {
        bodyElements.push({ type: 'FOOTNOTE', text: line });
      } else {
        bodyElements.push({ type: 'PARAGRAPH', text: line });
      }

      if (!isFootnote) {
        lastUnclosedBodyElIndex = !/[.:!?]["'”’]?\s*$/.test(line.trim()) ? bodyElements.length - 1 : -1;
      }
    }

    // Tinh chỉnh vị trí Footnote khi gặp Orphan Heading ở cuối trang PDF:
    // Nếu một Heading (HEADING_1 hoặc HEADING_2) nằm ngay trước các FOOTNOTE mà không có nội dung thân bài đi kèm,
    // các FOOTNOTE này thực chất là chú thích của trang trước/mục trước bị đẩy xuống chân trang.
    // Đưa Footnote lên trước Heading để Heading nối liền thân bài của mục đó.
    for (let i = 0; i < bodyElements.length - 1; i++) {
      if (bodyElements[i].type === 'HEADING_1' || bodyElements[i].type === 'HEADING_2') {
        const footnotesToMove: typeof bodyElements = [];
        let j = i + 1;
        while (j < bodyElements.length && bodyElements[j].type === 'FOOTNOTE') {
          footnotesToMove.push(bodyElements[j]);
          j++;
        }
        if (footnotesToMove.length > 0) {
          bodyElements.splice(i + 1, footnotesToMove.length);
          bodyElements.splice(i, 0, ...footnotesToMove);
          i += footnotesToMove.length;
        }
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
        recipients: recipients.length >= 3
          ? recipients
          : (metadata?.recipients && Array.isArray(metadata.recipients) && metadata.recipients.length > 0
              ? metadata.recipients
              : (recipients.length > 0 ? recipients : ['- Như trên;', '- Lưu: VT.'])),
        signerTitle: signerTitle || metadata?.signer?.title || 'CHỦ TỊCH',
        signerName: signerName || metadata?.signer?.name || null
      },
      cleanText: cleaned
    };
  }
}
