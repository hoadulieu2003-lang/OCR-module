import { z } from 'zod';

/**
 * Tọa độ hộp bao Bounding Box chuẩn hóa [x0, y0, x1, y1]
 * x0: Tọa độ trái (left)
 * y0: Tọa độ trên (top)
 * x1: Tọa độ phải (right)
 * y1: Tọa độ dưới (bottom)
 */
export const BoundingBoxSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number()
]);

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/**
 * Tọa độ Đa giác Polygon dành cho văn bản nghiêng/xoay hoặc watermark
 */
export const PolygonSchema = z.array(z.tuple([z.number(), z.number()]));
export type Polygon = z.infer<typeof PolygonSchema>;

/**
 * Cấp độ chi tiết của từ (Word-level Span)
 */
export const WordSpanSchema = z.object({
  word_id: z.string(),
  text: z.string(),
  bbox: BoundingBoxSchema,
  confidence: z.number().min(0).max(1).default(1.0)
});

export type WordSpan = z.infer<typeof WordSpanSchema>;

/**
 * Phân loại khối Layout vật lý (Layout Block Type)
 */
export const BlockTypeEnum = z.enum([
  'PARAGRAPH',
  'HEADING_1',
  'HEADING_2',
  'HEADING_3',
  'TABLE',
  'CHART',
  'WATERMARK',
  'HEADER',
  'FOOTER',
  'SIGNATURE',
  'SEAL',
  'LIST_ITEM',
  'CAPTION',
  'UNKNOWN'
]);

export type BlockType = z.infer<typeof BlockTypeEnum>;

/**
 * Bằng chứng Khối Văn Bản Vật Lý (Evidence Block)
 */
export const EvidenceBlockSchema = z.object({
  block_id: z.string(),
  page_number: z.number().int().min(1),
  block_type: BlockTypeEnum,
  bbox: BoundingBoxSchema,
  polygon: PolygonSchema.optional(),
  text: z.string(),
  reading_order_index: z.number().int().default(0),
  confidence: z.number().min(0).max(1).default(1.0),
  is_watermark: z.boolean().default(false),
  words: z.array(WordSpanSchema).optional(),
  table_ref: z.string().optional()
});

export type EvidenceBlock = z.infer<typeof EvidenceBlockSchema>;

/**
 * Cấu trúc Ô Bảng Bằng Chứng (Evidence Table Cell)
 */
export const EvidenceTableCellSchema = z.object({
  cell_id: z.string(),
  row_index: z.number().int().min(0),
  col_index: z.number().int().min(0),
  row_span: z.number().int().min(1).default(1),
  col_span: z.number().int().min(1).default(1),
  raw_text: z.string(),
  normalized_value: z.union([z.number(), z.string(), z.null()]).optional(),
  unit: z.string().nullable().optional(),
  bbox: BoundingBoxSchema.optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  header_hierarchy_path: z.array(z.string()).optional()
});

export type EvidenceTableCell = z.infer<typeof EvidenceTableCellSchema>;

/**
 * Cấu trúc Bảng Bằng Chứng Vật Lý (Evidence Table)
 */
export const EvidenceTableSchema = z.object({
  table_id: z.string(),
  page_number: z.number().int().min(1),
  bbox: BoundingBoxSchema.optional(),
  title: z.string().nullable().optional(),
  row_count: z.number().int().min(1),
  col_count: z.number().int().min(1),
  headers: z.array(z.string()),
  header_tree: z.record(z.any()).optional(),
  cells: z.array(EvidenceTableCellSchema),
  confidence: z.number().min(0).max(1).default(1.0)
});

export type EvidenceTable = z.infer<typeof EvidenceTableSchema>;

/**
 * Trang Bằng Chứng (Evidence Page)
 */
export const EvidencePageSchema = z.object({
  page_number: z.number().int().min(1),
  width: z.number().default(595),
  height: z.number().default(842),
  rotation: z.number().default(0),
  is_scanned: z.boolean().default(false),
  ocr_applied: z.boolean().optional(),
  has_watermark: z.boolean().default(false),
  char_count: z.number().int().default(0),
  blocks: z.array(EvidenceBlockSchema),
  tables: z.array(EvidenceTableSchema),
  quality_metrics: z.object({
    blur_score: z.number().optional(),
    skew_angle_deg: z.number().optional(),
    ocr_confidence: z.number().optional()
  }).optional()
});

export type EvidencePage = z.infer<typeof EvidencePageSchema>;

/**
 * THAM CHIẾU BẰNG CHỨNG (Evidence Reference Pointer)
 * Invariant Bắt Buộc: Mọi Executive Fact phải có ít nhất 1 EvidenceRef
 */
export const EvidenceRefSchema = z.object({
  evidence_id: z.string(),
  document_id: z.string(),
  page_number: z.number().int().min(1),
  block_id: z.string().optional(),
  table_id: z.string().optional(),
  cell_id: z.string().optional(),
  bbox: BoundingBoxSchema,
  raw_quote: z.string(),
  confidence: z.number().min(0).max(1).default(1.0)
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

/**
 * SCHEMAS TẦNG 1: DOCUMENT EVIDENCE IR
 * Đại diện cho toàn bộ sự thật vật lý được nhìn thấy trên tài liệu
 */
export const DocumentEvidenceIRSchema = z.object({
  document_id: z.string(),
  file_name: z.string(),
  file_hash_sha256: z.string().optional(),
  mime_type: z.string().default('application/pdf'),
  total_pages: z.number().int().min(1),
  total_chars: z.number().int().default(0),
  is_scanned: z.boolean().optional(),
  ocr_applied: z.boolean().optional(),
  pipeline_version: z.string().default('3.0.0-evidence-v1'),
  pages: z.array(EvidencePageSchema),
  all_tables: z.array(EvidenceTableSchema),
  watermarks_detected: z.array(z.object({
    pattern_text: z.string(),
    angle_deg: z.number(),
    occurrences_count: z.number(),
    pages_affected: z.array(z.number())
  })).optional(),
  extracted_at: z.string()
});

export type DocumentEvidenceIR = z.infer<typeof DocumentEvidenceIRSchema>;
