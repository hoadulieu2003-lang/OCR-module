import { describe, it, expect } from 'vitest';
import { DocumentExportService } from '../src/services/document-export.service.js';
import { ExecutiveReportIR } from '../src/schemas/report-ir.schema.js';

describe('DocumentExportService: Word (.docx) & PDF (.pdf) Export', () => {
  const exportService = new DocumentExportService();

  const mockReportIR: ExecutiveReportIR = {
    metadata: {
      document_title: 'Báo cáo tình hình phát triển kinh tế - xã hội Quý I năm 2026',
      document_type: 'BAO_CAO',
      document_number: '128/BC-UBND',
      issuing_authority: 'ỦY BAN NHÂN DÂN HUYỆN ĐĂK HÀ',
      receiving_authority: 'Ủy ban nhân dân tỉnh Kon Tum',
      recipients: ['UBND tỉnh Kon Tum', 'Sở Kế hoạch và Đầu tư', 'Thường trực Huyện ủy', 'Lưu: VT'],
      issuance_date: '2026-03-25',
      reporting_period: 'Quý I/2026',
      data_timeframe: '01/01/2026 đến 25/03/2026',
      primary_domain: 'Kinh tế - Xã hội & Đầu tư công',
      domain_tags: ['KINH_TE_XA_HOI', 'DAU_TU_CONG', 'NGAN_SACH'],
      is_periodic: true,
      has_appendix: true,
      signer: {
        name: 'Hà Tiến',
        title: 'Chủ tịch UBND huyện'
      },
      purpose: 'Đánh giá tiến độ giải ngân vốn đầu tư công và thu ngân sách nhà nước trên địa bàn'
    },
    level1_executive_brief: {
      overall_status: 'CAN_LUU_Y',
      headline: 'Thu ngân sách đạt 28.5% kế hoạch, tuy nhiên giải ngân vốn đầu tư công còn chậm do vướng mặt bằng 3 dự án trọng điểm.',
      decision_needed: {
        is_required: true,
        decision_summary: 'UBND huyện kiến nghị UBND tỉnh xem xét điều chuyển 15 tỷ đồng vốn đầu tư công từ dự án chậm tiến độ sang dự án giao thông nông thôn.',
        action_verb: 'BO_TRI_VON_KINH_PHI',
        deadline: '15/04/2026',
        page_ref: 4,
        bbox: [60, 120, 520, 180]
      },
      priority_cards: [
        {
          card_id: 'CARD-1',
          priority_rank: 1,
          priority_level: 'CRITICAL',
          badge_color: 'RED',
          title: 'Vướng mắc giải phóng mặt bằng dự án đường vành đai',
          highlight_fact: 'Còn 12 hộ dân chưa nhận tiền bồi thường với tổng diện tích 2.4 ha',
          supporting_context: 'Cần chỉ đạo hội đồng bồi thường huyện đối thoại trực tiếp với người dân',
          source_page_ref: 3
        },
        {
          card_id: 'CARD-2',
          priority_rank: 2,
          priority_level: 'HIGH',
          badge_color: 'AMBER',
          title: 'Thu ngân sách trên địa bàn huyện',
          highlight_fact: 'Tổng thu đạt 45.8 tỷ đồng, đạt 28.5% dự toán tỉnh giao',
          supporting_context: 'Thu tiền sử dụng đất đạt thấp chỉ 12%',
          source_page_ref: 2
        }
      ],
      zero_cases_summary: {
        has_zero_occurrences: true,
        grouped_statement: 'Trong kỳ không phát sinh khiếu nại đông người và không có tai nạn lao động nghiêm trọng.'
      }
    },
    level2_details: {
      metrics: [
        {
          metric_id: 'M-1',
          indicator: 'Tổng thu ngân sách nhà nước',
          plan_target: '160.5 tỷ đồng',
          actual: '45.8 tỷ đồng',
          percentage: '28.5%',
          data_nature: 'THUC_HIEN_THUC_TE',
          page_ref: 2,
          quote: 'Tổng thu ngân sách nhà nước đạt 45.8 tỷ đồng'
        },
        {
          metric_id: 'M-2',
          indicator: 'Giải ngân vốn đầu tư công',
          plan_target: '320.0 tỷ đồng',
          actual: '62.4 tỷ đồng',
          percentage: '19.5%',
          data_nature: 'UOC_THUC_HIEN',
          page_ref: 3,
          quote: 'Ước giải ngân vốn đầu tư công quý I đạt 62.4 tỷ đồng'
        }
      ],
      relationships: [
        {
          relationship_id: 'R-1',
          domain: 'GPMB & Đầu tư công',
          issue: 'Chậm tiến độ bàn giao mặt bằng',
          cause: 'Đơn giá bồi thường đất nông nghiệp chưa thống nhất',
          impact: 'Dự án chậm tiến độ 45 ngày so với hợp đồng',
          severity: 'HIGH',
          page_ref: 3
        }
      ],
      actions_next_period: [
        {
          action_id: 'ACT-1',
          title: 'Tổ chức đối thoại bồi thường GPMB',
          owner: 'Hội đồng bồi thường huyện',
          deadline: '10/04/2026',
          page_ref: 4
        }
      ],
      tables: []
    }
  };

  it('Gate 1: exportToDocx should produce a valid Word (.docx) buffer conforming to ND 30 standards', async () => {
    const docxBuffer = await exportService.exportToDocx(mockReportIR);
    expect(docxBuffer).toBeDefined();
    expect(Buffer.isBuffer(docxBuffer)).toBe(true);
    expect(docxBuffer.length).toBeGreaterThan(5000); // Valid .docx archive

    // Magic bytes for ZIP/DOCX (PK..)
    expect(docxBuffer[0]).toBe(0x50); // 'P'
    expect(docxBuffer[1]).toBe(0x4B); // 'K'
  });

  it('Gate 2: exportToPdf should produce a valid PDF (.pdf) binary buffer with Executive Dashboard styling', async () => {
    const pdfBuffer = await exportService.exportToPdf(mockReportIR);
    expect(pdfBuffer).toBeDefined();
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Magic bytes for PDF (%PDF-)
    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('Gate 3: exportToDocx should handle minimal reports with default fallback metadata', async () => {
    const minimalReport: ExecutiveReportIR = {
      metadata: {
        document_title: 'Báo cáo công tác tuần',
        document_type: 'BAO_CAO',
        document_number: null,
        issuing_authority: 'VĂN PHÒNG UBND XÃ',
        receiving_authority: null,
        recipients: [],
        issuance_date: null,
        reporting_period: 'Tuần 12',
        data_timeframe: null,
        primary_domain: 'Hành chính',
        domain_tags: ['HANH_CHINH'],
        is_periodic: true,
        has_appendix: false,
        signer: { name: null, title: null },
        purpose: 'Báo cáo tiến độ'
      },
      level1_executive_brief: {
        overall_status: 'BINH_THUONG',
        headline: 'Công tác tuần diễn ra đúng kế hoạch.',
        decision_needed: {
          is_required: false,
          decision_summary: null,
          action_verb: 'BAO_CAO_DE_BIET',
          deadline: null,
          page_ref: null,
          bbox: null
        },
        priority_cards: [],
        zero_cases_summary: null
      },
      level2_details: {
        metrics: [],
        relationships: [],
        actions_next_period: [],
        tables: []
      }
    };

    const docxBuffer = await exportService.exportToDocx(minimalReport);
    expect(docxBuffer.length).toBeGreaterThan(3000);

    const pdfBuffer = await exportService.exportToPdf(minimalReport);
    expect(pdfBuffer.length).toBeGreaterThan(800);
  });

  it('Gate 4: exportToDocx must produce valid administrative document XML with header and tables', async () => {
    const docxBuffer = await exportService.exportToDocx(mockReportIR);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(docxBuffer);
    const documentXml = await zip.file('word/document.xml')?.async('text');

    expect(documentXml).toBeDefined();
    expect(documentXml).toContain('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
    expect(documentXml).toContain('Độc lập - Tự do - Hạnh phúc');
    expect(documentXml).toContain('BÁO CÁO');
  });

  it('Gate 5: exportTablesToCsv must sanitize CSV Formula Injection prefixes (=, +, -, @)', () => {
    const maliciousTable = [
      {
        table_id: 'TBL-MALICIOUS',
        page_ref: 1,
        table_title: 'Bảng kiểm tra Formula Injection',
        headers: ['STT', '=CMD|/C calc!A0', '+1+2', '-SUM(A1:A10)', '@HYPERLINK("http://attacker.com")'],
        rows: [
          ['1', '=2+5', '-100', '+500', '@malicious_call()'],
          ['2', 'Bình thường', '10.5', '20.0', 'Ghi chú an toàn']
        ]
      }
    ];

    const csvOutput = exportService.exportTablesToCsv(maliciousTable);

    // Ký tự nguy hiểm phải được prefix bằng '
    expect(csvOutput).toContain("\"'=CMD|/C calc!A0\"");
    expect(csvOutput).toContain("\"'+1+2\"");
    expect(csvOutput).toContain("\"'-SUM(A1:A10)\"");
    expect(csvOutput).toContain("\"'@HYPERLINK(\"\"http://attacker.com\"\")\"");
    expect(csvOutput).toContain("\"'=2+5\"");
    expect(csvOutput).toContain("\"'-100\"");
    expect(csvOutput).toContain("\"'+500\"");
    expect(csvOutput).toContain("\"'@malicious_call()\"");
    // Ký tự an toàn không bị biến đổi
    expect(csvOutput).toContain('"Bình thường"');
  });
});
