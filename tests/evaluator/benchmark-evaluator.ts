/**
 * Benchmark Evaluator Framework for KGLVS Administrative Document Intelligence Platform V3
 * Đo lường định lượng: CER, Table Accuracy, KPI Extraction Accuracy, Citation Bbox IoU
 */

export interface BenchmarkMetrics {
  totalDocuments: number;
  totalPages: number;
  averageCER: number;
  averageTableAccuracy: number;
  kpiPrecision: number;
  kpiRecall: number;
  kpiF1Score: number;
  bboxAverageIoU: number;
  processingTimePerDocMs: number;
}

export class BenchmarkEvaluator {
  /**
   * Tính khoảng cách Levenshtein giữa 2 chuỗi
   */
  static levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // Deletion
          dp[i][j - 1] + 1,      // Insertion
          dp[i - 1][j - 1] + cost // Substitution
        );
      }
    }
    return dp[m][n];
  }

  /**
   * Tính Character Error Rate (CER)
   */
  static computeCER(groundTruth: string, hypothesis: string): number {
    const cleanGT = groundTruth.trim().replace(/\s+/g, ' ');
    const cleanHyp = hypothesis.trim().replace(/\s+/g, ' ');
    if (cleanGT.length === 0) return cleanHyp.length === 0 ? 0 : 1;

    const dist = this.levenshteinDistance(cleanGT, cleanHyp);
    return Math.min(1.0, dist / cleanGT.length);
  }

  /**
   * Tính Intersection over Union (IoU) giữa 2 Bounding Box [x0, y0, x1, y1]
   */
  static computeBBoxIoU(
    bbox1: [number, number, number, number],
    bbox2: [number, number, number, number]
  ): number {
    const [x1A, y1A, x2A, y2A] = bbox1;
    const [x1B, y1B, x2B, y2B] = bbox2;

    const xLeft = Math.max(x1A, x1B);
    const yTop = Math.max(y1A, y1B);
    const xRight = Math.min(x2A, x2B);
    const yBottom = Math.min(y2A, y2B);

    if (xRight < xLeft || yBottom < yTop) {
      return 0.0;
    }

    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const areaA = (x2A - x1A) * (y2A - y1A);
    const areaB = (x2B - x1B) * (y2B - y1B);
    const unionArea = areaA + areaB - intersectionArea;

    if (unionArea <= 0) return 0.0;
    return intersectionArea / unionArea;
  }

  /**
   * Đánh giá độ chính xác của bảng biểu (Header-Cell Alignment)
   */
  static computeTableAccuracy(
    expectedHeaders: string[],
    extractedHeaders: string[],
    expectedRowsCount: number,
    extractedRowsCount: number
  ): number {
    if (expectedHeaders.length === 0) return 1.0;

    let matchedHeaders = 0;
    for (const exp of expectedHeaders) {
      const isFound = extractedHeaders.some(h =>
        h.toLowerCase().includes(exp.toLowerCase()) || exp.toLowerCase().includes(h.toLowerCase())
      );
      if (isFound) matchedHeaders++;
    }

    const headerScore = matchedHeaders / expectedHeaders.length;
    const rowCountDiff = Math.abs(expectedRowsCount - extractedRowsCount);
    const rowScore = Math.max(0, 1 - (rowCountDiff / Math.max(1, expectedRowsCount)));

    return 0.6 * headerScore + 0.4 * rowScore;
  }

  /**
   * Đánh giá độ chính xác trích xuất KPI (Precision, Recall, F1)
   */
  static evaluateKpis(
    groundTruthKpis: { indicator: string; actual?: string | null }[],
    extractedKpis: { indicator: string; actual?: string | null }[]
  ): { precision: number; recall: number; f1Score: number } {
    if (groundTruthKpis.length === 0) {
      return { precision: 1.0, recall: 1.0, f1Score: 1.0 };
    }

    let truePositives = 0;

    for (const gt of groundTruthKpis) {
      const match = extractedKpis.find(ext => {
        const nameMatch = ext.indicator.toLowerCase().includes(gt.indicator.toLowerCase()) ||
                          gt.indicator.toLowerCase().includes(ext.indicator.toLowerCase());
        return nameMatch;
      });

      if (match) {
        truePositives++;
      }
    }

    const precision = extractedKpis.length > 0 ? truePositives / extractedKpis.length : 0;
    const recall = truePositives / groundTruthKpis.length;
    const f1Score = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return { precision, recall, f1Score };
  }
}
