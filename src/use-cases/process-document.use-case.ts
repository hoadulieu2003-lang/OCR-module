import { PdfParserService, ParsedDocument } from '../services/pdf-parser.service.js';
import { StructuredExtractorService } from '../services/structured-extractor.service.js';
import { PriorityRankerService } from '../services/priority-ranker.service.js';
import { ExecutiveReportIR } from '../schemas/report-ir.schema.js';

export interface ProcessDocumentResult {
  rankedIR: ExecutiveReportIR;
  parsedDoc: ParsedDocument;
  processingTimeMs: number;
}

/**
 * Use Case: Xử lý và bóc tách toàn diện tài liệu báo cáo hành chính (PDF / Word)
 */
export class ProcessDocumentUseCase {
  private pdfParser: PdfParserService;
  private structuredExtractor: StructuredExtractorService;
  private priorityRanker: PriorityRankerService;

  constructor(
    pdfParser?: PdfParserService,
    structuredExtractor?: StructuredExtractorService,
    priorityRanker?: PriorityRankerService
  ) {
    this.pdfParser = pdfParser || new PdfParserService();
    this.structuredExtractor = structuredExtractor || new StructuredExtractorService();
    this.priorityRanker = priorityRanker || new PriorityRankerService();
  }

  async execute(filePath: string): Promise<ProcessDocumentResult> {
    const startTime = Date.now();

    // Bước 1: Nạp và Phân Tích Cú Pháp Văn Bản (Document Parsing)
    const parsedDoc = await this.pdfParser.parse(filePath);

    // Bước 2: Bóc Tách Cấu Trúc Dữ Liệu Gốc (Deterministic Ground-Truth Extraction)
    const rawIR = await this.structuredExtractor.extract(parsedDoc);

    // Bước 3: Phân Loại & Xếp Hạng Ưu Tiên Quản Trị
    const rankedIR = this.priorityRanker.rankAndSynthesize(rawIR);

    const processingTimeMs = Date.now() - startTime;

    return {
      rankedIR,
      parsedDoc,
      processingTimeMs
    };
  }
}
