import { describe, it, expect } from 'vitest';
import { DocumentExportService } from '../src/services/document-export.service.js';
import { CoreTable, ExecutiveReportIR } from '../src/schemas/report-ir.schema.js';

describe('Ground-Truth Document & Table Export Engine Tests', () => {
  const exportService = new DocumentExportService();

  const mockReportIR: ExecutiveReportIR = {
    metadata: {
      document_title: 'Báo Cáo Tình Hình Phát Triển Kinh Tế - Xã Hội Năm 2026',
      document_type: 'BAO_CAO',
      document_number: '88/BC-UBND',
      issuing_authority: 'ỦY BAN NHÂN DÂN THÀNH PHỐ',
      receiving_authority: 'Hội Đồng Nhân Dân Thành Phố',
      recipients: ['HĐND TP', 'Thường Trực Thành Ủy', 'Lưu: VT'],
      issuance_date: '2026-08-20',
      reporting_period: 'Năm 2026',
      data_timeframe: '01/01/2026 - 20/08/2026',
      primary_domain: 'Kinh tế - Xã hội',
      domain_tags: ['KINH_TE', 'XA_HOI'],
      is_periodic: true,
      has_appendix: true,
      signer: {
        name: 'Nguyễn Văn A',
        title: 'Chủ tịch UBND'
      },
      purpose: 'Báo cáo tổng kết số liệu kinh tế xã hội phục vụ điều hành'
    },
    level1_executive_brief: {
      overall_status: 'GREEN',
      headline: 'Kinh tế xã hội đạt và vượt các chỉ tiêu đề ra.',
      bottom_line_up_front: 'Toàn thành phố đã hoàn thành 15/15 chỉ tiêu kinh tế xã hội trọng tâm; giải ngân vốn đầu tư công đạt 92.4%.',
      decision_needed: null,
      priority_cards: [],
      synthesis_highlights: ['Hoàn thành 100% chỉ tiêu thu ngân sách']
    },
    level2_details: {
      metrics: [
        {
          metric_id: 'm-1',
          indicator: 'Tổng thu ngân sách',
          actual: '12,500',
          unit: 'tỷ đồng',
          data_nature: 'THUC_HIEN_THUC_TE',
          provenance: 'FACT_FROM_DOCUMENT',
          page_ref: 1,
          bbox: [50, 100, 500, 150],
          evidence_refs: ['p1_b1'],
          status: 'GREEN'
        }
      ],
      achievements: [
        {
          achievement_id: 'ach-1',
          achievement_title: 'Thu ngân sách vượt 15% kế hoạch',
          page_ref: 1,
          bbox: [50, 100, 500, 150],
          evidence_refs: ['p1_b1']
        }
      ],
      relationships: [],
      actions_next_period: [
        {
          action_id: 'act-1',
          action_title: 'Tiếp tục đẩy mạnh giải ngân vốn đầu tư công',
          owner_department: 'Sở Kế hoạch & Đầu tư',
          deadline: 'Quý IV/2026',
          expected_output: 'Đạt 100% kế hoạch',
          page_ref: 2,
          bbox: [50, 100, 500, 150],
          evidence_refs: ['p2_b1']
        }
      ],
      recommendations: [],
      tables: [
        {
          table_id: 'tbl-1',
          table_title: 'Bảng Thống Kê Chỉ Số Kinh Tế Chủ Yếu',
          headers: ['STT', 'Chỉ Tiêu', 'Kế Hoạch', 'Thực Hiện', 'Tỷ Lệ'],
          rows: [
            ['1', 'Thu ngân sách', '10,000 tỷ đồng', '12,500 tỷ đồng', '125%'],
            ['2', 'Giải ngân đầu tư công', '5,000 tỷ đồng', '4,620 tỷ đồng', '92.4%']
          ],
          row_count: 2,
          col_count: 5,
          page_ref: 1,
          bbox: [50, 150, 545, 300],
          evidence_refs: ['p1_tbl1']
        }
      ]
    },
    audit: {
      total_metrics_found: 1,
      total_relationships_found: 0,
      total_tables_found: 1,
      total_pages_scanned: 2,
      has_critical_bottlenecks: false,
      uncertainty_rate: 0
    }
  };

  it('nên xuất thành công file Word (.docx) chứa nguyên bản dữ liệu và bảng biểu', async () => {
    const buffer = await exportService.exportToDocx(mockReportIR);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(3000);
    expect(buffer[0]).toBe(0x50); // PK
    expect(buffer[1]).toBe(0x4B);
  });

  it('nên xuất thành công file PDF (.pdf) chứa nguyên bản dữ liệu và bảng biểu', async () => {
    const buffer = await exportService.exportToPdf(mockReportIR);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('nên xuất thành công toàn bộ bảng biểu ra định dạng CSV chuẩn UTF-8 (BOM)', () => {
    const tables: CoreTable[] = mockReportIR.level2_details.tables;
    const csv = exportService.exportTablesToCsv(tables);
    expect(csv).toBeDefined();
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Thu ngân sách');
    expect(csv).toContain('12,500 tỷ đồng');
    expect(csv).toContain('125%');
  });
});
