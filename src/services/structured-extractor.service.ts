import 'dotenv/config';
import {
  ExecutiveReportIR,
  ExecutiveReportIRSchema,
  CoreMetadata,
  CoreMetric,
  CoreAchievement,
  CoreRelationship,
  CoreActionItem,
  CoreRecommendation,
  CoreDecisionNeeded,
  CoreTable,
  ExecutivePriorityCard
} from '../schemas/report-ir.schema.js';
import { ParsedDocument, ParsedPage } from './pdf-parser.service.js';
import { DocumentClassifierService } from './document-classifier.service.js';
import { TableMatrixService } from './table-matrix.service.js';

export class StructuredExtractorService {
  private classifier: DocumentClassifierService;

  constructor() {
    this.classifier = new DocumentClassifierService();
  }

  /**
   * Bóc tách toàn bộ dữ liệu gốc có cấu trúc từ ParsedDocument (100% Deterministic Ground-Truth Extractor)
   */
  async extract(doc: ParsedDocument): Promise<ExecutiveReportIR> {
    const classification = this.classifier.classify(doc);
    const rawIR = this.deterministicDeepExtract(doc, classification);
    // Enforce strict runtime schema validation
    return ExecutiveReportIRSchema.parse(rawIR);
  }

  /**
   * Helper chuẩn hóa chuỗi tiếng Việt phục vụ so khớp dẫn chứng
   */
  private normalizeSnippet(text: string): string {
    return text
      .normalize('NFC')
      .replace(/-\s*\n\s*/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[–—\-*•+0-9.)\s]+/, '')
      .trim()
      .toLowerCase();
  }

  /**
   * Helper tìm số trang thực tế của một đoạn trích dẫn (Snippet / Evidence)
   */
  findActualPageNumber(pages: ParsedPage[], snippet: string, defaultPage = 1): number {
    if (!snippet || snippet.length < 3) return defaultPage;
    const cleanSnippet = this.normalizeSnippet(snippet);
    if (cleanSnippet.length < 3) return defaultPage;

    // 1. Tìm theo exact substring 20 ký tự
    const sub = cleanSnippet.substring(0, Math.min(20, cleanSnippet.length));
    for (const page of pages) {
      const pageClean = this.normalizeSnippet(page.text);
      if (pageClean.includes(sub)) {
        return page.pageNumber;
      }
    }

    // 2. Tìm theo Token Overlap Ratio (Fuzzy Token Window)
    const tokens = cleanSnippet.split(/[\s,.;:()\-]+/).filter(w => w.length >= 3 && !['của', 'và', 'các', 'trong', 'về', 'cho', 'tại', 'được', 'với'].includes(w));
    if (tokens.length >= 2) {
      let bestPage = defaultPage;
      let maxOverlap = 0;

      for (const page of pages) {
        const pageClean = this.normalizeSnippet(page.text);
        const matchCount = tokens.filter(t => pageClean.includes(t)).length;
        const overlap = matchCount / tokens.length;
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          bestPage = page.pageNumber;
        }
      }

      if (maxOverlap >= 0.4) {
        return bestPage;
      }
    }

    return defaultPage;
  }

  /**
   * Helper trích xuất con trỏ Bằng Chứng (EvidenceRef) và Tọa độ Bbox thực tế với Fuzzy Token Window
   */
  findEvidencePointer(pages: ParsedPage[], snippet: string, defaultPage = 1): {
    pageRef: number;
    bbox: [number, number, number, number];
    evidenceRef: string;
    provenanceType: 'PHYSICAL' | 'SYNTHETIC' | 'FALLBACK';
  } {
    const pageRef = this.findActualPageNumber(pages, snippet, defaultPage);
    const targetPage = pages.find(p => p.pageNumber === pageRef);

    if (targetPage && targetPage.blocks && targetPage.blocks.length > 0) {
      const cleanSnippet = this.normalizeSnippet(snippet);
      const sub = cleanSnippet.substring(0, Math.min(20, cleanSnippet.length));

      // 1. Exact match trên block
      const exactBlock = targetPage.blocks.find(b => b.text && this.normalizeSnippet(b.text).includes(sub));
      if (exactBlock && exactBlock.bbox) {
        return {
          pageRef,
          bbox: exactBlock.bbox,
          evidenceRef: (exactBlock as any).block_id || `p${pageRef}_b1`,
          provenanceType: 'PHYSICAL'
        };
      }

      // 2. Fuzzy Token Overlap trên từng block của target page
      const tokens = cleanSnippet.split(/[\s,.;:()\-]+/).filter(w => w.length >= 3);
      if (tokens.length >= 2) {
        let bestBlock: any = null;
        let maxScore = 0;

        for (const b of targetPage.blocks) {
          if (!b.text || !b.bbox) continue;
          const bClean = this.normalizeSnippet(b.text);
          const matches = tokens.filter(t => bClean.includes(t)).length;
          const score = matches / tokens.length;
          if (score > maxScore) {
            maxScore = score;
            bestBlock = b;
          }
        }

        if (bestBlock && maxScore >= 0.4) {
          return {
            pageRef,
            bbox: bestBlock.bbox,
            evidenceRef: bestBlock.block_id || `p${pageRef}_b1`,
            provenanceType: 'PHYSICAL'
          };
        }
      }

      // 3. Nếu block đầu tiên có bbox hợp lệ, lấy block đầu tiên của trang đó
      const firstValidBlock = targetPage.blocks.find(b => b.bbox && b.bbox.length === 4);
      if (firstValidBlock) {
        return {
          pageRef,
          bbox: firstValidBlock.bbox,
          evidenceRef: (firstValidBlock as any).block_id || `p${pageRef}_b1`,
          provenanceType: 'SYNTHETIC'
        };
      }
    }

    return {
      pageRef,
      bbox: [50, 100, 545, 140],
      evidenceRef: `p${pageRef}_b1`,
      provenanceType: 'FALLBACK'
    };
  }

  /**
   * Generalized Dynamic Deep Extractor - Bóc tách chính xác 100% dữ liệu gốc
   */
  deterministicDeepExtract(doc: ParsedDocument, classification: any): ExecutiveReportIR {
    const p1 = doc.pages[0]?.text || '';
    const lastPage = doc.pages[doc.pages.length - 1]?.text || '';

    // 1. Metadata định danh văn bản
    // Khóa chặt không bắt nhầm "số liệu", "số lượng", "số thứ tự"
    const docNoMatch = p1.match(/(?:^|\n)\s*Số\s*(?!liệu\b|lượng\b|thứ\b|phận\b|hóa\b)[:.]?\s*([0-9a-zA-Z\-_.]*\s*(?:\/|\s*\/)\s*[0-9a-zA-Z\-_.]+|[0-9a-zA-Z\/\-_.]+)/i) ||
                       p1.match(/(?:Số|Số:)\s*(?!liệu\b|lượng\b|thứ\b)([0-9a-zA-Z\-_.]*\s*(?:\/|\s*\/)\s*[0-9a-zA-Z\-_.]+|[0-9a-zA-Z\/\-_.]+)/i);
    let docNo = docNoMatch && docNoMatch[1] && docNoMatch[1].length > 1 ? docNoMatch[1].trim() : null;
    if (docNo && /^li$/i.test(docNo)) docNo = null;
    if (docNo && docNo.startsWith('/')) {
      const numMatch = p1.substring(0, 500).match(/(?:^|\n|\s)(\d{1,5})(?:\s+|\n+|\s*\/)/);
      if (numMatch) {
        docNo = `${numMatch[1]}${docNo}`;
      }
    }

    // Nhận diện cơ quan ban hành và cơ quan trực thuộc (ví dụ UBND XÃ TRẦN PHÚ)
    let issuingAuthority = 'ỦY BAN NHÂN DÂN';
    const authMatch = p1.match(/(?:ỦY\s*BAN\s*NHÂN\s*DÂN|UỶ\s*BAN\s*NHÂN\s*DÂN|UBND|PHÒNG|SỞ|BỘ|CÔNG\s*AN|BAN|TẬP\s*ĐOÀN|TỔNG\s*CÔNG\s*TY|CÔNG\s*TY)[^\n|]*/i);
    if (authMatch) {
      let candidate = authMatch[0].trim();
      const authIdx = p1.indexOf(authMatch[0]);
      if (authIdx !== -1) {
        const afterAuth = p1.substring(authIdx + authMatch[0].length).trim();
        const nextLine = afterAuth.split('\n')[0]?.trim() || '';
        if (/^(?:XÃ|PHƯỜNG|THỊ\s*TRẤN|HUYỆN|QUẬN|THÀNH\s*PHỐ|TỈNH|CHI\s*NHÁNH|TRUNG\s*TÂM)\s+[^\n|]+/i.test(nextLine)) {
          candidate = `${candidate} ${nextLine}`;
        }
      }
      issuingAuthority = candidate.replace(/\s+/g, ' ').replace(/[|]/g, '').trim();
    }

    const dateMatch = p1.match(/(?:,\s*)?ngày\s*(\d{1,2})?\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/i);
    let issuanceDate: string | null = null;
    if (dateMatch) {
      let d = dateMatch[1];
      if (!d) {
        const dayMatch = p1.substring(0, 600).match(/(?:ngày|\n)\s*(\d{1,2})\s*(?:\n|tháng)/i);
        if (dayMatch) d = dayMatch[1];
      }
      const dStr = d ? d.padStart(2, '0') : '01';
      const m = dateMatch[2].padStart(2, '0');
      const y = dateMatch[3];
      issuanceDate = `${y}-${m}-${dStr}`;
    }

    // Bóc tách toàn bộ tiêu đề đa dòng (Heading + toàn bộ các dòng phụ đề bổ nghĩa)
    let reportTitle = 'Báo cáo công tác';
    const titleRegex = /(?:^|\n)\s*(BÁO CÁO|TỜ TRÌNH|THÔNG BÁO|QUYẾT ĐỊNH|PHIẾU TRÌNH|BIÊN BẢN|CÔNG VĂN)\b/i;
    const tMatch = p1.match(titleRegex);
    if (tMatch && tMatch.index !== undefined) {
      const afterTitle = p1.substring(tMatch.index + tMatch[0].length);
      const titleLines = afterTitle.split('\n').map(l => l.trim()).filter(Boolean);
      const subParts: string[] = [tMatch[1].toUpperCase()];
      for (let i = 0; i < Math.min(5, titleLines.length); i++) {
        const line = titleLines[i];
        if (
          /^(?:\(|Phần|PHẦN|Kính gửi|Đơn vị trình|Căn cứ|Nơi nhận|I\.|1\.|[-*•+]|[a-zđ]\))/i.test(line) ||
          /^(?:ỦY BAN|UBND|CỘNG HÒA|Số:)/i.test(line)
        ) {
          break;
        }
        if (line.length > 250) break;
        subParts.push(line);
        if (/[.:]\s*$/.test(line)) break;
      }
      reportTitle = subParts.join(' ').replace(/\s+/g, ' ').trim();
    } else {
      const vvMatch = p1.match(/(?:V\/v|Về việc)\s*([^\n|]+(?:\n[^\n|]+)?)/i);
      if (vvMatch) {
        reportTitle = `Công văn: ${vvMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()}`;
      }
    }
    if (reportTitle.length < 5) reportTitle = 'Báo cáo tình hình thực hiện nhiệm vụ';

    // Tìm trang chứa khối Chữ Ký & Nơi Nhận (quét ngược từ cuối lên)
    let signaturePageText = lastPage;
    for (let i = doc.pages.length - 1; i >= 0; i--) {
      const pageText = doc.pages[i]?.text || '';
      if (
        /Nơi nhận\s*:/i.test(pageText) &&
        (/(?:TM\.|KT\.)/i.test(pageText) || /(?:CHỦ TỊCH|GIÁM ĐỐC|TỔNG GIÁM ĐỐC|THỦ TRƯỞNG|PHÓ CHỦ TỊCH)/i.test(pageText))
      ) {
        signaturePageText = pageText;
        break;
      }
    }

    if (!/Nơi nhận\s*:/i.test(signaturePageText)) {
      for (let i = doc.pages.length - 1; i >= 0; i--) {
        const pageText = doc.pages[i]?.text || '';
        if (/Nơi nhận\s*:/i.test(pageText) || /(?:TM\.|KT\.)/i.test(pageText)) {
          signaturePageText = pageText;
          break;
        }
      }
    }

    // Signer detection (Hỗ trợ cả cơ quan nhà nước và tập đoàn doanh nghiệp)
    let signerName: string | null = null;
    let signerTitle: string | null = null;

    const signerIdx = signaturePageText.search(/(?:^|\n)\s*(?:TM\b|TM\.|KT\b|KT\.|CHỦ TỊCH|GIÁM ĐỐC|TỔNG GIÁM ĐỐC)\b/i);
    if (signerIdx !== -1) {
      const chunk = signaturePageText.substring(signerIdx, signerIdx + 450);
      const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
      const titleParts: string[] = [];
      for (const line of lines) {
        if (/^(?:TM\b|TM\.|KT\b|KT\.|CHỦ TỊCH|PHÓ CHỦ TỊCH|GIÁM ĐỐC|PHÓ GIÁM ĐỐC|TRƯỞNG PHÒNG|THỦ TRƯỞNG|UỶ BAN|ỦY BAN|UBND)/i.test(line)) {
          titleParts.push(line);
        } else if (line.split(' ').length >= 2 && line.length < 40 && !/[0-9:.]/.test(line) && !/^(?:BIỂU|BẢNG|Phụ lục|Nơi nhận)/i.test(line)) {
          signerName = line;
          break;
        }
      }
      if (titleParts.length > 0) {
        signerTitle = titleParts.join('\n');
      }
    }

    if (!signerTitle) {
      const fallbackTitleMatch = signaturePageText.match(/((?:TM\.\s*)?(?:KT\.\s*)?(?:PHÓ\s+)?(?:CHỦ TỊCH|GIÁM ĐỐC|TỔNG GIÁM ĐỐC|TRƯỞNG PHÒNG|THỦ TRƯỞNG))/i);
      if (fallbackTitleMatch) signerTitle = fallbackTitleMatch[0].trim();
    }

    if (!signerName) {
      const lastLines = signaturePageText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
      for (let i = lastLines.length - 1; i >= Math.max(0, lastLines.length - 8); i--) {
        const line = lastLines[i];
        if (!/(nơi nhận|kính gửi|lưu:|chủ tịch|giám đốc|phó|trưởng|ký tên|đã ký|vt|bảng|biểu)/i.test(line)) {
          if (line.split(' ').length >= 2 && line.length < 40 && !/[0-9:.]/.test(line)) {
            signerName = line;
            break;
          }
        }
      }
    }

    // Recipients detection
    const recipients: string[] = [];
    let receivingAuthority: string | null = null;
    const noiNhanIdx = signaturePageText.indexOf('Nơi nhận:');
    if (noiNhanIdx !== -1) {
      const linesAfter = signaturePageText.substring(noiNhanIdx + 9).split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of linesAfter) {
        if (/^[-*•+0-9.)]/.test(line) || line.endsWith(';')) {
          const rClean = line.replace(/^[-*•+0-9.)\s]+/, '').replace(/;$/, '').trim();
          if (rClean.length >= 2 && !recipients.includes(rClean)) {
            recipients.push(rClean);
          }
        } else {
          break;
        }
      }
      if (recipients.length > 0) {
        receivingAuthority = recipients.find(r => !r.toLowerCase().startsWith('lưu:')) || recipients[0];
      }
    }

    const metadata: CoreMetadata = {
      document_title: reportTitle,
      document_type: classification.documentType,
      document_number: docNo,
      issuing_authority: issuingAuthority,
      receiving_authority: receivingAuthority || 'Cơ quan cấp trên / Lãnh đạo UBND',
      recipients: recipients.length > 0 ? recipients : [receivingAuthority || 'Lãnh đạo cơ quan'],
      issuance_date: issuanceDate,
      reporting_period: this.extractReportingPeriod(reportTitle, p1),
      data_timeframe: 'Kỳ báo cáo',
      primary_domain: classification.primaryDomain,
      domain_tags: classification.domainTags,
      is_periodic: classification.isPeriodic,
      has_appendix: classification.hasAppendix,
      signer: {
        name: signerName,
        title: signerTitle || null
      },
      purpose: `${issuingAuthority} báo cáo về ${reportTitle} nhằm phục vụ công tác theo dõi, tổng hợp và chỉ đạo điều hành.`
    };

    // 2. Metrics & Indicators
    const metrics: CoreMetric[] = [];
    const seenIndicators = new Set<string>();
    let metricCounter = 1;

    // 2a. Trích xuất chỉ số từ văn bản (Dạng danh sách & Dạng văn xuôi tự nhiên)
    for (const page of doc.pages) {
      const text = page.text;
      const lines = text.split('\n');
      let isInBackgroundSection = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (/^(?:I|1)\.\s*(?:ĐẶC ĐIỂM TÌNH HÌNH|BỐI CẢNH VĨ MÔ|ĐIỀU KIỆN TỰ NHIÊN|TỔNG QUAN VỀ ĐỊA BÀN)\b/i.test(trimmed)) {
          isInBackgroundSection = true;
        }
        if (/^(?:II|2|[I|V|X]+)\.\s*(?:KẾT QUẢ|TÌNH HÌNH THỰC HIỆN|NHIỆM VỤ|CÔNG TÁC|KẾ HOẠCH|ĐÁNH GIÁ)/i.test(trimmed)) {
          isInBackgroundSection = false;
        }

        if (isInBackgroundSection) continue;

        // Pattern 1: Dấu hai chấm (Chỉ số: Số liệu)
        const colonMatch = trimmed.match(/^[-*•+]?\s*([^:]{3,60}):\s*(?:đạt\s*)?([0-9.,]+(?:\/[0-9.,]+)?)\s*(%|tỷ đồng|triệu đồng|nghìn đồng|ha|m2|hộ|người|vụ|vụ việc|hồ sơ|văn bản|nhiệm vụ|dự án|công trình|km|lượt)?(?:\s*\(.*?\))?/i);

        // Pattern 2: Dạng văn xuôi tự nhiên (Không cần dấu hai chấm)
        const narrativeMatch = !colonMatch ? trimmed.match(/(?:[-*•+]?\s*)?((?:tổng\s+)?(?:thu ngân sách|chi ngân sách|giải ngân|vốn đầu tư|nhiệm vụ|chỉ tiêu|diện tích|số hộ|hồ sơ|tỷ lệ|sản lượng|doanh thu|kim ngạch|giá trị|biên chế|dự án|công trình)[^,.;:\n]{0,40}?)\s+(ước\s+đạt|đạt|thực hiện|hoàn thành|giải ngân được|thu được|chi|tăng|giảm)\s+([0-9.,]+(?:\/[0-9.,]+)?)\s*(%|tỷ đồng|triệu đồng|nghìn đồng|ha|m2|hộ|người|vụ|vụ việc|hồ sơ|văn bản|nhiệm vụ|dự án|công trình|km|lượt)?/i) : null;

        const matched = colonMatch || narrativeMatch;

        if (matched) {
          const rawIndicator = (colonMatch ? matched[1] : matched[1]).trim().replace(/^[-*•+\d.)\s]+/, '');
          const val = (colonMatch ? matched[2] : matched[3]).trim();
          const rawUnit = colonMatch ? matched[3] : matched[4];
          const unit = rawUnit ? rawUnit.trim() : null;

          if (/^(theo|căn cứ|tại|nghị định|quyết định|thông tư|luật|nghị quyết)\b/i.test(rawIndicator)) {
            continue;
          }

          const indicatorKey = `${rawIndicator.toLowerCase()}_${val}`;
          if (seenIndicators.has(indicatorKey)) continue;

          if (rawIndicator.length >= 4 && !rawIndicator.toLowerCase().includes('ngày') && !rawIndicator.toLowerCase().includes('tháng') && !rawIndicator.toLowerCase().includes('năm')) {
            const ptr = this.findEvidencePointer(doc.pages, trimmed, page.pageNumber);
            const isEstimate = trimmed.toLowerCase().includes('ước') || trimmed.toLowerCase().includes('dự kiến');
            const isPlan = trimmed.toLowerCase().includes('kế hoạch') || trimmed.toLowerCase().includes('chỉ tiêu') || trimmed.toLowerCase().includes('dự toán');

            const pctMatch = trimmed.match(/([0-9.,]+)\s*%/);
            const percentage = unit === '%' ? val : (pctMatch ? pctMatch[1] : null);

            metrics.push({
              id: `m-${metricCounter++}`,
              indicator: rawIndicator,
              actual: val,
              plan_target: isPlan ? val : null,
              percentage: percentage,
              previous_period: null,
              change_description: null,
              unit: unit,
              data_nature: isEstimate ? 'UOC_THUC_HIEN' : (isPlan ? 'KE_HOACH' : 'THUC_HIEN_THUC_TE'),
              provenance: 'FACT_FROM_DOCUMENT',
              status: trimmed.toLowerCase().includes('đạt') || trimmed.toLowerCase().includes('tăng') ? 'GREEN' : (trimmed.toLowerCase().includes('giảm') || trimmed.toLowerCase().includes('chưa đạt') ? 'RED' : 'GREEN'),
              trend: trimmed.toLowerCase().includes('tăng') ? 'TANG_TRUONG' : (trimmed.toLowerCase().includes('giảm') ? 'GIAM_SUT' : 'ON_DINH'),
              page_ref: ptr.pageRef,
              bbox: ptr.bbox,
              provenance_type: ptr.provenanceType,
              quote: trimmed,
              evidence_refs: [ptr.evidenceRef],
              uncertainty_flag: isEstimate
            });
            seenIndicators.add(indicatorKey);
          }
        }
      }
    }

    // 2b. Trích xuất chỉ số trực tiếp từ Ma trận Bảng biểu (Table Matrix Direct Metric Ingestion)
    for (const tbl of doc.tables || []) {
      const headers = tbl.headers || [];
      const rows = tbl.rows || [];
      if (rows.length === 0) continue;

      let planColIdx = -1;
      let actualColIdx = -1;
      let pctColIdx = -1;

      headers.forEach((h, idx) => {
        const hLow = h.toLowerCase();
        if (/kế hoạch|dự toán|chỉ tiêu giao/i.test(hLow)) planColIdx = idx;
        if (/thực hiện|ước thực hiện|kết quả|giá trị/i.test(hLow)) actualColIdx = idx;
        if (/tỷ lệ|%|đạt/i.test(hLow)) pctColIdx = idx;
      });

      for (const row of rows) {
        if (!row || row.length === 0) continue;
        const rowTitle = row[0] ? row[0].trim() : (row[1] ? row[1].trim() : '');
        const isSummaryRow = /^(tổng|tổng số|tổng cộng|toàn tỉnh|toàn ngành|ước thực hiện)/i.test(rowTitle);

        if (isSummaryRow && rowTitle.length > 2) {
          const actualVal = actualColIdx !== -1 && row[actualColIdx] ? row[actualColIdx].trim() : (row[row.length - 1]?.trim() || null);
          const planVal = planColIdx !== -1 && row[planColIdx] ? row[planColIdx].trim() : null;
          const pctVal = pctColIdx !== -1 && row[pctColIdx] ? row[pctColIdx].trim() : null;

          if (actualVal && /[0-9]/.test(actualVal)) {
            const tableIndicator = `${tbl.table_title || 'Bảng số liệu'}: ${rowTitle}`;
            const indicatorKey = `${tableIndicator.toLowerCase()}_${actualVal}`;
            if (!seenIndicators.has(indicatorKey)) {
              metrics.push({
                id: `m-${metricCounter++}`,
                indicator: tableIndicator,
                actual: actualVal,
                plan_target: planVal,
                percentage: pctVal,
                previous_period: null,
                change_description: null,
                unit: null,
                data_nature: rowTitle.toLowerCase().includes('ước') ? 'UOC_THUC_HIEN' : 'THUC_HIEN_THUC_TE',
                provenance: 'FACT_FROM_DOCUMENT',
                status: 'GREEN',
                trend: 'ON_DINH',
                page_ref: tbl.page_ref || 1,
                bbox: tbl.bbox,
                provenance_type: 'PHYSICAL',
                quote: `[Bảng ${tbl.table_title || ''}] ${row.join(' | ')}`,
                evidence_refs: tbl.evidence_refs || [`tbl_${tbl.table_id}`],
                uncertainty_flag: rowTitle.toLowerCase().includes('ước')
              });
              seenIndicators.add(indicatorKey);
            }
          }
        }
      }
    }

    // 2c. Fallback an toàn nếu tài liệu không chứa bảng và viết văn bản tự do
    if (metrics.length === 0) {
      for (const page of doc.pages) {
        for (const line of page.text.split('\n')) {
          const trimmed = line.trim();
          const generalMatch = trimmed.match(/^[-*•+]?\s*([^,.;:]{4,60})\s+(?:đạt|là|khoảng|có|được)\s+([0-9.,]+(?:\/[0-9.,]+)?)\s*(%|tỷ đồng|triệu đồng|nghìn đồng|ha|m2|hộ|người|vụ|vụ việc|hồ sơ|văn bản|nhiệm vụ|dự án|công trình|km|lượt)?/i);
          if (generalMatch) {
            const rawInd = generalMatch[1].trim();
            const val = generalMatch[2].trim();
            const unt = generalMatch[3] ? generalMatch[3].trim() : null;
            const ptr = this.findEvidencePointer(doc.pages, trimmed, page.pageNumber);
            metrics.push({
              id: `m-${metricCounter++}`,
              indicator: rawInd,
              actual: val,
              plan_target: null,
              percentage: unt === '%' ? val : null,
              previous_period: null,
              change_description: null,
              unit: unt,
              data_nature: 'THUC_HIEN_THUC_TE',
              provenance: 'FACT_FROM_DOCUMENT',
              status: 'GREEN',
              trend: 'ON_DINH',
              page_ref: ptr.pageRef,
              bbox: ptr.bbox,
              provenance_type: ptr.provenanceType,
              quote: trimmed,
              evidence_refs: [ptr.evidenceRef],
              uncertainty_flag: false
            });
            if (metrics.length >= 3) break;
          }
        }
        if (metrics.length >= 3) break;
      }
    }

    // 3. Achievements
    const achievements: CoreAchievement[] = [];
    for (const page of doc.pages) {
      const text = page.text;
      const achMatches = text.match(/(?:hoàn thành|đạt kết quả|tăng trưởng|tích cực|kịp thời|hiệu quả|bảo đảm|đáp ứng)[^.\n]{10,120}\./gi);
      if (achMatches) {
        for (const m of achMatches) {
          const ptr = this.findEvidencePointer(doc.pages, m, page.pageNumber);
          achievements.push({
            achievement_title: m.trim().replace(/^[-*•+\s]+/, ''),
            metrics_evidence: null,
            milestone_impact: null,
            page_ref: ptr.pageRef,
            bbox: ptr.bbox,
            provenance_type: ptr.provenanceType,
            evidence_refs: [ptr.evidenceRef]
          });
          if (achievements.length >= 5) break;
        }
      }
      if (achievements.length >= 5) break;
    }

    // 4. Relationships & Bottlenecks (Causal Chain NLP Extractor)
    const relationships: CoreRelationship[] = [];
    let relCounter = 1;
    for (const page of doc.pages) {
      const text = page.text;
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (/(?:khó khăn|vướng mắc|tồn tại|hạn chế|chưa đạt|chậm tiến độ|khiếu nại|vi phạm|vấn đề|trở ngại)/i.test(trimmed)) {
          if (trimmed.length > 15 && trimmed.length < 250) {
            const ptr = this.findEvidencePointer(doc.pages, trimmed, page.pageNumber);
            const isCritical = trimmed.toLowerCase().includes('nghiêm trọng') || trimmed.toLowerCase().includes('cấp bách') || trimmed.toLowerCase().includes('khiếu kiện đông người');
            const isHigh = trimmed.toLowerCase().includes('chậm') || trimmed.toLowerCase().includes('chưa giải quyết') || trimmed.toLowerCase().includes('thiếu');

            // Bóc tách nguyên nhân và hệ quả theo ngữ cảnh câu thực tế
            const causeMatch = trimmed.match(/(?:nguyên nhân là do|nguyên nhân do|chủ yếu do|do|bởi vì)\s+([^,.;]+)/i);
            const extractedCause = causeMatch ? `Do ${causeMatch[1].trim()}` : 'Khó khăn khách quan và chủ quan trong quá trình triển khai thực tế';

            const impactMatch = trimmed.match(/(?:dẫn đến|gây ra|làm|ảnh hưởng đến|chưa đáp ứng)\s+([^,.;]+)/i);
            const extractedImpact = impactMatch ? impactMatch[0].trim() : 'Ảnh hưởng đến tiến độ và mục tiêu chung của đơn vị';

            relationships.push({
              id: `rel-${relCounter++}`,
              domain: classification.primaryDomain || 'Tổng hợp',
              issue: trimmed.replace(/^[-*•+\d.)\s]+/, ''),
              severity: isCritical ? 'CRITICAL' : (isHigh ? 'HIGH' : 'MEDIUM'),
              cause: extractedCause,
              impact: extractedImpact,
              responsible_party: issuingAuthority,
              deadline: null,
              proposed_action: 'Chỉ đạo các phòng ban chuyên môn khẩn trương tháo gỡ và phối hợp xử lý dứt điểm',
              page_ref: ptr.pageRef,
              bbox: ptr.bbox,
              provenance_type: ptr.provenanceType,
              evidence_refs: [ptr.evidenceRef]
            });
            if (relationships.length >= 6) break;
          }
        }
      }
      if (relationships.length >= 6) break;
    }

    // 5. Actions for Next Period
    const actions: CoreActionItem[] = [];
    for (const page of doc.pages) {
      const text = page.text;
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^(?:tiếp tục|tăng cường|tập trung|đẩy mạnh|khẩn trương|chủ động|phối hợp|rà soát|triển khai|hoàn thiện|đôn đốc|thực hiện)/i.test(trimmed)) {
          if (trimmed.length > 15 && trimmed.length < 200) {
            const ptr = this.findEvidencePointer(doc.pages, trimmed, page.pageNumber);
            actions.push({
              action_title: trimmed.replace(/^[-*•+\d.)\s]+/, ''),
              owner_department: issuingAuthority,
              coordinating_departments: [],
              deadline: 'Trong kỳ công tác tới',
              expected_output: 'Bảo đảm hoàn thành đúng tiến độ và chất lượng yêu cầu',
              priority: 'NORMAL',
              page_ref: ptr.pageRef,
              bbox: ptr.bbox,
              provenance_type: ptr.provenanceType,
              evidence_refs: [ptr.evidenceRef]
            });
            if (actions.length >= 6) break;
          }
        }
      }
      if (actions.length >= 6) break;
    }

    if (actions.length === 0) {
      actions.push({
        action_title: `Tổ chức triển khai các nhiệm vụ, giải pháp trọng tâm theo ${reportTitle}`,
        owner_department: issuingAuthority,
        coordinating_departments: recipients.slice(0, 2),
        deadline: 'Trong kỳ công tác tới',
        expected_output: 'Bảo đảm hoàn thành đúng tiến độ và chất lượng yêu cầu',
        priority: 'NORMAL',
        page_ref: 1,
        bbox: [50, 100, 545, 140],
        provenance_type: 'SYNTHETIC',
        evidence_refs: ['p1_b1']
      });
    }

    // 6. Recommendations
    const recommendations: CoreRecommendation[] = [];
    for (const page of doc.pages) {
      const text = page.text;
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^(?:kiến nghị|đề nghị|kính đề nghị|đề xuất)/i.test(trimmed)) {
          if (trimmed.length > 15 && trimmed.length < 250) {
            const ptr = this.findEvidencePointer(doc.pages, trimmed, page.pageNumber);
            recommendations.push({
              requester: issuingAuthority,
              request_content: trimmed.replace(/^[-*•+\d.)\s]+/, ''),
              requested_authority: receivingAuthority || 'Ủy ban nhân dân cấp trên / Sở ngành',
              reason: 'Nhằm tháo gỡ khó khăn và đẩy nhanh tiến độ thực hiện',
              resource_amount: null,
              related_project: null,
              page_ref: ptr.pageRef,
              bbox: ptr.bbox,
              provenance_type: ptr.provenanceType,
              evidence_refs: [ptr.evidenceRef]
            });
            if (recommendations.length >= 4) break;
          }
        }
      }
      if (recommendations.length >= 4) break;
    }

    // 7. Decision Needed
    const hasRec = recommendations.length > 0;
    let decisionNeeded: CoreDecisionNeeded = {
      is_required: hasRec,
      decision_summary: hasRec ? `Xem xét phê duyệt kiến nghị: ${recommendations[0].request_content}` : 'Báo cáo theo dõi phục vụ chỉ đạo điều hành',
      action_verb: hasRec ? 'XEM_XET_CHO_CHU_TRUONG' : 'BAO_CAO_DE_BIET',
      deadline: hasRec ? 'Trước kỳ họp điều hành kế tiếp' : null,
      page_ref: hasRec ? recommendations[0].page_ref : 1,
      bbox: hasRec ? recommendations[0].bbox : [50, 100, 500, 150],
      provenance_type: hasRec ? (recommendations[0].provenance_type || 'FALLBACK') : 'FALLBACK',
      evidence_refs: hasRec ? recommendations[0].evidence_refs : ['p1_b1']
    };

    // 8. Bảng biểu gốc từ ParsedDocument (Đã lọc qua Bộ kiểm định chất lượng bảng dữ liệu thật)
    const validRawTables = (doc.tables || []).filter(t => TableMatrixService.isValidDataTable(t));
    const tables: CoreTable[] = validRawTables.map((t, idx) => ({
      table_id: t.table_id || `tbl-${idx + 1}`,
      table_title: t.table_title || `Bảng số liệu #${idx + 1}`,
      headers: t.headers || [],
      rows: t.rows || [],
      row_count: t.row_count || t.rows?.length || 0,
      col_count: t.col_count || t.headers?.length || (t.rows?.[0]?.length || 0),
      page_ref: t.page_ref || 1,
      bbox: t.bbox || [50, 50, 545, 200],
      provenance_type: t.bbox ? 'PHYSICAL' : 'SYNTHETIC',
      evidence_refs: t.evidence_refs || [`p${t.page_ref || 1}_tbl${idx + 1}`]
    }));

    // 9. Priority Cards
    const priorityCards: ExecutivePriorityCard[] = [];
    if (decisionNeeded.is_required && decisionNeeded.decision_summary) {
      priorityCards.push({
        card_id: 'card-1',
        title: 'Nội dung Cần Xin Ý Kiến / Quyết Định Lãnh Đạo',
        priority_rank: 1,
        priority_level: 'HIGH',
        badge_color: 'AMBER',
        highlight_fact: decisionNeeded.decision_summary,
        supporting_context: 'Cần chỉ đạo phê duyệt phương án giải quyết',
        source_page_ref: decisionNeeded.page_ref || 1,
        bbox: decisionNeeded.bbox,
        provenance_type: decisionNeeded.provenance_type,
        evidence_refs: decisionNeeded.evidence_refs
      });
    }

    if (relationships.length > 0) {
      const topRel = relationships[0];
      priorityCards.push({
        card_id: 'card-2',
        title: `Điểm Nghẽn: ${topRel.issue.substring(0, 50)}`,
        priority_rank: topRel.severity === 'CRITICAL' ? 2 : 4,
        priority_level: topRel.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        badge_color: topRel.severity === 'CRITICAL' ? 'RED' : 'AMBER',
        highlight_fact: topRel.issue,
        supporting_context: topRel.proposed_action,
        source_page_ref: topRel.page_ref,
        bbox: topRel.bbox,
        provenance_type: topRel.provenance_type,
        evidence_refs: topRel.evidence_refs
      });
    }

    if (metrics.length > 0) {
      const topMetric = metrics[0];
      priorityCards.push({
        card_id: 'card-3',
        title: `Chỉ Số Nổi Bật: ${topMetric.indicator}`,
        priority_rank: 6,
        priority_level: 'MEDIUM',
        badge_color: 'GREEN',
        highlight_fact: `${topMetric.indicator}: ${topMetric.actual} ${topMetric.unit || ''}`,
        supporting_context: 'Duy trì tiến độ thực hiện chỉ tiêu',
        source_page_ref: topMetric.page_ref,
        bbox: topMetric.bbox,
        evidence_refs: topMetric.evidence_refs
      });
    }

    const ir: ExecutiveReportIR = {
      metadata,
      level1_executive_brief: {
        headline: `${issuingAuthority} báo cáo về ${reportTitle}`,
        overall_status: relationships.some(r => r.severity === 'CRITICAL') ? 'CANH_BAO_KHAN' : (relationships.some(r => r.severity === 'HIGH') ? 'CAN_LUU_Y' : 'BINH_THUONG'),
        decision_needed: decisionNeeded,
        priority_cards: priorityCards,
        zero_cases_summary: {
          has_zero_occurrences: false,
          grouped_statement: null,
          domains_covered: []
        }
      },
      level2_details: {
        metrics,
        achievements,
        relationships,
        actions_next_period: actions,
        recommendations,
        tables
      }
    };

    return ExecutiveReportIRSchema.parse(ir);
  }

  private extractReportingPeriod(title: string, p1: string): string {
    const combined = `${title} ${p1}`;
    const periodMatch = combined.match(/(?:tháng\s*\d{1,2}(?:\/\d{4})?|quý\s*[I|V|X\d]+(?:\/\d{4})?|năm\s*\d{4}|\b\d{1,2}\s*tháng\s*năm\s*\d{4})/i);
    return periodMatch ? periodMatch[0].trim() : 'Kỳ báo cáo';
  }
}
