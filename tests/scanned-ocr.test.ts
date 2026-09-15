import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';

describe('Work Package 1: True Offline Vietnamese OCR Engine on Pure Scanned PDFs', () => {
  const testScannedPdfPath = path.resolve(__dirname, '../uploads/fixture_scanned_test.pdf');
  let pdfParserService: PdfParserService;
  let structuredExtractor: StructuredExtractorService;

  beforeAll(() => {
    pdfParserService = new PdfParserService();
    structuredExtractor = new StructuredExtractorService();

    // Sinh tệp PDF scan thuần túy (ảnh bitmap phẳng, hoàn toàn không có Text Layer) bằng Python
    const genScriptPath = path.resolve(__dirname, '../uploads/gen_scan_temp.py');
    const escapedPdfPath = testScannedPdfPath.replace(/\\/g, '/');
    const pyScript = `
import pymupdf, io
from PIL import Image, ImageDraw

img = Image.new('RGB', (800, 600), color=(255, 255, 255))
d = ImageDraw.Draw(img)
d.text((50, 50), 'UBND TINH DONG NAI', fill=(0, 0, 0))
d.text((50, 100), 'BAO CAO KET QUA KINH TE', fill=(0, 0, 0))
d.text((50, 150), 'Ty le giai ngan: 89.2%', fill=(0, 0, 0))

buf = io.BytesIO()
img.save(buf, format='PNG')

doc = pymupdf.open()
p = doc.new_page(width=595, height=842)
p.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=buf.getvalue())
doc.save('${escapedPdfPath}')
doc.close()
`;
    fs.writeFileSync(genScriptPath, pyScript, 'utf-8');
    try {
      execSync(`python "${genScriptPath}"`);
    } finally {
      if (fs.existsSync(genScriptPath)) {
        fs.unlinkSync(genScriptPath);
      }
    }
  });

  afterAll(() => {
    if (fs.existsSync(testScannedPdfPath)) {
      try {
        fs.unlinkSync(testScannedPdfPath);
      } catch {
        // Bỏ qua nếu đang bị lock
      }
    }
  });

  it('phát hiện đúng tệp PDF scan và kích hoạt RapidOCR ONNX để khôi phục text layer', async () => {
    const parsed = await pdfParserService.parse(testScannedPdfPath);

    expect(parsed.totalPages).toBe(1);
    expect(parsed.isScanned).toBe(true);
    expect(parsed.ocrApplied).toBe(true);
    expect(parsed.totalChars).toBeGreaterThan(30);

    const firstPage = parsed.pages[0];
    expect(firstPage.blocks.length).toBeGreaterThanOrEqual(2);
    expect(firstPage.words?.length).toBeGreaterThanOrEqual(5);

    // Kiểm chứng nội dung chữ được nhận diện từ ảnh
    const combinedText = firstPage.text.toUpperCase();
    expect(combinedText).toContain('UBND');
    expect(combinedText).toContain('89.2%');
  });

  it('đưa kết quả OCR vào StructuredExtractor để trích xuất chỉ số định lượng chính xác', async () => {
    const parsed = await pdfParserService.parse(testScannedPdfPath);
    const ir = await structuredExtractor.extract(parsed);

    expect(ir).toBeDefined();
    expect(ir.metadata.document_title).toBeDefined();

    // Bóc tách chỉ số giải ngân 89.2% từ văn bản scan
    const metrics = ir.level2_details.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(1);

    const kpiMetric = metrics.find(m => m.percentage === '89.2' || m.actual === '89.2' || (m.quote && m.quote.includes('89.2')));
    expect(kpiMetric).toBeDefined();
    expect(kpiMetric?.evidence_refs.length).toBeGreaterThanOrEqual(1);
  });
});
