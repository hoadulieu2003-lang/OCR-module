import { z } from 'zod';

/**
 * Nguồn gốc xuất xứ của dữ liệu (Fact Provenance) - Chống Hallucination
 */
export const FactProvenanceEnum = z.enum([
  'FACT_FROM_DOCUMENT',     // Trích xuất trực tiếp nguyên văn từ văn bản/bảng gốc
  'CALCULATED_FROM_FACTS',  // Số liệu được hệ thống tự tính toán (vd: % = thực tế / kế hoạch)
  'MODEL_INFERENCE'         // Suy luận ngữ nghĩa có kiểm soát từ AI (có lý do và độ tin cậy)
]);

/**
 * Bản chất của số liệu (Phân biệt rạch ròi Thực tế vs Ước tính vs Kế hoạch)
 */
export const DataNatureEnum = z.enum([
  'THUC_HIEN_THUC_TE', // Đã thực hiện xong trên thực tế
  'UOC_THUC_HIEN',     // Ước thực hiện / ước đạt (chưa phải số chốt cuối cùng)
  'KE_HOACH',          // Chỉ tiêu kế hoạch giao
  'LUY_KE',            // Số liệu cộng dồn lũy kế
  'DU_TOAN'            // Dự toán ngân sách
]);

export const MetricStatusEnum = z.enum(['GREEN', 'YELLOW', 'RED', 'NEUTRAL']);
export const TrendEnum = z.enum(['TANG_TRUONG', 'GIAM_SUT', 'ON_DINH', 'CHUA_XAC_DINH']);
export const SeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'THAP', 'TRUNG_BINH', 'CAO', 'NGHIEM_TRONG']);

/**
 * Độ tin cậy và nguồn gốc tọa độ BBox (Bounding Box Provenance)
 */
export const ProvenanceTypeEnum = z.enum([
  'PHYSICAL',     // Tọa độ bbox vật lý chính xác trích xuất từ OCR block
  'SYNTHETIC',    // Tọa độ suy luận/tính toán từ bảng hoặc dòng lân cận
  'FALLBACK'      // Tọa độ ước lượng mặc định của trang khi không tìm thấy vị trí chính xác
]).default('PHYSICAL');
export type ProvenanceType = z.infer<typeof ProvenanceTypeEnum>;

/**
 * 1. ĐỊNH DANH VĂN BẢN (Document Identity & Multi-label Classification)
 */
export const CoreMetadataSchema = z.object({
  document_title: z.string().describe("Tiêu đề / trích yếu nội dung báo cáo"),
  document_type: z.enum([
    'BAO_CAO',
    'PHIEU_TRINH',
    'TO_TRINH',
    'QUYET_DINH',
    'THONG_BAO_KET_LUAN',
    'BIEN_BAN',
    'CONG_VAN',
    'KHAC'
  ]).describe("Loại hình văn bản"),
  document_number: z.string().nullable().describe("Số và ký hiệu văn bản (.../BC-UBND, .../TTr-UBND)"),
  issuing_authority: z.string().nullable().default("Cơ quan ban hành").describe("Cơ quan/đơn vị ban hành văn bản"),
  receiving_authority: z.string().nullable().describe("Cơ quan/cấp nhận báo cáo chính (Kính gửi / Nơi nhận chính)"),
  recipients: z.array(z.string()).default([]).describe("Danh sách chi tiết nơi nhận (Nơi nhận: - Sở Nội vụ; - CT, PCT; - Lưu VT...)"),
  issuance_date: z.string().nullable().describe("Ngày ban hành (YYYY-MM-DD)"),
  reporting_period: z.string().nullable().default(null).describe("Kỳ báo cáo thực chất (ví dụ: Tháng 4/2024, Quý I/2026, Năm 2025, 2021-2025)"),
  data_timeframe: z.string().nullable().describe("Khoảng thời gian số liệu phản ánh trong tài liệu"),
  primary_domain: z.string().nullable().default("Hành chính tổng hợp").describe("Lĩnh vực chính (ví dụ: Đầu tư công, CCHC, Ngân sách, Tư pháp, Y tế...)"),
  domain_tags: z.array(z.string()).default([]).describe("Multi-label tags: ['DAU_TU_CONG', 'GPMB', 'KIEN_NGHI', 'NGAN_SACH']"),
  is_periodic: z.boolean().default(false).describe("Báo cáo định kỳ (true) hay đột xuất/chuyên đề (false)"),
  has_appendix: z.boolean().default(false).describe("Văn bản có phụ lục/bảng biểu đính kèm hay không"),
  signer: z.object({
    name: z.string().nullable().describe("Họ và tên người ký"),
    title: z.string().nullable().describe("Chức vụ người ký (Chủ tịch, Phó Chủ tịch, Trưởng phòng...)")
  }).default({ name: null, title: null }),
  purpose: z.string().nullable().default(null).describe("Ai báo cáo việc gì, trong kỳ nào, nhằm mục đích gì (1 câu súc tích)")
});

/**
 * 2. CHỈ SỐ KPI & SỐ LIỆU QUẢN TRỊ (Normalized Indicators & Metrics)
 */
export const CoreMetricSchema = z.object({
  id: z.string().optional(),
  indicator: z.string().describe("Tên chỉ tiêu thống kê / khoản mục"),
  unit: z.string().nullable().describe("Đơn vị tính (tỷ đồng, triệu đồng, %, ha, vụ, hồ sơ, lượt...)"),
  plan_target: z.string().nullable().describe("Chỉ tiêu kế hoạch giao"),
  actual: z.string().nullable().describe("Số liệu thực tế đạt được"),
  percentage: z.string().nullable().describe("Tỷ lệ % thực hiện"),
  previous_period: z.string().nullable().describe("Số liệu cùng kỳ năm trước hoặc kỳ trước"),
  change_description: z.string().nullable().describe("Mô tả biến động (+12.5%, giảm 3 vụ...)"),
  data_nature: DataNatureEnum.describe("Bản chất số liệu: THUC_HIEN_THUC_TE, UOC_THUC_HIEN, KE_HOACH..."),
  provenance: FactProvenanceEnum.describe("Nguồn gốc số liệu: trích xuất nguyên văn, tự tính toán hay suy luận"),
  status: MetricStatusEnum.describe("GREEN (đạt/vượt), YELLOW (cận biên), RED (chậm/hụt/tồn đọng), NEUTRAL"),
  trend: TrendEnum.describe("Xu hướng: TANG_TRUONG, GIAM_SUT, ON_DINH"),
  page_ref: z.number().describe("Số trang chứa con số này"),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe("Tọa độ bounding box [x0, y0, x1, y1]"),
  provenance_type: ProvenanceTypeEnum.optional().describe("Nguồn gốc tọa độ BBox: PHYSICAL, SYNTHETIC, FALLBACK"),
  quote: z.string().nullable().describe("Đoạn trích dẫn nguyên văn chứa số liệu"),
  evidence_refs: z.array(z.string()).default([]).describe("Danh sách ID bằng chứng liên kết từ DocumentEvidenceIR"),
  uncertainty_flag: z.boolean().default(false).describe("Cờ đánh dấu nếu OCR mờ hoặc số liệu chưa thống nhất")
});

/**
 * 3. KẾT QUẢ NỔI BẬT ĐÃ HOÀN THÀNH (Achievements & Milestones)
 */
export const CoreAchievementSchema = z.object({
  achievement_title: z.string().describe("Tên kết quả/thành tích hoàn tất có giá trị quản trị"),
  metrics_evidence: z.string().nullable().describe("Con số/tỷ lệ chứng minh thực tế"),
  milestone_impact: z.string().nullable().describe("Tác động/ý nghĩa đối với đơn vị"),
  page_ref: z.number().describe("Số trang trong tài liệu gốc"),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  provenance_type: ProvenanceTypeEnum.optional(),
  evidence_refs: z.array(z.string()).default([])
});

/**
 * 4. CHUỖI QUAN HỆ: VẤN ĐỀ -> NGUYÊN NHÂN -> TRÁCH NHIỆM -> HẠN XỬ LÝ (Relationship Extraction)
 */
export const CoreRelationshipSchema = z.object({
  id: z.string().optional(),
  domain: z.string().describe("Lĩnh vực gặp vướng mắc (GPMB, Thủ tục kho bạc, Nguồn vốn đối ứng...)"),
  issue: z.string().describe("Vấn đề / Điểm nghẽn / Khó khăn tồn tại thực tế"),
  cause: z.string().nullable().describe("Nguyên nhân cốt lõi (Khách quan vs Chủ quan do cán bộ)"),
  impact: z.string().nullable().describe("Hậu quả / Mức độ ảnh hưởng (chậm tiến độ bao lâu, hụt bao nhiêu tiền)"),
  responsible_party: z.string().nullable().describe("Đơn vị / cá nhân chịu trách nhiệm chính (nếu văn bản nêu rõ)"),
  deadline: z.string().nullable().describe("Thời hạn hoàn thành / mốc cam kết"),
  proposed_action: z.string().nullable().describe("Hành động / giải pháp khắc phục đề xuất"),
  severity: SeverityEnum.describe("Mức độ nghiêm trọng: LOW, MEDIUM, HIGH, CRITICAL"),
  page_ref: z.number().describe("Số trang trích xuất"),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  provenance_type: ProvenanceTypeEnum.optional(),
  evidence_refs: z.array(z.string()).default([])
});

/**
 * 5. NHIỆM VỤ TIẾP THEO (Next Action Items)
 */
export const CoreActionItemSchema = z.object({
  action_title: z.string().describe("Tên nhiệm vụ cần triển khai kỳ tới"),
  owner_department: z.string().nullable().describe("Đơn vị chủ trì"),
  coordinating_departments: z.array(z.string()).default([]).describe("Đơn vị phối hợp"),
  deadline: z.string().nullable().describe("Hạn hoàn thành"),
  expected_output: z.string().nullable().describe("Sản phẩm đầu ra (Báo cáo, Kế hoạch, Quyết định...)"),
  priority: z.enum(['HIGH', 'MEDIUM', 'NORMAL']).default('NORMAL'),
  page_ref: z.number(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  provenance_type: ProvenanceTypeEnum.optional(),
  evidence_refs: z.array(z.string()).default([])
});

/**
 * 6. KIẾN NGHỊ / ĐỀ XUẤT CỦA CẤP DƯỚI LÊN CẤP TRÊN (Recommendations & Requests)
 */
export const CoreRecommendationSchema = z.object({
  requester: z.string().describe("Đơn vị đưa ra kiến nghị"),
  request_content: z.string().describe("Nội dung kiến nghị tháo gỡ (xin chủ trương, bổ sung vốn, hướng dẫn cơ chế...)"),
  requested_authority: z.string().describe("Cấp thẩm quyền được kiến nghị (UBND Huyện/Tỉnh, Sở ngành...)"),
  reason: z.string().nullable().describe("Lý do kiến nghị"),
  resource_amount: z.string().nullable().describe("Số tiền / nguồn lực xin cấp (nếu có)"),
  related_project: z.string().nullable().describe("Dự án / công trình liên quan"),
  page_ref: z.number().describe("Số trang tài liệu gốc"),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  provenance_type: ProvenanceTypeEnum.optional(),
  evidence_refs: z.array(z.string()).default([])
});

/**
 * 7. NỘI DUNG CẦN LÃNH ĐẠO RA QUYẾT ĐỊNH / CHỈ ĐẠO (Decision Needed Layer)
 */
export const CoreDecisionNeededSchema = z.object({
  is_required: z.boolean().describe("Văn bản có yêu cầu Lãnh đạo ra quyết định hay chỉ để báo cáo biết"),
  decision_summary: z.string().nullable().describe("Câu ngắn: 'Nội dung cần lãnh đạo xem xét / chỉ đạo: ...'"),
  action_verb: z.enum([
    'XEM_XET_CHO_CHU_TRUONG',
    'PHE_DUYET_KE_HOACH',
    'BO_TRI_VON_KINH_PHI',
    'CHI_DAO_GIAI_QUYET_VUONG_MAC',
    'KY_BAN_HANH_VAN_BAN',
    'PHAN_CONG_DON_VI',
    'BAO_CAO_DE_BIET'
  ]).default('BAO_CAO_DE_BIET'),
  deadline: z.string().nullable().describe("Thời hạn cần quyết định"),
  page_ref: z.number().nullable(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  provenance_type: ProvenanceTypeEnum.optional(),
  evidence_refs: z.array(z.string()).default([])
});

/**
 * 8. GOM CỤM CÁC TRƯỜNG HỢP SỐ 0 / KHÔNG PHÁT SINH (Zero Cases Grouping)
 */
export const CoreZeroCasesSchema = z.object({
  has_zero_occurrences: z.boolean().default(false),
  grouped_statement: z.string().nullable().describe("Ví dụ: 'Trong kỳ không phát sinh đơn thư khiếu nại, tố cáo và vi phạm an ninh trật tự.'"),
  domains_covered: z.array(z.string()).default([])
});

/**
 * 9. CẤU TRÚC BẢNG BIỂU SỐ HÓA (Table & Grid Representation)
 */
export const CoreTableSchema = z.object({
  table_id: z.string().default(() => `tbl-${Date.now()}`),
  table_title: z.string().nullable().default(null),
  headers: z.array(z.string()).default([]),
  rows: z.array(z.array(z.string())).default([]),
  row_count: z.number().default(0),
  col_count: z.number().default(0),
  page_ref: z.number().default(1),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  provenance_type: ProvenanceTypeEnum.optional(),
  evidence_refs: z.array(z.string()).default([])
});

/**
 * 10. DOMAIN-SPECIFIC EXTENSIONS (Mở rộng theo ngữ cảnh chuyên ngành)
 */
export const DomainExtensionsSchema = z.object({
  // Extension: Đầu tư công
  public_investment: z.object({
    capital_plan_total: z.string().nullable(),
    allocated_capital: z.string().nullable(),
    disbursed_capital: z.string().nullable(),
    disbursement_rate: z.string().nullable(),
    central_gov_capital: z.string().nullable(),
    provincial_capital: z.string().nullable(),
    district_capital: z.string().nullable(),
    next_phase_demand: z.string().nullable()
  }).optional(),

  // Extension: Giải phóng mặt bằng (GPMB)
  gpmb: z.object({
    total_scope_ha: z.string().nullable(),
    affected_households: z.string().nullable(),
    approved_households: z.string().nullable(),
    paid_households: z.string().nullable(),
    remaining_households: z.string().nullable(),
    land_handover_rate: z.string().nullable(),
    resettlement_status: z.string().nullable()
  }).optional(),

  // Extension: Sự cố / Thiên tai
  incident_disaster: z.object({
    incident_type: z.string().nullable(),
    occurred_at: z.string().nullable(),
    affected_location: z.string().nullable(),
    casualties: z.string().nullable(),
    property_damage: z.string().nullable(),
    evacuation_count: z.string().nullable(),
    remaining_danger: z.string().nullable(),
    urgent_requests: z.array(z.string()).default([])
  }).optional(),

  // Extension: Phiếu trình / Tờ trình
  submission_note: z.object({
    matter_submitted: z.string().nullable(),
    submitting_unit: z.string().nullable(),
    legal_basis: z.string().nullable(),
    proposal_summary: z.string().nullable(),
    urgency: z.enum(['HOA_TOC', 'KHAN', 'THUONG']).default('THUONG')
  }).optional()
}).default({});

/**
 * 11. THẺ ĐIỀU HÀNH ƯU TIÊN (Level 1 Executive Priority Card)
 */
export const ExecutivePriorityCardSchema = z.object({
  card_id: z.string(),
  priority_rank: z.number().min(1).max(11).describe("Thứ tự ưu tiên quản trị từ 1 (cao nhất) đến 11"),
  priority_level: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'INFO']),
  badge_color: z.enum(['RED', 'AMBER', 'GREEN', 'BLUE']),
  title: z.string().describe("Tiêu đề thẻ điều hành"),
  highlight_fact: z.string().describe("Fact cốt lõi, có số liệu"),
  supporting_context: z.string().nullable(),
  source_page_ref: z.number(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  provenance_type: ProvenanceTypeEnum.optional(),
  evidence_refs: z.array(z.string()).default([])
});

/**
 * TOÀN BỘ SCHEMA TRUNG GIAN (Unified Intermediate Representation - IR V3)
 */
export const ExecutiveReportIRSchema = z.object({
  // Metadata & Identity
  metadata: CoreMetadataSchema,

  // Level 1: 30-giây nắm báo cáo (Tạo từ Facts được xếp hạng)
  level1_executive_brief: z.object({
    overall_status: z.enum(['BINH_THUONG', 'CAN_LUU_Y', 'CANH_BAO_KHAN']),
    headline: z.string().describe("1 câu thông điệp quản trị cốt lõi nhất"),
    decision_needed: CoreDecisionNeededSchema,
    priority_cards: z.array(ExecutivePriorityCardSchema).default([]),
    zero_cases_summary: CoreZeroCasesSchema.optional()
  }),

  // Level 2: Chi tiết Drill-down & Bảng số liệu
  level2_details: z.object({
    metrics: z.array(CoreMetricSchema),
    achievements: z.array(CoreAchievementSchema),
    relationships: z.array(CoreRelationshipSchema),
    actions_next_period: z.array(CoreActionItemSchema),
    recommendations: z.array(CoreRecommendationSchema),
    tables: z.array(CoreTableSchema).default([])
  }),

  // Domain-specific extensions
  extensions: DomainExtensionsSchema.optional()
});

export type FactProvenance = z.infer<typeof FactProvenanceEnum>;
export type DataNature = z.infer<typeof DataNatureEnum>;
export type CoreMetadata = z.infer<typeof CoreMetadataSchema>;
export type CoreMetric = z.infer<typeof CoreMetricSchema>;
export type CoreAchievement = z.infer<typeof CoreAchievementSchema>;
export type CoreRelationship = z.infer<typeof CoreRelationshipSchema>;
export type CoreActionItem = z.infer<typeof CoreActionItemSchema>;
export type CoreRecommendation = z.infer<typeof CoreRecommendationSchema>;
export type CoreDecisionNeeded = z.infer<typeof CoreDecisionNeededSchema>;
export type CoreZeroCases = z.infer<typeof CoreZeroCasesSchema>;
export type CoreTable = z.infer<typeof CoreTableSchema>;
export type ExecutivePriorityCard = z.infer<typeof ExecutivePriorityCardSchema>;
export type ExecutiveReportIR = z.infer<typeof ExecutiveReportIRSchema>;

/**
 * =========================================================================
 * LEGACY COMPATIBILITY SCHEMAS (Đã hợp nhất từ report-extraction.schema.ts)
 * =========================================================================
 */
export const LegacyReportMetadataSchema = z.object({
  document_number: z.string(),
  issuing_authority: z.string(),
  issuance_date: z.string(),
  report_title: z.string(),
  report_category: z.enum([
    'KTXH_TONG_HOP',
    'TAI_CHINH_DAU_TU',
    'CCHC_TCD_PCTN',
    'CHUYEN_NGANH',
    'KHAC'
  ]),
  report_period: z.string(),
  signer_name: z.string().optional(),
  signer_title: z.string().optional(),
});

export const LegacyExecutiveBriefSchema = z.object({
  overall_rating: z.enum(['DAT_XUAT_SAC', 'HOAN_THANH_TOT', 'CAN_LUU_Y', 'CANH_BAO_DO']),
  headline: z.string(),
  key_achievements: z.array(z.string()).min(2).max(5),
  critical_warnings: z.array(z.string()).max(4),
});

export const LegacyIndicatorMetricSchema = z.object({
  indicator_name: z.string(),
  unit: z.string().optional(),
  actual_value: z.string(),
  target_value: z.string().optional(),
  previous_period_value: z.string().optional(),
  trend: z.enum(['TANG_TRUONG', 'GIAM_SUT', 'ON_DINH', 'CHUA_XAC_DINH']),
  status: z.enum(['GREEN', 'YELLOW', 'RED']),
  page_ref: z.number(),
  quote: z.string().optional(),
});

export const LegacyExtractedTableSchema = z.object({
  table_title: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  page_ref: z.number(),
});

export const LegacyBottleneckAnalysisSchema = z.object({
  domain: z.string(),
  issue: z.string(),
  root_cause: z.string(),
  impact_severity: z.enum(['THAP', 'TRUNG_BINH', 'CAO', 'NGHIEM_TRONG']),
  page_ref: z.number(),
});

export const LegacyUnitRecommendationSchema = z.object({
  content: z.string(),
  recipient_level: z.string(),
  page_ref: z.number(),
});

export const ExecutiveReportDataSchema = z.object({
  metadata: LegacyReportMetadataSchema,
  executive_brief: LegacyExecutiveBriefSchema,
  indicators: z.array(LegacyIndicatorMetricSchema),
  tables: z.array(LegacyExtractedTableSchema).optional().default([]),
  bottlenecks: z.array(LegacyBottleneckAnalysisSchema),
  recommendations: z.array(LegacyUnitRecommendationSchema),
});

export type ReportMetadata = z.infer<typeof LegacyReportMetadataSchema>;
export type ExecutiveBrief = z.infer<typeof LegacyExecutiveBriefSchema>;
export type IndicatorMetric = z.infer<typeof LegacyIndicatorMetricSchema>;
export type ExtractedTable = z.infer<typeof LegacyExtractedTableSchema>;
export type BottleneckAnalysis = z.infer<typeof LegacyBottleneckAnalysisSchema>;
export type UnitRecommendation = z.infer<typeof LegacyUnitRecommendationSchema>;
export type ExecutiveReportData = z.infer<typeof ExecutiveReportDataSchema>;

