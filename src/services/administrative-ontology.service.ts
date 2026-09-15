/**
 * Administrative Taxonomy & Ontology Engine for Vietnam Government Documents
 * Tuân thủ Quyết định số 28/2018/QĐ-TTg & Khung Kiến trúc Chính phủ điện tử Việt Nam
 */

export interface AdministrativeDomainDefinition {
  code: string;
  name: string;
  parentGroup: string;
  keywords: string[];
  kpiIdentifiers: string[];
}

export type ZeroSemanticsType = 'POSITIVE_ZERO' | 'CRITICAL_ZERO' | 'NEUTRAL_ZERO';

export class AdministrativeOntologyService {
  private static readonly TAXONOMY_REGISTRY: AdministrativeDomainDefinition[] = [
    // 1. TÀI CHÍNH - NGÂN SÁCH
    {
      code: 'TCNS_THU_CHI',
      name: 'Thu chi Ngân sách Nhà nước',
      parentGroup: 'TAI_CHINH_NGAN_SACH',
      keywords: ['thu ngân sách', 'chi ngân sách', 'quyết toán', 'dự toán', 'kho bạc', 'hụt thu', 'vốn đối ứng'],
      kpiIdentifiers: ['thu ngân sách nhà nước', 'chi ngân sách địa phương', 'thu nội địa', 'tiền sử dụng đất']
    },
    {
      code: 'TCNS_TAI_SAN_CONG',
      name: 'Quản lý Tài sản công & Giá',
      parentGroup: 'TAI_CHINH_NGAN_SACH',
      keywords: ['tài sản công', 'định giá', 'đấu thầu', 'mua sắm công', 'thẩm định giá'],
      kpiIdentifiers: ['giá trị tài sản công', 'tiết kiệm qua đấu thầu']
    },

    // 2. ĐẦU TƯ CÔNG & XÂY DỰNG
    {
      code: 'DTC_GIAI_NGAN',
      name: 'Giải ngân Kế hoạch Vốn Đầu tư công',
      parentGroup: 'DAU_TU_CONG',
      keywords: ['đầu tư công', 'kế hoạch vốn', 'giải ngân', 'vốn ngân sách trung ương', 'vốn ngân sách tỉnh', 'chủ trương đầu tư'],
      kpiIdentifiers: ['tỷ lệ giải ngân', 'vốn đã giải ngân', 'kế hoạch vốn giao', 'khối lượng hoàn thành']
    },
    {
      code: 'DTC_TIEN_DO_DU_AN',
      name: 'Tiến độ Thi công & Công trình Trọng điểm',
      parentGroup: 'DAU_TU_CONG',
      keywords: ['tiến độ thi công', 'nghiệm thu', 'bàn giao đưa vào sử dụng', 'chậm tiến độ', 'nhà thầu', 'gói thầu'],
      kpiIdentifiers: ['số dự án khởi công', 'số dự án hoàn thành', 'dự án chậm tiến độ']
    },

    // 3. TÀI NGUYÊN - MÔI TRƯỜNG & GPMB
    {
      code: 'TNMT_GPMB',
      name: 'Bồi thường, Giải phóng Mặt bằng & Tái định cư',
      parentGroup: 'TAI_NGUYEN_MOI_TRUONG',
      keywords: ['giải phóng mặt bằng', 'gpmb', 'thu hồi đất', 'bồi thường', 'hỗ trợ tái định cư', 'bàn giao mặt bằng'],
      kpiIdentifiers: ['diện tích thu hồi', 'số hộ dân ảnh hưởng', 'tỷ lệ bàn giao mặt bằng', 'kinh phí bồi thường']
    },
    {
      code: 'TNMT_DAT_DAI',
      name: 'Quản lý Đất đai & Cấp GCNQSDĐ',
      parentGroup: 'TAI_NGUYEN_MOI_TRUONG',
      keywords: ['đất đai', 'sổ đỏ', 'gcnqsdđ', 'chuyển mục đích sử dụng đất', 'đấu giá quyền sử dụng đất', 'vi phạm đất đai'],
      kpiIdentifiers: ['số giấy chứng nhận cấp mới', 'diện tích đất đấu giá', 'vụ vi phạm đất đai']
    },
    {
      code: 'TNMT_MOI_TRUONG',
      name: 'Bảo vệ Môi trường & Xử lý Rác thải',
      parentGroup: 'TAI_NGUYEN_MOI_TRUONG',
      keywords: ['môi trường', 'rác thải', 'nước thải', 'ô nhiễm', 'quan trắc môi trường', 'thu gom rác'],
      kpiIdentifiers: ['tỷ lệ thu gom rác', 'cơ sở gây ô nhiễm']
    },

    // 4. CẢI CÁCH HÀNH CHÍNH & TTHC
    {
      code: 'CCHC_DVC_TRUC_TUYEN',
      name: 'Dịch vụ công Trực tuyến & Một cửa',
      parentGroup: 'CAI_CACH_HANH_CHINH',
      keywords: ['cải cách hành chính', 'cchc', 'bộ phận một cửa', 'dịch vụ công trực tuyến', 'hồ sơ trực tuyến', 'số hóa hồ sơ'],
      kpiIdentifiers: ['tỷ lệ hồ sơ trực tuyến', 'tỷ lệ tiếp nhận một cửa', 'tỷ lệ số hóa hồ sơ']
    },
    {
      code: 'CCHC_TIEN_DO_GIAI_QUYET',
      name: 'Tiến độ Giải quyết Hồ sơ & Mức độ Hài lòng',
      parentGroup: 'CAI_CACH_HANH_CHINH',
      keywords: ['giải quyết đúng hạn', 'hồ sơ trễ hạn', 'quá hạn', 'mức độ hài lòng', 'xin lỗi người dân'],
      kpiIdentifiers: ['tỷ lệ giải quyết đúng hạn', 'số hồ sơ quá hạn', 'chỉ số hài lòng']
    },

    // 5. TƯ PHÁP - HỘ TỊCH
    {
      code: 'TU_PHAP_HO_TICH',
      name: 'Đăng ký Hộ tịch & Chứng thực',
      parentGroup: 'NOI_CHINH_TU_PHAP',
      keywords: ['tư pháp', 'hộ tịch', 'khai sinh', 'khai tử', 'kết hôn', 'chứng thực bản sao', 'chữ ký'],
      kpiIdentifiers: ['đăng ký khai sinh', 'đăng ký kết hôn', 'số việc chứng thực']
    },
    {
      code: 'TU_PHAP_VBQPPL',
      name: 'Xây dựng, Thẩm định & Rà soát VBQPPL',
      parentGroup: 'NOI_CHINH_TU_PHAP',
      keywords: ['văn bản quy phạm pháp luật', 'vbqppl', 'thẩm định văn bản', 'rà soát văn bản', 'tuyên truyền phổ biến pháp luật'],
      kpiIdentifiers: ['số văn bản thẩm định', 'văn bản hết hiệu lực']
    },

    // 6. TIẾP CÔNG DÂN & PHÒNG CHỐNG THAM NHŨNG
    {
      code: 'TCD_KNTC',
      name: 'Tiếp công dân & Giải quyết Khiếu nại, Tố cáo',
      parentGroup: 'NOI_CHINH_TU_PHAP',
      keywords: ['tiếp công dân', 'khiếu nại', 'tố cáo', 'đơn thư', 'đoàn đông người', 'bức xúc kéo dài'],
      kpiIdentifiers: ['lượt tiếp công dân', 'số đơn thư tiếp nhận', 'tỷ lệ giải quyết đơn thư']
    },
    {
      code: 'PCTN_THANH_TRA',
      name: 'Thanh tra, Kiểm tra & Phòng chống Tham nhũng',
      parentGroup: 'NOI_CHINH_TU_PHAP',
      keywords: ['phòng chống tham nhũng', 'pctn', 'thanh tra', 'kiểm tra', 'kê khai tài sản', 'sai phạm kinh tế'],
      kpiIdentifiers: ['cuộc thanh tra đã tiến hành', 'số tiền kiến nghị thu hồi']
    },

    // 7. Y TẾ - CHĂM SÓC SỨC KHỎE
    {
      code: 'Y_TE_KHAM_CHUA_BENH',
      name: 'Khám chữa bệnh & Y tế Dự phòng',
      parentGroup: 'Y_TE_SUC_KHOE',
      keywords: ['y tế', 'khám chữa bệnh', 'bệnh viện', 'trạm y tế', 'dịch bệnh', 'tiêm chủng', 'bảo hiểm y tế'],
      kpiIdentifiers: ['lượt khám chữa bệnh', 'tỷ lệ bao phủ bhyt', 'tỷ lệ tiêm chủng', 'ca mắc sốt xuất huyết']
    },

    // 8. SỰ CỐ & THIÊN TAI
    {
      code: 'PCTT_SU_CO',
      name: 'Phòng chống Thiên tai, Bão lũ & Tìm kiếm Cứu nạn',
      parentGroup: 'QUOC_PHONG_AN_NINH',
      keywords: ['thiên tai', 'bão lũ', 'ngập lụt', 'sạt lở', 'cháy rừng', 'cứu hộ', 'thiệt hại tài sản', 'sơ tán dân'],
      kpiIdentifiers: ['số người chết/bị thương', 'ước tính thiệt hại tài sản', 'số hộ đã sơ tán']
    }
  ];

  /**
   * Phân giải bản chất ngữ nghĩa của số 0 trong văn cảnh hành chính
   */
  static evaluateZeroSemantics(indicator: string, unit: string | null): ZeroSemanticsType {
    const ind = indicator.toLowerCase();

    // 1. Nhóm Số 0 Nguy hiểm / Cảnh báo Đỏ (CRITICAL_ZERO)
    if (
      ind.includes('giải ngân') ||
      ind.includes('thu ngân sách') ||
      ind.includes('bàn giao mặt bằng') ||
      ind.includes('tiến độ') ||
      ind.includes('kết quả thực hiện') ||
      ind.includes('hồ sơ đã xử lý') ||
      (unit === '%' && (ind.includes('đạt') || ind.includes('tỷ lệ')))
    ) {
      return 'CRITICAL_ZERO';
    }

    // 2. Nhóm Số 0 Tích cực / Không phát sinh tiêu cực (POSITIVE_ZERO)
    if (
      ind.includes('khiếu nại') ||
      ind.includes('tố cáo') ||
      ind.includes('quá hạn') ||
      ind.includes('trễ hạn') ||
      ind.includes('tai nạn') ||
      ind.includes('chết người') ||
      ind.includes('thương tích') ||
      ind.includes('vi phạm') ||
      ind.includes('sai phạm') ||
      ind.includes('đơn thư') ||
      ind.includes('cháy nổ') ||
      ind.includes('thiệt hại') ||
      ind.includes('kỷ luật')
    ) {
      return 'POSITIVE_ZERO';
    }

    return 'NEUTRAL_ZERO';
  }

  /**
   * Chuẩn hóa và khớp Domain vào Danh mục Hành chính Tiêu chuẩn
   */
  static resolveDomain(rawDomain: string): AdministrativeDomainDefinition {
    const clean = rawDomain.toLowerCase().trim();
    for (const def of this.TAXONOMY_REGISTRY) {
      if (def.name.toLowerCase().includes(clean) || clean.includes(def.name.toLowerCase())) {
        return def;
      }
      for (const kw of def.keywords) {
        if (clean.includes(kw) || kw.includes(clean)) {
          return def;
        }
      }
    }

    return {
      code: 'HANH_CHINH_TONG_HOP',
      name: rawDomain || 'Hành chính tổng hợp',
      parentGroup: 'TONG_HOP',
      keywords: [],
      kpiIdentifiers: []
    };
  }

  /**
   * Lấy toàn bộ danh mục lĩnh vực
   */
  static getAllTaxonomies(): AdministrativeDomainDefinition[] {
    return this.TAXONOMY_REGISTRY;
  }
}
