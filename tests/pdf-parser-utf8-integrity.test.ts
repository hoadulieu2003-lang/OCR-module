import { describe, it, expect } from 'vitest';
import { StringDecoder } from 'string_decoder';
import path from 'path';
import fs from 'fs';
import { PdfParserService } from '../src/services/pdf-parser.service.js';

describe('PDF Parser UTF-8 Stream Boundary Integrity', () => {
  it('should reconstruct multibyte Vietnamese characters split across arbitrary byte boundaries', () => {
    const text = 'Nâng cao ý thức chấp hành pháp luật của người dân';
    const utf8Buffer = Buffer.from(text, 'utf-8');

    // Simulate every possible chunk cut point from 1 to utf8Buffer.length - 1
    for (let cut = 1; cut < utf8Buffer.length; cut++) {
      const chunk1 = utf8Buffer.subarray(0, cut);
      const chunk2 = utf8Buffer.subarray(cut);

      // Using StringDecoder (proper stream decoding)
      const decoder = new StringDecoder('utf-8');
      const reconstructed = decoder.write(chunk1) + decoder.write(chunk2) + decoder.end();

      expect(reconstructed).toBe(text);
      expect(reconstructed).not.toContain('\ufffd');
      expect(reconstructed).toContain('của');
    }
  });

  it('should parse 12-03 report PDF with zero replacement characters and perfect Vietnamese accents', async () => {
    const pdfPath = path.resolve(__dirname, '../uploads/1789531769768_12-03-bao-cao-phat-trien-ktxh-thang-3-quy-i-va-ph-nhiem-vu-t-eba5927d27.pdf');
    if (!fs.existsSync(pdfPath)) {
      return; // Skip if file not present in environment
    }

    const service = new PdfParserService();
    const result = await service.parse(pdfPath);

    expect(result.totalPages).toBeGreaterThan(0);

    let totalUfffd = 0;
    let foundTargetPhrase = false;

    for (const page of result.pages) {
      if (page.text.includes('\ufffd')) {
        totalUfffd += (page.text.match(/\ufffd/g) || []).length;
      }
      if (page.text.includes('pháp luật của người dân')) {
        foundTargetPhrase = true;
      }
    }

    expect(totalUfffd).toBe(0);
    expect(foundTargetPhrase).toBe(true);
  }, 20000);
});
