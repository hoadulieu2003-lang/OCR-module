const { PdfParserService } = require('./dist/services/pdf-parser.service.js');
const { StructuredExtractorService } = require('./dist/services/structured-extractor.service.js');
const path = require('path');

async function test() {
  const parser = new PdfParserService();
  const extractor = new StructuredExtractorService();
  const filePath = path.resolve('uploads/1786787233972_43_BC_UBND_f42e9.pdf');
  const doc = await parser.parse(filePath);
  const ir = await extractor.extract(doc);
  
  console.log('=== METADATA ===');
  console.log('Title:', ir.metadata.document_title);
  console.log('Status:', ir.level1_executive_brief.overall_status);
  console.log('Headline:', ir.level1_executive_brief.headline);
  console.log('Zero cases:', ir.level1_executive_brief.zero_cases_summary?.grouped_statement);
  
  console.log('\n=== PRIORITY CARDS ===');
  ir.level1_executive_brief.priority_cards.forEach(c => {
    console.log(`- [${c.priority_level}] ${c.title} (Page ${c.source_page_ref}): ${c.highlight_fact}`);
  });

  console.log('\n=== LEVEL 2 METRICS ===');
  ir.level2_details.metrics.forEach(m => {
    console.log(`- ${m.indicator}: ${m.actual} (Page ${m.page_ref})`);
  });
}
test();
