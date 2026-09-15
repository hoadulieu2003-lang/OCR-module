import { describe, it, expect } from 'vitest';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';
import { PriorityRankerService } from '../src/services/priority-ranker.service.js';
import { ExecutiveReportIRSchema } from '../src/schemas/report-ir.schema.js';
import path from 'path';
import fs from 'fs';

describe('Task 3: Multi-Label Classification & Structured Extractor', () => {
  const uploadsDir = path.resolve(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));
  const samplePdf = path.join(uploadsDir, files[0]);

  it('should classify and extract structured facts with exact provenance and relationships', async () => {
    const parser = new PdfParserService();
    const extractor = new StructuredExtractorService({ apiKey: '' });
    const ranker = new PriorityRankerService();

    const doc = await parser.parse(samplePdf);
    const rawIR = await extractor.extract(doc);
    const rankedIR = ranker.rankAndSynthesize(rawIR);

    // Validate Schema
    const parseResult = ExecutiveReportIRSchema.safeParse(rankedIR);
    expect(parseResult.success).toBe(true);

    // Validate Metadata
    expect(rankedIR.metadata.document_title).toBeDefined();
    expect(rankedIR.metadata.primary_domain).toBeDefined();
    expect(rankedIR.metadata.domain_tags.length).toBeGreaterThan(0);

    // Validate Level 1 Brief
    expect(rankedIR.level1_executive_brief.overall_status).toBeDefined();
    expect(rankedIR.level1_executive_brief.headline).toBeDefined();
    expect(rankedIR.level1_executive_brief.priority_cards.length).toBeGreaterThan(0);

    // Validate Level 2 Details
    expect(rankedIR.level2_details.metrics.length).toBeGreaterThan(0);
  });
});
