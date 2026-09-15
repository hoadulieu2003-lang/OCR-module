import { describe, it, expect } from 'vitest';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import path from 'path';
import fs from 'fs';

describe('Task 2: Advanced PDF Parser with Table Recognition', () => {
  const uploadsDir = path.resolve(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));
  const samplePdf = path.join(uploadsDir, files[0]);

  it('should parse PDF, preserve page numbers, blocks and layout structure', async () => {
    const parser = new PdfParserService();
    const doc = await parser.parse(samplePdf);

    expect(doc.totalPages).toBeGreaterThan(0);
    expect(doc.pages.length).toBe(doc.totalPages);
    expect(doc.totalChars).toBeGreaterThan(100);
    expect(doc.isScanned).toBe(false);

    const p1 = doc.pages[0];
    expect(p1.pageNumber).toBe(1);
    expect(p1.blocks.length).toBeGreaterThan(0);
    expect(p1.blocks[0].bbox.length).toBe(4);
  });
});
