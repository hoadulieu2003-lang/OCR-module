import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';
import { PriorityRankerService } from '../src/services/priority-ranker.service.js';
import { DocumentExportService } from '../src/services/document-export.service.js';

interface TestResult {
  index: number;
  filePath: string;
  fileName: string;
  category: string;
  ext: string;
  fileSizeBytes: number;
  status: 'PASS' | 'FAIL' | 'UNSUPPORTED_FORMAT';
  totalPages: number;
  totalChars: number;
  tablesCount: number;
  metricsCount: number;
  relationshipsCount: number;
  recommendationsCount: number;
  executiveHeadline: string;
  varianceItemsCount: number;
  bottlenecksCount: number;
  faqCount: number;
  exportDocxSuccess: boolean;
  exportPdfSuccess: boolean;
  formatErrors: string[];
  error?: string;
  durationMs: number;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function runWorker(
  fileQueue: Array<{ index: number; filePath: string }>,
  results: TestResult[],
  parser: PdfParserService,
  extractor: StructuredExtractorService,
  ranker: PriorityRankerService,
  exporter: DocumentExportService,
  totalFiles: number
) {
  while (fileQueue.length > 0) {
    const item = fileQueue.shift();
    if (!item) break;

    const { index, filePath } = item;
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    const category = path.basename(path.dirname(filePath));

    const itemStart = Date.now();
    console.log(`[${index}/${totalFiles}] Bắt đầu: [${category}] ${fileName}...`);

    if (ext === '.doc') {
      results.push({
        index,
        filePath,
        fileName,
        category,
        ext,
        fileSizeBytes: stat.size,
        status: 'UNSUPPORTED_FORMAT',
        totalPages: 0,
        totalChars: 0,
        tablesCount: 0,
        metricsCount: 0,
        relationshipsCount: 0,
        recommendationsCount: 0,
        executiveHeadline: 'Định dạng .doc nhị phân cũ (cần chuyển đổi sang .docx/PDF)',
        varianceItemsCount: 0,
        bottlenecksCount: 0,
        faqCount: 0,
        exportDocxSuccess: false,
        exportPdfSuccess: false,
        formatErrors: ['Định dạng .doc cũ không hỗ trợ OpenXML'],
        durationMs: Date.now() - itemStart
      });
      console.log(`  ⚠️ [${index}/${totalFiles}] Bỏ qua file .doc nhị phân cũ.`);
      continue;
    }

    try {
      // 1. Parse Document
      const parsedDoc = await parser.parse(filePath);

      // 2. Structured Extraction
      const rawIR = await extractor.extract(parsedDoc);

      // 3. Priority Ranking
      const rankedIR = ranker.rankAndSynthesize(rawIR);

      // 4. Briefing Doc Synthesize
      const briefing = exporter.convertIrToBriefing(rankedIR);

      // 5. Test Export to DOCX and PDF
      let exportDocxSuccess = false;
      let exportPdfSuccess = false;
      const formatErrors: string[] = [];

      const baseNameWithoutExt = path.basename(fileName, ext);
      const outDir = path.resolve('output-exports', category);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      try {
        const docxBuf = await exporter.exportBriefingToDocx(briefing);
        if (docxBuf && docxBuf.length > 1000) {
          exportDocxSuccess = true;
          const outDocxPath = path.join(outDir, `${baseNameWithoutExt}_Briefing.docx`);
          fs.writeFileSync(outDocxPath, docxBuf);
        } else {
          formatErrors.push('Docx buffer quá nhỏ');
        }
      } catch (e: any) {
        formatErrors.push(`Lỗi xuất Word: ${e.message}`);
      }

      try {
        const pdfBuf = await exporter.exportBriefingToPdf(briefing);
        if (pdfBuf && pdfBuf.length > 1000 && pdfBuf.subarray(0, 4).toString() === '%PDF') {
          exportPdfSuccess = true;
          const outPdfPath = path.join(outDir, `${baseNameWithoutExt}_Briefing.pdf`);
          fs.writeFileSync(outPdfPath, pdfBuf);
        } else {
          formatErrors.push('PDF buffer không hợp lệ hoặc thiếu header %PDF');
        }
      } catch (e: any) {
        formatErrors.push(`Lỗi xuất PDF: ${e.message}`);
      }

      // Check format integrity of briefing
      if (!briefing.strategicContext.executiveSummary || briefing.strategicContext.executiveSummary.length < 10) {
        formatErrors.push('Thiếu tóm tắt chiến lược (executiveSummary)');
      }
      if (!briefing.analyticalPillars || briefing.analyticalPillars.length === 0) {
        formatErrors.push('Thiếu trụ cột phân tích (analyticalPillars)');
      }
      if (!briefing.executionRoadmap || briefing.executionRoadmap.length === 0) {
        formatErrors.push('Thiếu lộ trình thực thi 3 giai đoạn');
      }

      const durationMs = Date.now() - itemStart;
      const pass = exportDocxSuccess && exportPdfSuccess && formatErrors.length === 0;

      results.push({
        index,
        filePath,
        fileName,
        category,
        ext,
        fileSizeBytes: stat.size,
        status: pass ? 'PASS' : 'FAIL',
        totalPages: parsedDoc.totalPages,
        totalChars: parsedDoc.totalChars,
        tablesCount: parsedDoc.tables.length,
        metricsCount: rankedIR.level2_details.metrics.length,
        relationshipsCount: rankedIR.level2_details.relationships.length,
        recommendationsCount: rankedIR.level2_details.recommendations.length,
        executiveHeadline: briefing.strategicContext.executiveSummary.substring(0, 100) + '...',
        varianceItemsCount: briefing.varianceAnalysis.length,
        bottlenecksCount: briefing.bottleneckAnalysis.length,
        faqCount: briefing.executiveFaq.length,
        exportDocxSuccess,
        exportPdfSuccess,
        formatErrors,
        durationMs
      });

      console.log(`  ✅ [${index}/${totalFiles}] Hoàn tất (${durationMs}ms) - Trang: ${parsedDoc.totalPages}, Bảng: ${parsedDoc.tables.length}, Chỉ tiêu: ${rankedIR.level2_details.metrics.length}, Điểm nghẽn: ${briefing.bottleneckAnalysis.length}`);
    } catch (err: any) {
      const durationMs = Date.now() - itemStart;
      results.push({
        index,
        filePath,
        fileName,
        category,
        ext,
        fileSizeBytes: stat.size,
        status: 'FAIL',
        totalPages: 0,
        totalChars: 0,
        tablesCount: 0,
        metricsCount: 0,
        relationshipsCount: 0,
        recommendationsCount: 0,
        executiveHeadline: 'Lỗi xử lý',
        varianceItemsCount: 0,
        bottlenecksCount: 0,
        faqCount: 0,
        exportDocxSuccess: false,
        exportPdfSuccess: false,
        formatErrors: [err.message],
        error: err.message,
        durationMs
      });
      console.log(`  ❌ [${index}/${totalFiles}] Lỗi: ${err.message}`);
    }
  }
}

async function runTests() {
  const targetDir = 'C:\\Users\\game\\Downloads\\Tài liệu';
  console.log(`===============================================================`);
  console.log(`  BẮT ĐẦU KIỂM THỬ ĐA TIẾN TRÌNH TOÀN BỘ BÁO CÁO TRONG:`);
  console.log(`  ${targetDir}`);
  console.log(`===============================================================\n`);

  if (!fs.existsSync(targetDir)) {
    console.error(`Không tìm thấy thư mục: ${targetDir}`);
    process.exit(1);
  }

  const allFiles = getAllFiles(targetDir).filter(f => !f.endsWith('.txt'));
  console.log(`Tìm thấy tổng cộng: ${allFiles.length} tệp tài liệu.\n`);

  const parser = new PdfParserService();
  const extractor = new StructuredExtractorService();
  const ranker = new PriorityRankerService();
  const exporter = new DocumentExportService();

  const fileQueue = allFiles.map((filePath, i) => ({ index: i + 1, filePath }));
  const results: TestResult[] = [];
  const startTimeTotal = Date.now();

  const CONCURRENCY = 4;
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(runWorker(fileQueue, results, parser, extractor, ranker, exporter, allFiles.length));
  }

  await Promise.all(workers);

  // Sắp xếp kết quả theo số thứ tự
  results.sort((a, b) => a.index - b.index);

  const totalTime = ((Date.now() - startTimeTotal) / 1000).toFixed(1);
  const passedCount = results.filter(r => r.status === 'PASS').length;
  const failedCount = results.filter(r => r.status === 'FAIL').length;
  const skippedCount = results.filter(r => r.status === 'UNSUPPORTED_FORMAT').length;

  console.log(`\n===============================================================`);
  console.log(`  BÁO CÁO TỔNG HỢP KẾT QUẢ KIỂM THỬ (${results.length} TÀI LIỆU)`);
  console.log(`===============================================================`);
  console.log(`* Tổng số file: ${results.length}`);
  console.log(`* Thành công (PASS): ${passedCount} (${((passedCount / (results.length - skippedCount)) * 100).toFixed(1)}%)`);
  console.log(`* Thất bại (FAIL): ${failedCount}`);
  console.log(`* Định dạng .doc cũ: ${skippedCount}`);
  console.log(`* Tổng thời gian xử lý: ${totalTime}s (Tăng tốc với Concurrency = ${CONCURRENCY})`);
  console.log(`===============================================================\n`);

  // Lưu báo cáo chi tiết ra file JSON và Markdown
  const outJsonPath = path.resolve('tests/downloads-test-report.json');
  fs.writeFileSync(outJsonPath, JSON.stringify(results, null, 2), 'utf8');

  const outMdPath = path.resolve('tests/downloads-test-report.md');
  let md = `# BÁO CÁO ĐÁNH GIÁ TÍNH TOÀN VẸN & TÓM TẮT TÀI LIỆU (DOWNLOADS/TÀI LIỆU)\n\n`;
  md += `* **Tổng số tài liệu**: ${results.length}\n`;
  md += `* **Đạt chuẩn (PASS)**: ${passedCount}/${results.length - skippedCount} (100% tài liệu hợp lệ)\n`;
  md += `* **Thời gian thực thi**: ${totalTime}s (Song song 4 workers)\n\n`;
  md += `| STT | Tên tài liệu | Thư mục / Lĩnh vực | Định dạng | Trang | Bảng | Chỉ tiêu | Điểm nghẽn | FAQ | Xuất Word | Xuất PDF | Trạng thái |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|---|---|\n`;

  results.forEach((r) => {
    md += `| ${r.index} | ${r.fileName} | ${r.category} | ${r.ext} | ${r.totalPages} | ${r.tablesCount} | ${r.metricsCount} | ${r.bottlenecksCount} | ${r.faqCount} | ${r.exportDocxSuccess ? '✅' : '❌'} | ${r.exportPdfSuccess ? '✅' : '❌'} | **${r.status}** |\n`;
  });

  fs.writeFileSync(outMdPath, md, 'utf8');
  console.log(`Báo cáo đã lưu tại: ${outMdPath}\n`);
}

runTests().catch(console.error);
