import { describe, it, expect } from 'vitest';
import { ExecutiveReportIRSchema, ExecutiveReportIR } from '../src/schemas/report-ir.schema.js';

describe('Task 1: Intermediate Representation (IR) Schema Validation', () => {
  it('should successfully validate a complete ExecutiveReportIR object', () => {
    const mockReportIR: ExecutiveReportIR = {
      metadata: {
        document_title: 'Báo cáo tình hình thực hiện kế hoạch đầu tư công',
        document_type: 'BAO_CAO',
        document_number: '43/BC-UBND',
        issuing_authority: 'UBND Xã Sơn Mai',
        receiving_authority: 'UBND Huyện',
        issuance_date: '2025-12-01',
        reporting_period: 'Giai đoạn 2021-2025',
        data_timeframe: '2021 - 2025',
        primary_domain: 'Đầu tư công',
        domain_tags: ['DAU_TU_CONG', 'GPMB', 'KIEN_NGHI'],
        is_periodic: true,
        has_appendix: true,
        signer: { name: 'Nguyễn Anh Tuấn', title: 'Chủ tịch' },
        purpose: 'UBND Xã Sơn Mai báo cáo tình hình đầu tư công giai đoạn 2021-2025 và đề xuất nhu cầu vốn 2026-2030.'
      },
      level1_executive_brief: {
        overall_status: 'CAN_LUU_Y',
        headline: 'Giải ngân 100% kế hoạch vốn 62.254 triệu đồng; Đang vướng nguồn vốn đối ứng do sáp nhập xã.',
        decision_needed: {
          is_required: true,
          decision_summary: 'Nội dung cần lãnh đạo xem xét: Hỗ trợ vốn đối ứng trả nợ NTM sau sáp nhập và phân bổ vốn kỳ tới 19.325 triệu đồng.',
          action_verb: 'BO_TRI_VON_KINH_PHI',
          deadline: '2026-06-30',
          page_ref: 3
        },
        priority_cards: [
          {
            card_id: 'card-1',
            priority_rank: 1,
            priority_level: 'CRITICAL',
            badge_color: 'RED',
            title: 'Nội Dung Cần Lãnh Đạo Quyết Định',
            highlight_fact: 'Thiếu hụt nguồn vốn đối ứng trả nợ NTM do sáp nhập xã; Đề nghị cấp trên hỗ trợ vốn.',
            supporting_context: 'Sau sáp nhập xã, nguồn thu tiền sử dụng đất bị thu hẹp.',
            source_page_ref: 2
          },
          {
            card_id: 'card-2',
            priority_rank: 9,
            priority_level: 'INFO',
            badge_color: 'GREEN',
            title: 'Tiến Độ Giải Ngân Vốn',
            highlight_fact: 'Ước thực hiện và giải ngân đạt 100% kế hoạch vốn được giao (62.254 triệu đồng).',
            supporting_context: 'Hoàn thành toàn bộ mục tiêu hạ tầng nông thôn mới.',
            source_page_ref: 2
          }
        ],
        zero_cases_summary: {
          has_zero_occurrences: true,
          grouped_statement: 'Trong kỳ không phát sinh khiếu nại, tố cáo và vi phạm trong công tác quản lý xây dựng.',
          domains_covered: ['Khiếu nại', 'Tố cáo', 'Sai phạm xây dựng']
        }
      },
      level2_details: {
        metrics: [
          {
            indicator: 'Kế hoạch vốn CT MTQG Nông thôn mới',
            unit: 'triệu đồng',
            plan_target: '62.254,255',
            actual: '62.254,255',
            percentage: '100%',
            previous_period: null,
            change_description: null,
            data_nature: 'UOC_THUC_HIEN',
            provenance: 'FACT_FROM_DOCUMENT',
            status: 'GREEN',
            trend: 'ON_DINH',
            page_ref: 2,
            quote: 'Ước thực hiện và giải ngân 100% vốn được giao.',
            uncertainty_flag: false
          }
        ],
        achievements: [
          {
            achievement_title: 'Giải ngân 100% kế hoạch vốn Nông thôn mới',
            metrics_evidence: '62.254 triệu đồng',
            milestone_impact: 'Hoàn thành hạ tầng nông thôn mới',
            page_ref: 2
          }
        ],
        relationships: [
          {
            domain: 'Nguồn vốn đối ứng Ngân sách',
            issue: 'Nguồn thu tiền sử dụng đất trên địa bàn xã hạn chế, không đảm bảo vốn đối ứng.',
            cause: 'Do sáp nhập và áp dụng mô hình chính quyền địa phương 2 cấp.',
            impact: 'Chưa đủ nguồn trả nợ các công trình NTM đã thi công.',
            responsible_party: 'UBND Xã Sơn Mai',
            deadline: '2026-06-30',
            proposed_action: 'Kiến nghị Huyện và Tỉnh bố trí ngân sách hỗ trợ phần vốn đối ứng.',
            severity: 'HIGH',
            page_ref: 2
          }
        ],
        actions_next_period: [
          {
            action_title: 'Xây dựng kế hoạch đầu tư công trung hạn 2026-2030 nguồn NSNN',
            owner_department: 'Ban Địa chính - Xây dựng xã',
            coordinating_departments: ['Ban Tài chính - Kế toán'],
            deadline: '2026-04-30',
            expected_output: 'Kế hoạch chi tiết 19.325 triệu đồng',
            priority: 'HIGH',
            page_ref: 3
          }
        ],
        recommendations: [
          {
            requester: 'UBND Xã Sơn Mai',
            request_content: 'Đề nghị cấp trên phân bổ vốn ĐTC giai đoạn 2026-2030 là 19.325 triệu đồng.',
            requested_authority: 'UBND Huyện / Tỉnh',
            reason: 'Để đảm bảo nhu cầu phát triển hạ tầng kinh tế - xã hội theo Chỉ thị 25/CT-TTg.',
            resource_amount: '19.325 triệu đồng',
            related_project: 'Kế hoạch ĐTC trung hạn 2026-2030',
            page_ref: 3
          }
        ],
        tables: []
      },
      extensions: {
        public_investment: {
          capital_plan_total: '62.254,255 triệu đồng',
          allocated_capital: '62.254,255 triệu đồng',
          disbursed_capital: '62.254,255 triệu đồng',
          disbursement_rate: '100%',
          central_gov_capital: '3.787,380 triệu đồng',
          provincial_capital: '49.858,353 triệu đồng',
          district_capital: '8.608,522 triệu đồng',
          next_phase_demand: '19.325 triệu đồng'
        }
      }
    };

    const parsed = ExecutiveReportIRSchema.parse(mockReportIR);
    expect(parsed.metadata.document_number).toBe('43/BC-UBND');
    expect(parsed.level1_executive_brief.decision_needed.is_required).toBe(true);
    expect(parsed.level2_details.relationships[0].severity).toBe('HIGH');
    expect(parsed.extensions?.public_investment?.disbursement_rate).toBe('100%');
  });
});
