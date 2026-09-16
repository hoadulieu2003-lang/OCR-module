import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import { ProcessDocumentUseCase } from '../dist/use-cases/process-document.use-case.js';
import { ExportReportUseCase } from '../dist/use-cases/export-report.use-case.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
const OUT_DIR = path.resolve(__dirname, '../scratch/audit_outputs');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function inspectDocx(buffer) {
  const rawText = (await mammoth.extractRawText({ buffer })).value || '';
  const html = (await mammoth.convertToHtml({ buffer })).value || '';
  
  const tableMatches = html.match(/<table[^>]*>/gi) || [];
  const pMatches = html.match(/<p[^>]*>/gi) || [];
  
  const ufffdCount = (rawText.match(/\ufffd/g) || []).length;
  const undefinedCount = (rawText.match(/\bundefined\b/gi) || []).length;
  const nullCount = (rawText.match(/\bnull\b/gi) || []).length;
  const nanCount = (rawText.match(/\bNaN\b/g) || []).length;
  
  const htmlParagraphs = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
    .map(p => p.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  const orphanLines = htmlParagraphs.filter(l => l.length > 0 && l.length <= 4 && !/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|1|2|3|4|5|6|7|8|9|10|[a-z]\))\.?$/i.test(l) && !/^[-*•—]$/.test(l));

  return {
    rawTextLength: rawText.length,
    tableCount: tableMatches.length,
    paragraphCount: pMatches.length,
    ufffdCount,
    undefinedCount,
    nullCount,
    nanCount,
    orphanLines: orphanLines.slice(0, 5),
    rawTextSample: rawText.substring(0, 300)
  };
}

async function runAudit() {
  console.log('================================================================');
  console.log('BẮT ĐẦU ĐÁNH GIÁ THỰC TẾ TRÊN TOÀN BỘ TẬP TIN TRONG UPLOADS/');
  console.log('================================================================');

  const files = fs.readdirSync(UPLOADS_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ext === '.pdf' || ext === '.docx' || ext === '.doc';
  });

  console.log(`Tìm thấy tổng cộng ${files.length} tài liệu thực tế cần kiểm thử.`);

  const processUseCase = new ProcessDocumentUseCase();
  const exportUseCase = new ExportReportUseCase();

  const auditResults = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const filePath = path.join(UPLOADS_DIR, file);
    const ext = path.extname(file).toLowerCase();
    console.log(`\n[${idx + 1}/${files.length}] Đang xử lý: ${file} (${Math.round(fs.statSync(filePath).size / 1024)} KB)`);

    const fileReport = {
      filename: file,
      format: ext,
      sizeKb: Math.round(fs.statSync(filePath).size / 1024),
      status: 'PENDING',
      errors: [],
      warnings: [],
      inputStats: {},
      outputStats: {}
    };

    const startTime = Date.now();
    try {
      // 1. Process Input
      const { rankedIR, parsedDoc, processingTimeMs } = await processUseCase.execute(filePath);

      fileReport.inputStats = {
        totalPages: parsedDoc.totalPages,
        totalChars: parsedDoc.totalChars,
        isScanned: parsedDoc.isScanned,
        tablesCount: parsedDoc.tables ? parsedDoc.tables.length : 0,
        blocksCount: parsedDoc.pages ? parsedDoc.pages.reduce((acc, p) => acc + (p.blocks?.length || 0), 0) : 0,
        processingTimeMs
      };

      // 2. Export Output Docx
      const rawFullText = parsedDoc.pages ? parsedDoc.pages.map(p => p.text).join('\n\n') : '';
      const exportResult = await exportUseCase.exportDocx(rankedIR, rawFullText);

      // Save output
      const outName = `${path.basename(file, ext)}_AUDIT.docx`;
      const outPath = path.join(OUT_DIR, outName);
      fs.writeFileSync(outPath, exportResult.content);

      // 3. Inspect Output Docx
      const docxStats = await inspectDocx(exportResult.content);
      fileReport.outputStats = docxStats;

      // 4. Evaluate Input vs Output Discrepancies & Anomalies
      const textRatio = docxStats.rawTextLength / (parsedDoc.totalChars || 1);
      fileReport.textPreservationRatio = Math.round(textRatio * 100);

      if (textRatio < 0.6 && parsedDoc.totalChars > 500) {
        fileReport.warnings.push(`Tỷ lệ bảo toàn văn bản thấp: ${Math.round(textRatio * 100)}% (${docxStats.rawTextLength} / ${parsedDoc.totalChars} chars)`);
      }

      // Output docx has 1 header layout table + 1 footer layout table + data tables
      const inputTables = parsedDoc.tables?.length || 0;
      const outputTablesExcludingHeader = Math.max(0, docxStats.tableCount - 2);
      fileReport.tableMatch = {
        inputTables,
        outputTables: outputTablesExcludingHeader,
        match: inputTables === outputTablesExcludingHeader
      };

      if (inputTables !== outputTablesExcludingHeader) {
        fileReport.warnings.push(`Chênh lệch số lượng bảng: Input có ${inputTables} bảng, Output có ${outputTablesExcludingHeader} bảng số liệu`);
      }

      // Check \ufffd
      if (docxStats.ufffdCount > 0) {
        fileReport.errors.push(`Phát hiện ${docxStats.ufffdCount} ký tự vỡ font \\ufffd trong file Word xuất ra!`);
      }

      // Check code artifacts
      if (docxStats.undefinedCount > 0) {
        fileReport.errors.push(`Phát hiện chuỗi "undefined" (${docxStats.undefinedCount} lần) xuất hiện trong văn bản Word!`);
      }
      if (docxStats.nanCount > 0) {
        fileReport.errors.push(`Phát hiện chuỗi "NaN" (${docxStats.nanCount} lần) trong văn bản Word!`);
      }

      // Check orphan lines
      if (docxStats.orphanLines && docxStats.orphanLines.length > 0) {
        fileReport.warnings.push(`Phát hiện từ đơn rơi dòng: ${JSON.stringify(docxStats.orphanLines)}`);
      }

      // Check metadata
      if (!rankedIR.metadata?.document_title) {
        fileReport.warnings.push('Thiếu document_title trong IR metadata');
      }

      fileReport.status = fileReport.errors.length > 0 ? 'ERROR' : (fileReport.warnings.length > 0 ? 'WARNING' : 'PERFECT');
      console.log(`  -> Trạng thái: ${fileReport.status} | Time: ${Date.now() - startTime}ms | Chars In/Out: ${parsedDoc.totalChars}/${docxStats.rawTextLength} | Tables In/Out: ${inputTables}/${outputTablesExcludingHeader}`);
      if (fileReport.errors.length > 0) {
        console.log(`     [LỖI]:`, fileReport.errors);
      }
      if (fileReport.warnings.length > 0) {
        console.log(`     [CẢNH BÁO]:`, fileReport.warnings);
      }
    } catch (err) {
      fileReport.status = 'FAILED';
      fileReport.errors.push(`Exception: ${err.message}`);
      console.log(`  -> FAILED: ${err.message}`);
    }

    auditResults.push(fileReport);
  }

  // Save audit log to JSON
  const summaryPath = path.resolve(__dirname, '../scratch/audit_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(auditResults, null, 2));
  console.log(`\n================================================================`);
  console.log(`HOÀN TẤT ĐÁNH GIÁ TOÀN DIỆN. Đã lưu kết quả tại: ${summaryPath}`);
  console.log(`================================================================`);

  const perfectCount = auditResults.filter(r => r.status === 'PERFECT').length;
  const warningCount = auditResults.filter(r => r.status === 'WARNING').length;
  const errorCount = auditResults.filter(r => r.status === 'ERROR').length;
  const failedCount = auditResults.filter(r => r.status === 'FAILED').length;

  console.log(`TỔNG HỢP KẾT QUẢ:`);
  console.log(`- PERFECT (Khớp hoàn hảo): ${perfectCount}/${auditResults.length}`);
  console.log(`- WARNING (Có chênh lệch/cảnh báo): ${warningCount}/${auditResults.length}`);
  console.log(`- ERROR (Có lỗi rác/ký tự lạ): ${errorCount}/${auditResults.length}`);
  console.log(`- FAILED (Ngoại lệ/Không xử lý được): ${failedCount}/${auditResults.length}`);
}

runAudit().catch(console.error);
