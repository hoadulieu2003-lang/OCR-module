import {
  ExecutiveReportData,
  IndicatorMetric,
  BottleneckAnalysis,
  UnitRecommendation
} from '../schemas/report-ir.schema.js';
import { ParsedDocument } from './pdf-parser.service.js';
import { StructuredExtractorService } from './structured-extractor.service.js';

export class ReportExtractorService {
  private structuredExtractor: StructuredExtractorService;

  constructor() {
    this.structuredExtractor = new StructuredExtractorService();
  }

  async extractReport(document: ParsedDocument): Promise<ExecutiveReportData> {
    const ir = await this.structuredExtractor.extract(document);

    const indicators: IndicatorMetric[] = (ir.level2_details?.metrics || []).map(m => ({
      indicator_name: m.indicator,
      target_value: m.plan_target || undefined,
      actual_value: m.actual || '',
      previous_period_value: m.previous_period || undefined,
      unit: m.unit || undefined,
      trend: m.trend || 'ON_DINH',
      status: m.status === 'RED' ? 'RED' : (m.status === 'YELLOW' ? 'YELLOW' : 'GREEN'),
      page_ref: m.page_ref || 1,
      quote: m.quote || undefined
    }));

    const bottlenecks: BottleneckAnalysis[] = (ir.level2_details?.relationships || []).map(r => ({
      domain: r.domain || 'Hành chính',
      issue: r.issue,
      root_cause: r.cause || 'Khó khăn trong quá trình triển khai',
      impact_severity: r.severity === 'CRITICAL' || r.severity === 'NGHIEM_TRONG' ? 'NGHIEM_TRONG' : (r.severity === 'HIGH' || r.severity === 'CAO' ? 'CAO' : 'TRUNG_BINH'),
      page_ref: r.page_ref || 1
    }));

    const recommendations: UnitRecommendation[] = (ir.level2_details?.recommendations || []).map(rec => ({
      content: rec.request_content,
      recipient_level: rec.requested_authority,
      page_ref: rec.page_ref || 1
    }));

    const data: ExecutiveReportData = {
      metadata: {
        report_title: ir.metadata.document_title || 'Báo cáo tổng hợp',
        issuing_authority: ir.metadata.issuing_authority || 'UBND',
        issuance_date: ir.metadata.issuance_date || new Date().toISOString().split('T')[0],
        report_category: 'KTXH_TONG_HOP',
        report_period: ir.metadata.reporting_period || 'Kỳ báo cáo',
        document_number: ir.metadata.document_number || 'Chưa ghi số',
        signer_name: ir.metadata.signer?.name || undefined,
        signer_title: ir.metadata.signer?.title || undefined
      },
      executive_brief: {
        overall_rating: bottlenecks.some(b => b.impact_severity === 'NGHIEM_TRONG') ? 'CANH_BAO_DO' : 'HOAN_THANH_TOT',
        headline: ir.level1_executive_brief?.headline || 'Báo cáo tổng hợp tình hình thực hiện nhiệm vụ',
        key_achievements: ir.level2_details?.achievements?.map(a => a.achievement_title).slice(0, 3) || ['Hoàn thành các nhiệm vụ trọng tâm'],
        critical_warnings: bottlenecks.map(b => b.issue).slice(0, 3)
      },
      indicators,
      tables: (ir.level2_details?.tables || []).map(t => ({
        table_title: t.table_title || 'Bảng số liệu',
        headers: t.headers,
        rows: t.rows,
        page_ref: t.page_ref || 1
      })),
      bottlenecks,
      recommendations
    };

    return data;
  }
}
