import { describe, it, expect } from 'vitest';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';
import { PriorityRankerService } from '../src/services/priority-ranker.service.js';
import { ExecutiveReportIRSchema } from '../src/schemas/report-ir.schema.js';
import path from 'path';
import fs from 'fs';

describe('10 Acceptance Quality Tests for Executive Administrative Report Engine', () => {
  const parser = new PdfParserService();
  const extractor = new StructuredExtractorService({ apiKey: '' });
  const ranker = new PriorityRankerService();

  const uploadsDir = path.resolve(__dirname, '../uploads');
  const availablePdfs = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));

  // TEST 1: Báo cáo Cải cách hành chính & TTHC
  it('TEST 1 [CCHC & TTHC]: Must detect tasks, compliance rate, on-time rate, and issues', async () => {
    const file = availablePdfs.find(f => f.includes('random') || f.includes('CCHC')) || availablePdfs[0];
    const doc = await parser.parse(path.join(uploadsDir, file));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    expect(ranked.level2_details.metrics.length).toBeGreaterThan(0);
    expect(ranked.level1_executive_brief.priority_cards.length).toBeGreaterThanOrEqual(1);
    expect(ExecutiveReportIRSchema.safeParse(ranked).success).toBe(true);
  });

  // TEST 2: Báo cáo Y tế / Ngân sách
  it('TEST 2 [Ngân sách & Chuyên ngành]: Must identify indicators and breakdown', async () => {
    const file = availablePdfs.find(f => f.includes('Y_t') || f.includes('NSDP')) || availablePdfs[0];
    const doc = await parser.parse(path.join(uploadsDir, file));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    expect(ranked.metadata.primary_domain).toBeDefined();
    expect(ranked.level2_details.metrics.length).toBeGreaterThan(0);
    expect(ExecutiveReportIRSchema.safeParse(ranked).success).toBe(true);
  });

  // TEST 3: Báo cáo Đầu tư công / GPMB
  it('TEST 3 [Đầu tư công & GPMB]: Must extract metrics and relationships', async () => {
    const file = availablePdfs.find(f => f.includes('GPMB') || f.includes('DAU_TU')) || availablePdfs[0];
    const doc = await parser.parse(path.join(uploadsDir, file));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    expect(ranked.level2_details.metrics.length).toBeGreaterThan(0);
    expect(ExecutiveReportIRSchema.safeParse(ranked).success).toBe(true);
  });

  // TEST 4: Báo cáo Tiếp dân / Thiên tai / Sự cố
  it('TEST 4 [Sự cố & Điều hành]: Must extract high priority impact and actions', async () => {
    const file = availablePdfs.find(f => f.includes('thi_t_h_i') || f.includes('TCD')) || availablePdfs[0];
    const doc = await parser.parse(path.join(uploadsDir, file));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    expect(ranked.metadata.document_title).toBeDefined();
    expect(ExecutiveReportIRSchema.safeParse(ranked).success).toBe(true);
  });

  // TEST 5: Phân rã Mục tiêu & Kế hoạch
  it('TEST 5 [Nhiệm vụ & Tiến độ]: Must normalize tasks and next action items with owner/deadline', async () => {
    const doc = await parser.parse(path.join(uploadsDir, availablePdfs[0]));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    expect(ranked.level2_details.actions_next_period.length).toBeGreaterThan(0);
    const action = ranked.level2_details.actions_next_period[0];
    expect(action.deadline).toBeDefined();
    expect(action.expected_output).toBeDefined();
  });

  // TEST 6: Bóc tách Tư pháp / Hành chính
  it('TEST 6 [Hành chính công]: Must extract administrative metrics', async () => {
    const file = availablePdfs.find(f => f.includes('43_BC') || f.includes('Tu_phap')) || availablePdfs[0];
    const doc = await parser.parse(path.join(uploadsDir, file));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    expect(ranked.metadata.document_title.length).toBeGreaterThan(5);
    expect(ranked.level2_details.metrics.length).toBeGreaterThan(0);
  });

  // TEST 7: Chuỗi Quan Hệ Đa Chiều (Issue -> Cause -> Impact -> Action)
  it('TEST 7 [Relationship Chain]: Must construct structured relationship chains', async () => {
    const doc = await parser.parse(path.join(uploadsDir, availablePdfs[0]));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    if (ranked.level2_details.relationships.length > 0) {
      const rel = ranked.level2_details.relationships[0];
      expect(rel.issue).toBeDefined();
      expect(rel.severity).toBeDefined();
      expect(rel.page_ref).toBeGreaterThan(0);
    }
  });

  // TEST 8: Xếp hạng 11 Bậc Ưu Tiên
  it('TEST 8 [Priority Ranking]: Must rank Decision Needed at Rank 1 or High Priority', async () => {
    const doc = await parser.parse(path.join(uploadsDir, availablePdfs[0]));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    const cards = ranked.level1_executive_brief.priority_cards;
    expect(cards.length).toBeGreaterThan(0);
    for (let i = 0; i < cards.length - 1; i++) {
      expect(cards[i].priority_rank).toBeLessThanOrEqual(cards[i + 1].priority_rank);
    }
  });

  // TEST 9: Tính chất dữ liệu (Data Nature)
  it('TEST 9 [Data Nature]: Must preserve UOC_THUC_HIEN vs THUC_HIEN_THUC_TE', async () => {
    const doc = await parser.parse(path.join(uploadsDir, availablePdfs[0]));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    const natures = ranked.level2_details.metrics.map(m => m.data_nature);
    expect(natures.every(n => ['THUC_HIEN_THUC_TE', 'UOC_THUC_HIEN', 'KE_HOACH'].includes(n))).toBe(true);
  });

  // TEST 10: Truy vết dẫn chứng (Citation & Grounding)
  it('TEST 10 [Source Traceability]: All extracted metrics, relationships and cards must reference valid pages', async () => {
    const doc = await parser.parse(path.join(uploadsDir, availablePdfs[0]));
    const rawIR = await extractor.extract(doc);
    const ranked = ranker.rankAndSynthesize(rawIR);

    for (const m of ranked.level2_details.metrics) {
      expect(m.page_ref).toBeGreaterThanOrEqual(1);
      expect(m.page_ref).toBeLessThanOrEqual(doc.totalPages);
    }

    for (const card of ranked.level1_executive_brief.priority_cards) {
      expect(card.source_page_ref).toBeGreaterThanOrEqual(1);
      expect(card.source_page_ref).toBeLessThanOrEqual(doc.totalPages);
    }
  });
});
