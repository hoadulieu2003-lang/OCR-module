import { describe, it, expect } from 'vitest';
import { BenchmarkEvaluator } from './evaluator/benchmark-evaluator.js';
import { DocumentEvidenceIRSchema, DocumentEvidenceIR } from '../src/schemas/document-evidence.schema.js';

describe('Sprint 0 & Sprint 1: Benchmark Evaluator & DocumentEvidenceIR Schema', () => {
  it('should compute Levenshtein distance and CER accurately', () => {
    const cerZero = BenchmarkEvaluator.computeCER('Báo cáo tình hình kinh tế', 'Báo cáo tình hình kinh tế');
    expect(cerZero).toBe(0.0);

    const cerPartial = BenchmarkEvaluator.computeCER('Báo cáo kinh tế', 'Báo cáo kình tế');
    expect(cerPartial).toBeGreaterThan(0);
    expect(cerPartial).toBeLessThan(0.2);
  });

  it('should compute Bounding Box IoU accurately', () => {
    const bboxA: [number, number, number, number] = [0, 0, 100, 100];
    const bboxB: [number, number, number, number] = [0, 0, 100, 100];
    expect(BenchmarkEvaluator.computeBBoxIoU(bboxA, bboxB)).toBe(1.0);

    const bboxDisjoint: [number, number, number, number] = [200, 200, 300, 300];
    expect(BenchmarkEvaluator.computeBBoxIoU(bboxA, bboxDisjoint)).toBe(0.0);

    const bboxHalf: [number, number, number, number] = [50, 0, 150, 100];
    const iou = BenchmarkEvaluator.computeBBoxIoU(bboxA, bboxHalf);
    expect(iou).toBeCloseTo(0.333, 2);
  });

  it('should compute KPI Precision, Recall, and F1-score', () => {
    const groundTruth = [
      { indicator: 'Tỷ lệ giải ngân', actual: '95%' },
      { indicator: 'Thu ngân sách', actual: '100 tỷ' }
    ];

    const extracted = [
      { indicator: 'Tỷ lệ giải ngân ĐTC', actual: '95%' },
      { indicator: 'Thu ngân sách nhà nước', actual: '100 tỷ' },
      { indicator: 'Số hồ sơ quá hạn', actual: '0' }
    ];

    const evalResult = BenchmarkEvaluator.evaluateKpis(groundTruth, extracted);
    expect(evalResult.recall).toBe(1.0);
    expect(evalResult.precision).toBeCloseTo(0.666, 2);
    expect(evalResult.f1Score).toBeGreaterThan(0.7);
  });

  it('should validate DocumentEvidenceIR schema strictly', () => {
    const mockEvidence: DocumentEvidenceIR = {
      document_id: 'doc-12345',
      file_name: 'test_report.pdf',
      file_hash_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      mime_type: 'application/pdf',
      total_pages: 1,
      total_chars: 150,
      pipeline_version: '3.0.0-evidence-v1',
      pages: [
        {
          page_number: 1,
          width: 595,
          height: 842,
          rotation: 0,
          is_scanned: false,
          has_watermark: false,
          char_count: 150,
          blocks: [
            {
              block_id: 'p1_b1',
              page_number: 1,
              block_type: 'HEADING_1',
              bbox: [50, 50, 545, 80],
              text: 'BÁO CÁO CÔNG TÁC THÁNG 4',
              reading_order_index: 0,
              confidence: 0.99
            }
          ],
          tables: []
        }
      ],
      all_tables: [],
      extracted_at: new Date().toISOString()
    };

    const parseResult = DocumentEvidenceIRSchema.safeParse(mockEvidence);
    expect(parseResult.success).toBe(true);
  });
});
