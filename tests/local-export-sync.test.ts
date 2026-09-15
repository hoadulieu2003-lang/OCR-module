import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DocumentExportService } from '../src/services/document-export.service.js';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { ExecutiveReportIR } from '../src/schemas/report-ir.schema.js';

describe('Local Port Export & Client-Backend Synchronization Test Suite', () => {
  const exportService = new DocumentExportService();
  const pdfParser = new PdfParserService();

  const mockPayload: ExecutiveReportIR = {
    metadata: {
      document_title: 'Báo cáo Công tác Tư pháp Năm 2024',
      document_type: 'BAO_CAO',
      document_number: '12/BC-STP',
      issuing_authority: 'SỞ TƯ PHÁP',
      receiving_authority: 'UBND TỈNH',
      recipients: ['UBND Tỉnh', 'Bộ Tư Pháp', 'Lưu: VT'],
      issuance_date: '2024-12-15',
      reporting_period: 'Năm 2024',
      data_timeframe: 'Năm 2024',
      primary_domain: 'Tư pháp & Hộ tịch',
      domain_tags: ['TU_PHAP'],
      is_periodic: true,
      has_appendix: false,
      signer: {
        name: 'Trần Văn B',
        title: 'Giám đốc Sở'
      },
      purpose: 'Báo cáo kết quả công tác tư pháp và cải cách thủ tục hành chính'
    },
    level1_executive_brief: {
      overall_status: 'GREEN',
      headline: 'Hoàn thành 100% nhiệm vụ công tác tư pháp năm 2024.',
      bottom_line_up_front: 'Toàn ngành đã hoàn thành tốt các chỉ tiêu theo kế hoạch đề ra; tỷ lệ giải quyết hồ sơ đúng hạn đạt 99.8%.',
      decision_needed: null,
      priority_cards: [],
      synthesis_highlights: []
    },
    level2_details: {
      metrics: [
        {
          metric_id: 'm-1',
          indicator: 'Tỷ lệ giải quyết hồ sơ đúng hạn',
          actual: '99.8%',
          unit: '%',
          data_nature: 'THUC_HIEN_THUC_TE',
          provenance: 'FACT_FROM_DOCUMENT',
          page_ref: 1,
          bbox: [50, 100, 500, 150],
          evidence_refs: ['p1_b1'],
          status: 'GREEN'
        }
      ],
      achievements: [],
      relationships: [],
      actions_next_period: [],
      recommendations: [],
      tables: [
        {
          table_id: 'tbl-1',
          table_title: 'Bảng Kết Quả Tiếp Nhận & Giải Quyết Hồ Sơ',
          headers: ['Lĩnh Vực', 'Tổng Tiếp Nhận', 'Đã Giải Quyết', 'Tỷ Lệ Đúng Hạn'],
          rows: [
            ['Hộ tịch', '5,420', '5,415', '99.9%'],
            ['Chứng thực', '12,300', '12,280', '99.8%']
          ],
          row_count: 2,
          col_count: 4,
          page_ref: 1,
          bbox: [50, 200, 545, 350],
          evidence_refs: ['p1_tbl1']
        }
      ]
    },
    audit: {
      total_metrics_found: 1,
      total_relationships_found: 0,
      total_tables_found: 1,
      total_pages_scanned: 1,
      has_critical_bottlenecks: false,
      uncertainty_rate: 0
    }
  };

  it('should export DOCX and allow parsing back text and tables', async () => {
    const docxBuffer = await exportService.exportToDocx(mockPayload);
    expect(docxBuffer).toBeDefined();
    expect(docxBuffer.length).toBeGreaterThan(1000);

    const tempDocxPath = path.resolve(process.cwd(), 'temp_test_ground_truth.docx');
    fs.writeFileSync(tempDocxPath, docxBuffer);

    // Parse text from DOCX
    const parsedDoc = await pdfParser.parse(tempDocxPath);
    const docxText = parsedDoc.pages.map(p => p.text).join('\n');

    // Clean up
    try {
      if (fs.existsSync(tempDocxPath)) fs.unlinkSync(tempDocxPath);
    } catch (e) {}

    expect(docxText).toMatch(/BÁO CÁO CÔNG TÁC TƯ PHÁP/i);
    expect(docxText).toMatch(/SỞ TƯ PHÁP/i);
    expect(docxText).toMatch(/Tỷ lệ giải quyết hồ sơ đúng hạn/i);
  });

  it('should export PDF without error and with valid byte stream', async () => {
    const pdfBuffer = await exportService.exportToPdf(mockPayload);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
