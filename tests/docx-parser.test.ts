import { describe, it, expect } from 'vitest';
import path from 'path';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';
import { PriorityRankerService } from '../src/services/priority-ranker.service.js';

describe('Word Document (.docx) Support & 5-Layer AI Pipeline', () => {
  const parser = new PdfParserService();
  const extractor = new StructuredExtractorService();
  const ranker = new PriorityRankerService();
  const sampleDocxPath = path.resolve(__dirname, '../uploads/sample_report_cchc.docx');

  it('should parse and extract text & structure from a Word .docx file', async () => {
    const doc = await parser.parse(sampleDocxPath);

    expect(doc).toBeDefined();
    expect(doc.fileName).toBe('sample_report_cchc.docx');
    expect(doc.totalPages).toBeGreaterThanOrEqual(1);
    expect(doc.totalChars).toBeGreaterThan(100);
    expect(doc.pages[0].text).toContain('ỦY BAN NHÂN DÂN XÃ ĐỊNH CƯƠNG');
    expect(doc.pages[0].text).toContain('Tiếp nhận và giải quyết hồ sơ TTHC');
  });

  it('should run 5-layer pipeline and extract metrics, status and priority cards from .docx', async () => {
    const doc = await parser.parse(sampleDocxPath);
    const rawIR = await extractor.extract(doc);
    const rankedIR = ranker.rankAndSynthesize(rawIR);

    expect(rankedIR.metadata.issuing_authority).toMatch(/Ủy ban nhân dân/i);
    expect(rankedIR.level1_executive_brief.priority_cards.length).toBeGreaterThanOrEqual(3);
    expect(rankedIR.level2_details.metrics.length).toBeGreaterThanOrEqual(3);

    // Check specific extracted numbers from Word
    const metricTexts = rankedIR.level2_details.metrics
      .flatMap(m => [m.indicator || '', m.actual || '', m.quote || ''])
      .filter(t => t.length > 0);

    expect(metricTexts.some(t => t.includes('1.450') || t.includes('99.2%'))).toBe(true);
    expect(metricTexts.some(t => t.includes('5.600') || t.includes('185'))).toBe(true);
  });

  it('should generate valid DocumentEvidenceIR and accurate table page references for .docx', async () => {
    const doc = await parser.parse(sampleDocxPath);

    // 1. Kiểm tra tính toàn vẹn của DocumentEvidenceIR
    expect(doc.evidenceIR).toBeDefined();
    expect(doc.evidenceIR?.document_id).toContain('doc-sample_report_cchc.docx');
    expect(doc.evidenceIR?.pages.length).toBe(doc.totalPages);
    expect(doc.evidenceIR?.pages[0].blocks.length).toBeGreaterThan(0);

    // 2. Kiểm tra việc định vị vị trí bảng (page_ref) không bị gán cứng
    if (doc.tables && doc.tables.length > 0) {
      for (const table of doc.tables) {
        expect(table.page_ref).toBeGreaterThanOrEqual(1);
        expect(table.page_ref).toBeLessThanOrEqual(doc.totalPages);
        expect(table.bbox).toBeDefined();
        expect(table.bbox?.length).toBe(4);
      }
    }
  });

  it('should parse legacy Word binary (.doc) file and extract ground-truth content', async () => {
    const sampleDocPath = path.resolve(__dirname, '../dataset-50-real-reports/22_Hoptac_TTr_Chu_truong_tham_gia_thau_du_an_Tiem_chu.doc');
    const doc = await parser.parse(sampleDocPath);

    expect(doc).toBeDefined();
    expect(doc.fileName).toBe('22_Hoptac_TTr_Chu_truong_tham_gia_thau_du_an_Tiem_chu.doc');
    expect(doc.totalPages).toBeGreaterThanOrEqual(1);
    expect(doc.totalChars).toBeGreaterThan(100);
    expect(doc.pages[0].text.length).toBeGreaterThan(50);
  });
});
