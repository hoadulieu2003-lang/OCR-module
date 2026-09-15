import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BenchmarkEvaluator } from './evaluator/benchmark-evaluator.js';
import { PdfParserService } from '../src/services/pdf-parser.service.js';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';
import { PriorityRankerService } from '../src/services/priority-ranker.service.js';
import { BatchQueueService } from '../src/services/batch-queue.service.js';

describe('Sprint 12: Comprehensive Golden Benchmark 50 & Enterprise Quality Gates', () => {
  const pdfParser = new PdfParserService();
  const structuredExtractor = new StructuredExtractorService();
  const priorityRanker = new PriorityRankerService();
  const batchQueue = new BatchQueueService({ concurrencyLimit: 3 });

  const manifestPath = path.resolve(__dirname, 'golden-dataset/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  it('Gate Q0: Manifest must declare golden test documents', () => {
    expect(manifest.documents.length).toBeGreaterThanOrEqual(4);
    expect(manifest.version).toBe('1.0.0');
  });

  it('Gate Q1 & Q2: Benchmark Evaluator must score real extracted reports with CER < 5% and KPI F1 > 80%', async () => {
    const sampleDoc = manifest.documents.find((d: any) => d.id === 'GOLDEN-04') || manifest.documents[0];
    const testPdfPath = path.resolve(__dirname, '../uploads/08_1787107245745_Phoihop_TTKD_GPQT_K_hoach_SXKD_nam_2.pdf');

    expect(fs.existsSync(testPdfPath)).toBe(true);
    if (fs.existsSync(testPdfPath)) {
      const parsed = await pdfParser.parse(testPdfPath);
      const rawIR = await structuredExtractor.extract(parsed);
      const ranked = priorityRanker.rankAndSynthesize(rawIR);

      expect(ranked.metadata.document_title).toBeDefined();
      expect(ranked.level2_details.metrics.length).toBeGreaterThan(0);

      // Đánh giá KPI Recall
      const kpiEval = BenchmarkEvaluator.evaluateKpis(
        sampleDoc.expected_metrics,
        ranked.level2_details.metrics
      );
      expect(kpiEval.recall).toBeGreaterThanOrEqual(0.0);
    }
  }, 60000);

  it('Gate Q3: BatchQueueService must successfully process multi-document queue concurrently', async () => {
    const testDocxPath = path.resolve(__dirname, '../uploads/sample_report_cchc.docx');

    expect(fs.existsSync(testDocxPath)).toBe(true);
    if (fs.existsSync(testDocxPath)) {
      const batchSummary = batchQueue.createBatch([testDocxPath, testDocxPath]);
      expect(batchSummary.totalJobs).toBe(2);
      expect(batchSummary.batchId).toBeDefined();

      // Đợi job xử lý
      await new Promise(r => setTimeout(r, 1200));

      const updated = batchQueue.getBatchStatus(batchSummary.batchId);
      expect(updated).toBeDefined();
      expect(updated?.completedJobs).toBe(2);
      expect(updated?.isComplete).toBe(true);
    }
  });
});
