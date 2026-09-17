import { ParsedDocument } from './pdf-parser.service.js';

export interface ClassificationResult {
  documentType: 'BAO_CAO' | 'PHIEU_TRINH' | 'TO_TRINH' | 'QUYET_DINH' | 'THONG_BAO_KET_LUAN' | 'BIEN_BAN' | 'CONG_VAN' | 'PHU_LUC' | 'KHAC';
  primaryDomain: string;
  domainTags: string[];
  isPeriodic: boolean;
  hasAppendix: boolean;
  isPureTable?: boolean;
  urgencyLevel: 'HOA_TOC' | 'KHAN' | 'THUONG';
}

export class DocumentClassifierService {
  /**
   * Phân loại đa nhãn (Multi-label Classification) văn bản hành chính
   */
  classify(doc: ParsedDocument): ClassificationResult {
    const fullText = doc.pages.map(p => p.text).join('\n\n');
    const p1 = doc.pages[0]?.text || '';
    const lowerText = fullText.toLowerCase();
    const lowerP1 = p1.toLowerCase();

    // 1. Xác định Loại hình văn bản dựa trên Tiêu đề chính thức (Nghị định 30/2020/NĐ-CP)
    let docType: ClassificationResult['documentType'] = 'BAO_CAO';
    const isAppendix = /^\s*phụ\s+lục\b/i.test(p1) || (/(?:^|\n)\s*phụ\s+lục\b/i.test(p1.substring(0, 300)) && !lowerP1.includes('cộng hòa xã hội'));
    const isPhieuTrinh = /(?:^|\n)\s*(?:PHIẾU\s+TRÌNH|PHIẾU\s+GIẢI\s+QUYẾT)\b/i.test(p1);
    const isToTrinh = /(?:^|\n)\s*TỜ\s+TRÌNH\b/i.test(p1) && !isAppendix;
    const isBaoCao = /(?:^|\n)\s*BÁO\s+CÁO\b/i.test(p1);
    const isQuyetDinh = /(?:^|\n)\s*QUYẾT\s+ĐỊNH\b/i.test(p1) && !isBaoCao;
    const isThongBao = /(?:^|\n)\s*(?:THÔNG\s+BÁO\s+KẾT\s+LUẬN|THÔNG\s+BÁO)\b/i.test(p1);
    const isBienBan = /(?:^|\n)\s*BIÊN\s+BẢN\b/i.test(p1);
    const isCongVan = /(?:^|\n)\s*CÔNG\s+VĂN\b/i.test(p1) || (lowerP1.includes('kính gửi') && (lowerP1.includes('v/v') || lowerP1.includes('về việc')) && !isBaoCao);

    if (isAppendix) {
      docType = 'PHU_LUC';
    } else if (isPhieuTrinh) {
      docType = 'PHIEU_TRINH';
    } else if (isToTrinh) {
      docType = 'TO_TRINH';
    } else if (isBaoCao) {
      docType = 'BAO_CAO';
    } else if (isQuyetDinh) {
      docType = 'QUYET_DINH';
    } else if (isThongBao) {
      docType = 'THONG_BAO_KET_LUAN';
    } else if (isBienBan) {
      docType = 'BIEN_BAN';
    } else if (isCongVan) {
      docType = 'CONG_VAN';
    }

    // 2. Gắn Multi-label Tags và tính điểm để xác định primaryDomain chính xác
    const tags: Set<string> = new Set();
    const scores: Record<string, { count: number; name: string }> = {
      'DAU_TU_CONG': { count: 0, name: 'Đầu tư công & Xây dựng' },
      'GPMB': { count: 0, name: 'Giải phóng mặt bằng & Tái định cư' },
      'NGAN_SACH': { count: 0, name: 'Tài chính - Ngân sách' },
      'CCHC': { count: 0, name: 'Cải cách hành chính' },
      'TCD_PCTN': { count: 0, name: 'Tiếp công dân & PCTN' },
      'TU_PHAP': { count: 0, name: 'Tư pháp - Hộ tịch' },
      'NOI_VU': { count: 0, name: 'Nội vụ & Cán bộ' },
      'Y_TE': { count: 0, name: 'Y tế - Chăm sóc sức khỏe' },
      'SU_CO_THIEN_TAI': { count: 0, name: 'Phòng chống thiên tai & Sự cố' },
      'THANH_TRA': { count: 0, name: 'Thanh tra & Kiểm tra' },
      'CHUYEN_DOI_SO': { count: 0, name: 'Chuyển đổi số & Công nghệ' },
      'KTXH_TONG_HOP': { count: 0, name: 'Kinh tế - Xã hội' }
    };

    // Kiểm tra tiêu đề P1 (Trọng số 10x)
    if (lowerP1.includes('đầu tư công') || lowerP1.includes('kế hoạch vốn') || lowerP1.includes('giải ngân')) scores['DAU_TU_CONG'].count += 10;
    if (lowerP1.includes('giải phóng mặt bằng') || lowerP1.includes('bồi thường') || lowerP1.includes('gpmb')) scores['GPMB'].count += 10;
    if (lowerP1.includes('ngân sách') || lowerP1.includes('quyết toán')) scores['NGAN_SACH'].count += 10;
    if (lowerP1.includes('cải cách hành chính') || lowerP1.includes('cchc')) scores['CCHC'].count += 10;
    if (lowerP1.includes('tiếp công dân') || lowerP1.includes('khiếu nại') || lowerP1.includes('tố cáo') || lowerP1.includes('pctn')) scores['TCD_PCTN'].count += 10;
    if (lowerP1.includes('tư pháp')) scores['TU_PHAP'].count += 10;
    if (lowerP1.includes('nội vụ')) scores['NOI_VU'].count += 10;
    if (lowerP1.includes('y tế') || lowerP1.includes('trạm y tế') || lowerP1.includes('khám bệnh') || lowerP1.includes('chữa bệnh') || lowerP1.includes('dịch bệnh')) scores['Y_TE'].count += 10;
    if (lowerP1.includes('thiên tai') || lowerP1.includes('bão')) scores['SU_CO_THIEN_TAI'].count += 10;
    if (lowerP1.includes('thanh tra')) scores['THANH_TRA'].count += 10;
    if (lowerP1.includes('chuyển đổi số') || lowerP1.includes('cđs') || lowerP1.includes('công nghệ số')) scores['CHUYEN_DOI_SO'].count += 10;
    if (lowerP1.includes('kinh tế - xã hội') || lowerP1.includes('ktxh')) scores['KTXH_TONG_HOP'].count += 10;

    // Kiểm tra toàn văn
    if (lowerText.includes('đầu tư công') || lowerText.includes('kế hoạch vốn')) { tags.add('DAU_TU_CONG'); scores['DAU_TU_CONG'].count += 3; }
    if (lowerText.includes('giải phóng mặt bằng') || lowerText.includes('gpmb')) { tags.add('GPMB'); scores['GPMB'].count += 2; }
    if (lowerText.includes('ngân sách') || lowerText.includes('quyết toán')) { tags.add('NGAN_SACH'); scores['NGAN_SACH'].count += 2; }
    if (lowerText.includes('cải cách hành chính') || lowerText.includes('cchc')) { tags.add('CCHC'); scores['CCHC'].count += 3; }
    if (lowerText.includes('tiếp công dân') || lowerText.includes('khiếu nại')) { tags.add('TCD_PCTN'); scores['TCD_PCTN'].count += 3; }
    if (lowerText.includes('tư pháp')) { tags.add('TU_PHAP'); scores['TU_PHAP'].count += 2; }
    if (lowerText.includes('nội vụ')) { tags.add('NOI_VU'); scores['NOI_VU'].count += 2; }
    if (lowerText.includes('y tế') || lowerText.includes('khám chữa bệnh') || lowerText.includes('tiêm chủng')) { tags.add('Y_TE'); scores['Y_TE'].count += 2; }
    if (lowerText.includes('thiên tai') || lowerText.includes('ngập lụt')) { tags.add('SU_CO_THIEN_TAI'); scores['SU_CO_THIEN_TAI'].count += 3; }
    if (lowerText.includes('kiểm tra, thanh tra') || lowerText.includes('kết luận thanh tra')) { tags.add('THANH_TRA'); scores['THANH_TRA'].count += 2; }
    if (lowerText.includes('kiến nghị') || lowerText.includes('đề xuất')) { tags.add('KIEN_NGHI'); }

    // Tìm primary domain có điểm cao nhất
    let highestTag = 'KTXH_TONG_HOP';
    let maxScore = -1;
    for (const [tag, item] of Object.entries(scores)) {
      if (item.count > maxScore) {
        maxScore = item.count;
        highestTag = tag;
      }
    }

    const primaryDomain = scores[highestTag]?.name || 'Hành chính tổng hợp';
    if (tags.size === 0) tags.add('CHUYEN_NGANH');

    // 3. Định kỳ vs Đột xuất
    const isPeriodic = /(tháng|quý|năm|định kỳ|tuần|sơ kết|tổng kết)/i.test(lowerP1);

    // 4. Có phụ lục
    const hasAppendix = /(phụ lục|kèm theo|bảng số)/i.test(lowerText) || doc.tables.length > 0;

    // 5. Mức độ khẩn (loại trừ từ "khẩn trương")
    let urgency: ClassificationResult['urgencyLevel'] = 'THUONG';
    if (lowerP1.includes('hỏa tốc') || lowerP1.includes('thượng khẩn')) {
      urgency = 'HOA_TOC';
    } else if ((/(?:văn bản khẩn|công văn khẩn|khẩn cấp|sự cố khẩn)/i.test(lowerP1) || /(?:thiên tai khẩn cấp|sự cố khẩn cấp)/i.test(lowerText) || tags.has('SU_CO_THIEN_TAI'))) {
      urgency = 'KHAN';
    }

    // 6. Nhận diện văn bản thuần bảng biểu
    const totalPages = doc.pages.length;
    const pagesWithTables = doc.pages.filter(p => p.tables && p.tables.length > 0).length;
    const isPureTable = docType === 'PHU_LUC' || (totalPages > 0 && pagesWithTables >= totalPages * 0.8 && doc.tables.length > 0);

    return {
      documentType: docType,
      primaryDomain,
      domainTags: Array.from(tags),
      isPeriodic,
      hasAppendix,
      isPureTable,
      urgencyLevel: urgency
    };
  }
}
