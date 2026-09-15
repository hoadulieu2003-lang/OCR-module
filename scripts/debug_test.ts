import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';
import { PriorityRankerService } from '../src/services/priority-ranker.service.js';
import { ExecutiveReportIRSchema } from '../src/schemas/report-ir.schema.js';

async function test() {
  const parser = new PdfParserService();
  const extractor = new StructuredExtractorService();
  const ranker = new PriorityRankerService();
  const filePath = 'C:\\Users\\game\\Downloads\\Tài liệu\\báo cáo công khai của chính phủ ( real )-20260815T081613Z-1-001\\báo cáo công khai của chính phủ ( real )\\BC CCHC quý III xã Minh Long.pdf';
  const doc = await parser.parse(filePath);
  const rawIR = await extractor.extract(doc);
  const ranked = ranker.rankAndSynthesize(rawIR);
  const res = ExecutiveReportIRSchema.safeParse(ranked);
  if (!res.success) {
    console.log('ZOD ERROR:');
    console.log(JSON.stringify(res.error.format(), null, 2));
  } else {
    console.log('SUCCESS! Parsed perfectly.');
  }
}
test().catch(console.error);
