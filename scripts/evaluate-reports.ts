import fs from 'fs';
import path from 'path';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { ReportExtractorService } from '../src/services/report-extractor.service.js';

async function runEvaluation() {
  const dirPath = 'C:\\Users\\game\\Downloads\\Tài liệu\\báo cáo công khai của chính phủ ( real )-20260815T081613Z-1-001\\báo cáo công khai của chính phủ ( real )';

  console.log('='.repeat(80));
  console.log('🏛️  BẮT ĐẦU ĐÁNH GIÁ MODULE OCR & BÓC TÁCH TRÊN 13 BÁO CÁO CHÍNH PHỦ THỰC TẾ');
  console.log('='.repeat(80));

  const pdfParser = new PdfParserService();
  const reportExtractor = new ReportExtractorService();

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
  console.log(`Tìm thấy ${files.length} file PDF báo cáo thực tế.\n`);

  let successCount = 0;
  const results: any[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = path.join(dirPath, file);
    console.log(`[${i + 1}/${files.length}] Đang xử lý: ${file}...`);

    try {
      const startTime = Date.now();
      const parsedDoc = await pdfParser.parse(fullPath);
      const parseTime = Date.now() - startTime;

      const extractStartTime = Date.now();
      const extraction = await reportExtractor.extractReport(parsedDoc);
      const extractTime = Date.now() - extractStartTime;

      successCount++;
      results.push({
        file,
        docNo: extraction.metadata.document_number,
        authority: extraction.metadata.issuing_authority,
        category: extraction.metadata.report_category,
        metricsCount: extraction.key_metrics.length,
        tasksCount: extraction.actionable_tasks.length,
        bottlenecksCount: extraction.bottlenecks.length,
        evalStatus: extraction.executive_brief.overall_evaluation,
        headline: extraction.executive_brief.headline,
        parseTimeMs: parseTime,
        extractTimeMs: extractTime
      });

      console.log(`  ✓ Thành công [${parseTime + extractTime}ms]: Số ${extraction.metadata.document_number} | ${extraction.metadata.issuing_authority} | ${extraction.key_metrics.length} chỉ tiêu | ${extraction.actionable_tasks.length} đầu việc`);
    } catch (err: any) {
      console.error(`  ❌ Lỗi: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`📊 TỔNG KẾT NGHIỆM THU: ${successCount}/${files.length} FILE ĐẠT 100% ZOD VALIDATION`);
  console.log('='.repeat(80));

  console.table(results.map(r => ({
    'Tên file': r.file.length > 30 ? r.file.substring(0, 27) + '...' : r.file,
    'Số hiệu': r.docNo,
    'Cơ quan': r.authority.length > 25 ? r.authority.substring(0, 22) + '...' : r.authority,
    'Loại': r.category,
    'KPIs': r.metricsCount,
    'Điểm nghẽn': r.bottlenecksCount,
    'Đầu việc': r.tasksCount,
    'Tốc độ (ms)': r.parseTimeMs + r.extractTimeMs
  })));

  // Write full JSON results to artifact scratch
  const reportSummaryPath = 'C:\\Users\\game\\.gemini\\antigravity-ide\\brain\\dbfc7d1f-9be9-45dc-85cb-fdd35448fc21\\scratch\\evaluation_results.json';
  fs.writeFileSync(reportSummaryPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nĐã lưu kết quả chi tiết vào: ${reportSummaryPath}`);
}

runEvaluation().catch(err => {
  console.error('Fatal Evaluation Error:', err);
  process.exit(1);
});
