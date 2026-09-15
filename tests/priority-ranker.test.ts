import { describe, it, expect } from 'vitest';
import { PriorityRankerService } from '../src/services/priority-ranker.service.js';
import { ExecutiveReportIR } from '../src/schemas/report-ir.schema.js';

describe('Task 4: Priority Ranker & Zero Grouping Engine', () => {
  it('should rank Decision Needed first and suppress duplicate zero rows into a concise summary', () => {
    const ranker = new PriorityRankerService();

    const mockIR: ExecutiveReportIR = {
      metadata: {
        document_title: 'Báo cáo công tác tư pháp tháng 4/2024',
        document_type: 'BAO_CAO',
        document_number: '12/BC-STP',
        issuing_authority: 'Sở Tư pháp',
        receiving_authority: 'UBND Tỉnh',
        issuance_date: '2024-04-20',
        reporting_period: 'Tháng 4/2024',
        data_timeframe: 'Tháng 4',
        primary_domain: 'Tư pháp - Hộ tịch',
        domain_tags: ['TU_PHAP', 'TCD_PCTN'],
        is_periodic: true,
        has_appendix: false,
        signer: { name: 'Trần Văn Hùng', title: 'Giám đốc' },
        purpose: 'Báo cáo công tác tư pháp và tiếp nhận hồ sơ.'
      },
      level1_executive_brief: {
        overall_status: 'BINH_THUONG',
        headline: 'Công tác tư pháp tháng 4/2024 hoàn thành 100% chỉ tiêu.',
        decision_needed: {
          is_required: true,
          decision_summary: 'Nội dung cần lãnh đạo xem xét: Bố trí kinh phí nâng cấp phần mềm đăng ký hộ tịch trực tuyến.',
          action_verb: 'BO_TRI_VON_KINH_PHI',
          deadline: '2024-05-15',
          page_ref: 3
        },
        priority_cards: [],
        zero_cases_summary: undefined
      },
      level2_details: {
        metrics: [
          {
            indicator: 'Số vụ khiếu nại phát sinh',
            unit: 'vụ',
            plan_target: null,
            actual: '0',
            percentage: null,
            previous_period: null,
            change_description: null,
            data_nature: 'THUC_HIEN_THUC_TE',
            provenance: 'FACT_FROM_DOCUMENT',
            status: 'GREEN',
            trend: 'ON_DINH',
            page_ref: 2,
            quote: 'Trong tháng không phát sinh đơn thư khiếu nại.',
            uncertainty_flag: false
          },
          {
            indicator: 'Số vụ tố cáo phát sinh',
            unit: 'vụ',
            plan_target: null,
            actual: '0 vụ',
            percentage: null,
            previous_period: null,
            change_description: null,
            data_nature: 'THUC_HIEN_THUC_TE',
            provenance: 'FACT_FROM_DOCUMENT',
            status: 'GREEN',
            trend: 'ON_DINH',
            page_ref: 2,
            quote: 'Không có đơn tố cáo.',
            uncertainty_flag: false
          },
          {
            indicator: 'Tỷ lệ giải quyết hồ sơ đúng hạn',
            unit: '%',
            plan_target: '100%',
            actual: '99.8%',
            percentage: '99.8%',
            previous_period: '99.5%',
            change_description: '+0.3%',
            data_nature: 'THUC_HIEN_THUC_TE',
            provenance: 'FACT_FROM_DOCUMENT',
            status: 'GREEN',
            trend: 'TANG_TRUONG',
            page_ref: 1,
            quote: 'Giải quyết đúng hạn 99.8% hồ sơ.',
            uncertainty_flag: false
          }
        ],
        achievements: [],
        relationships: [],
        actions_next_period: [],
        recommendations: [
          {
            requester: 'Sở Tư pháp',
            request_content: 'Đề nghị UBND tỉnh bổ sung kinh phí phần mềm hộ tịch.',
            requested_authority: 'UBND Tỉnh',
            reason: 'Phần mềm cũ thường xuyên nghẽn mạng',
            resource_amount: '500 triệu đồng',
            related_project: 'Chuyển đổi số tư pháp',
            page_ref: 3
          }
        ],
        tables: []
      }
    };

    const ranked = ranker.rankAndSynthesize(mockIR);

    // 1. Decision Needed must be card #1
    expect(ranked.level1_executive_brief.priority_cards[0].priority_rank).toBe(1);
    expect(ranked.level1_executive_brief.priority_cards[0].title).toBe('Nội Dung Cần Lãnh Đạo Quyết Định');

    // 2. Zero cases must be grouped, not individual cards
    expect(ranked.level1_executive_brief.zero_cases_summary?.has_zero_occurrences).toBe(true);
    expect(ranked.level1_executive_brief.zero_cases_summary?.grouped_statement).toContain('Trong kỳ không phát sinh các sự việc thuộc lĩnh vực');
    expect(ranked.level1_executive_brief.priority_cards.some(c => c.title === 'Số vụ khiếu nại phát sinh')).toBe(false);

    // 3. Routine decision requests should have overall_status CAN_LUU_Y (not emergency CANH_BAO_KHAN)
    expect(ranked.level1_executive_brief.overall_status).toBe('CAN_LUU_Y');
  });

  it('should correctly support Vietnamese severity values CAO and NGHIEM_TRONG with RED badge', () => {
    const ranker = new PriorityRankerService();

    const mockIR: ExecutiveReportIR = {
      metadata: {
        document_title: 'Báo cáo kiểm tra hiện trường',
        document_type: 'BAO_CAO',
        document_number: '05/BC-KT',
        issuing_authority: 'Ban QLDA',
        receiving_authority: 'UBND Huyện',
        issuance_date: '2026-08-20',
        reporting_period: 'Tháng 8/2026',
        data_timeframe: 'Tháng 8',
        primary_domain: 'Đầu tư công & Xây dựng',
        domain_tags: ['DAU_TU_CONG'],
        is_periodic: false,
        has_appendix: false,
        signer: { name: 'Lê Văn A', title: 'Trưởng ban' },
        purpose: 'Báo cáo điểm nghẽn thi công.'
      },
      level1_executive_brief: {
        overall_status: 'BINH_THUONG',
        headline: 'Tiến độ dự án gặp vướng mắc nghiêm trọng.',
        decision_needed: {
          is_required: false,
          decision_summary: null,
          action_verb: 'BAO_CAO_DE_BIET',
          deadline: null,
          page_ref: null
        },
        priority_cards: []
      },
      level2_details: {
        metrics: [],
        achievements: [],
        relationships: [
          {
            id: 'rel-1',
            domain: 'Giải phóng mặt bằng',
            issue: '3 hộ dân chưa bàn giao mặt bằng thi công mố cầu',
            cause: 'Chưa thống nhất đơn giá bồi thường đất',
            impact: 'Chậm tiến độ 3 tháng',
            responsible_party: 'Trung tâm phát triển quỹ đất',
            deadline: '30/08/2026',
            proposed_action: 'Tổ chức đối thoại cưỡng chế',
            severity: 'NGHIEM_TRONG',
            page_ref: 2
          },
          {
            id: 'rel-2',
            domain: 'Nguồn vốn đối ứng',
            issue: 'Thiếu vốn đối ứng giải ngân đợt 2',
            cause: 'Hụt thu ngân sách địa phương',
            impact: 'Nhà thầu tạm dừng thi công',
            responsible_party: 'Phòng Tài chính',
            deadline: '15/09/2026',
            proposed_action: 'Xin tạm ứng ngân sách tỉnh',
            severity: 'CAO',
            page_ref: 3
          }
        ],
        actions_next_period: [],
        recommendations: [],
        tables: []
      }
    };

    const ranked = ranker.rankAndSynthesize(mockIR);
    const cards = ranked.level1_executive_brief.priority_cards;

    // Must rank NGHIEM_TRONG as rank 3 CRITICAL RED
    const cardNghiemTrong = cards.find(c => c.title.includes('Giải phóng mặt bằng'));
    expect(cardNghiemTrong).toBeDefined();
    expect(cardNghiemTrong?.priority_rank).toBe(3);
    expect(cardNghiemTrong?.priority_level).toBe('CRITICAL');
    expect(cardNghiemTrong?.badge_color).toBe('RED');

    // Must rank CAO as rank 4 HIGH RED
    const cardCao = cards.find(c => c.title.includes('Nguồn vốn đối ứng'));
    expect(cardCao).toBeDefined();
    expect(cardCao?.priority_rank).toBe(4);
    expect(cardCao?.priority_level).toBe('HIGH');
    expect(cardCao?.badge_color).toBe('RED');
  });
});
