import { WarehouseStorageService, RelationalMetricRecord, RelationalBottleneckRecord } from './warehouse-storage.service.js';

export interface KpiTimelinePoint {
  report_id: string;
  reporting_period: string | null;
  issuance_date: string | null;
  actual_value: string | null;
  plan_target: string | null;
  percentage: string | null;
  status: string;
  trend: string;
}

export interface KpiTrendGroup {
  indicator_name: string;
  issuing_authority: string;
  data_points_count: number;
  timeline: KpiTimelinePoint[];
  growth_rate: number | null;
  overall_trajectory: 'IMPROVING' | 'DECLINING' | 'STABLE';
}

export interface BottleneckHeatmapCategory {
  category: string;
  category_name_vi: string;
  total_occurrences: number;
  high_urgency_count: number;
  affected_authorities: string[];
  common_root_causes: string[];
}

export interface PeriodComparisonResult {
  report_a: { id: string; title: string; date: string | null; authority: string };
  report_b: { id: string; title: string; date: string | null; authority: string };
  metric_deltas: {
    indicator: string;
    value_a: string | null;
    value_b: string | null;
    percentage_a: string | null;
    percentage_b: string | null;
    status_a: string;
    status_b: string;
    is_improved: boolean;
  }[];
  persistent_bottlenecks: string[];
  new_bottlenecks: string[];
  task_reconciliation: {
    carried_over_count: number;
    pending_tasks: string[];
  };
}

export interface ExecutiveSummaryResponse {
  total_reports_ingested: number;
  total_indicators_tracked: number;
  active_bottlenecks_count: number;
  authorities_active_count: number;
  red_alert_metrics: RelationalMetricRecord[];
  critical_bottlenecks: RelationalBottleneckRecord[];
  top_problematic_categories: { category: string; count: number }[];
}

/**
 * Service Động Cơ Phân Tích Dữ Liệu Xuyên Báo Cáo & Đối Soát Đa Kỳ (Cross-Document Longitudinal Analytics Engine)
 * Phục vụ trực tiếp Dashboard Điều Hành Cấp Cao của Lãnh Đạo
 */
export class CrossDocumentAnalyticsService {
  private warehouse: WarehouseStorageService;

  constructor(customWarehouse?: WarehouseStorageService) {
    this.warehouse = customWarehouse || new WarehouseStorageService();
  }

  /**
   * 1. Phân tích Xu Hướng Chỉ Số KPI Theo Chu Kỳ Thời Gian (Longitudinal KPI Trends)
   */
  getKpiTrends(filter: { indicatorName?: string; authority?: string } = {}): KpiTrendGroup[] {
    const allMetrics = this.warehouse.getAllRelationalMetrics();
    
    // Gom nhóm theo [indicator_name + issuing_authority]
    const groupsMap = new Map<string, KpiTrendGroup>();

    for (const m of allMetrics) {
      if (filter.indicatorName && !m.indicator_name.toLowerCase().includes(filter.indicatorName.toLowerCase())) {
        continue;
      }
      if (filter.authority && !m.issuing_authority.toLowerCase().includes(filter.authority.toLowerCase())) {
        continue;
      }

      const key = `${m.indicator_name.trim().toLowerCase()}__${m.issuing_authority.trim().toLowerCase()}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          indicator_name: m.indicator_name,
          issuing_authority: m.issuing_authority,
          data_points_count: 0,
          timeline: [],
          growth_rate: null,
          overall_trajectory: 'STABLE'
        });
      }

      const group = groupsMap.get(key)!;
      group.timeline.push({
        report_id: m.report_id,
        reporting_period: m.reporting_period,
        issuance_date: m.issuance_date,
        actual_value: m.actual_value,
        plan_target: m.plan_target,
        percentage: m.percentage,
        status: m.status,
        trend: m.trend
      });
    }

    // Tính toán xu hướng tăng trưởng cho từng nhóm
    const results: KpiTrendGroup[] = [];
    for (const group of groupsMap.values()) {
      // Sắp xếp timeline theo ngày ban hành
      group.timeline.sort((a, b) => {
        const da = a.issuance_date || a.reporting_period || '';
        const db = b.issuance_date || b.reporting_period || '';
        return da.localeCompare(db);
      });
      group.data_points_count = group.timeline.length;

      if (group.timeline.length >= 2) {
        const first = group.timeline[0];
        const last = group.timeline[group.timeline.length - 1];

        const pFirst = first.percentage ? parseFloat(first.percentage) : (first.actual_value ? parseFloat(first.actual_value) : NaN);
        const pLast = last.percentage ? parseFloat(last.percentage) : (last.actual_value ? parseFloat(last.actual_value) : NaN);

        if (!isNaN(pFirst) && !isNaN(pLast) && pFirst !== 0) {
          group.growth_rate = Math.round(((pLast - pFirst) / pFirst) * 1000) / 10;
          if (group.growth_rate > 2) {
            group.overall_trajectory = 'IMPROVING';
          } else if (group.growth_rate < -2) {
            group.overall_trajectory = 'DECLINING';
          } else {
            group.overall_trajectory = 'STABLE';
          }
        }
      }

      results.push(group);
    }

    return results;
  }

  /**
   * 2. Bản Đồ Nhiệt Điểm Nghẽn Hệ Thống (Systemic Bottleneck Heatmap)
   */
  getSystemicBottleneckHeatmap(): BottleneckHeatmapCategory[] {
    const allBottlenecks = this.warehouse.getAllRelationalBottlenecks();
    const categoryLabels: Record<string, string> = {
      GIAI_PHONG_MAT_BANG: 'Giải phóng mặt bằng & Tái định cư',
      VON_DAU_TU: 'Phân bổ vốn & Giải ngân',
      THU_TUC_PHAP_LY: 'Thủ tục pháp lý, Thẩm định & Quy hoạch',
      NHAN_SU: 'Nhân sự & Biên chế chuyên môn',
      THI_CONG_VAT_LIEU: 'Vật liệu xây dựng & Tiến độ nhà thầu',
      KHAC: 'Khó khăn vướng mắc khác'
    };

    const catMap = new Map<string, {
      total: number;
      highUrgency: number;
      authorities: Set<string>;
      causes: Set<string>;
    }>();

    for (const b of allBottlenecks) {
      const cat = b.category || 'KHAC';
      if (!catMap.has(cat)) {
        catMap.set(cat, {
          total: 0,
          highUrgency: 0,
          authorities: new Set(),
          causes: new Set()
        });
      }
      const data = catMap.get(cat)!;
      data.total++;
      if (b.urgency === 'HIGH' || b.urgency === 'CRITICAL') {
        data.highUrgency++;
      }
      if (b.issuing_authority) {
        data.authorities.add(b.issuing_authority);
      }
      if (b.root_cause) {
        data.causes.add(b.root_cause);
      } else if (b.problem) {
        data.causes.add(b.problem);
      }
    }

    const heatmap: BottleneckHeatmapCategory[] = [];
    for (const [cat, data] of catMap.entries()) {
      heatmap.push({
        category: cat,
        category_name_vi: categoryLabels[cat] || cat,
        total_occurrences: data.total,
        high_urgency_count: data.highUrgency,
        affected_authorities: Array.from(data.authorities),
        common_root_causes: Array.from(data.causes).slice(0, 5)
      });
    }

    // Sắp xếp giảm dần theo số lượng điểm nghẽn
    return heatmap.sort((a, b) => b.total_occurrences - a.total_occurrences);
  }

  /**
   * 3. So Sánh Đối Đầu 2 Báo Cáo (Period-over-Period Reconciliation)
   */
  comparePeriods(reportIdA: string, reportIdB: string): PeriodComparisonResult | null {
    const rawA = this.warehouse.getReportById(reportIdA);
    const rawB = this.warehouse.getReportById(reportIdB);

    if (!rawA || !rawB) return null;

    const metaA = rawA.metadata || {};
    const metaB = rawB.metadata || {};

    const metricsA: any[] = (rawA.report_data?.level2_details?.metrics || []);
    const metricsB: any[] = (rawB.report_data?.level2_details?.metrics || []);

    const metricDeltas: PeriodComparisonResult['metric_deltas'] = [];
    for (const ma of metricsA) {
      const mb = metricsB.find((b: any) => 
        b.indicator.toLowerCase().trim() === ma.indicator.toLowerCase().trim() ||
        b.indicator.toLowerCase().includes(ma.indicator.toLowerCase()) ||
        ma.indicator.toLowerCase().includes(b.indicator.toLowerCase())
      );

      const valA = ma.actual;
      const valB = mb ? mb.actual : null;
      const pctA = ma.percentage;
      const pctB = mb ? mb.percentage : null;

      const numA = pctA ? parseFloat(pctA) : (valA ? parseFloat(valA) : NaN);
      const numB = pctB ? parseFloat(pctB) : (valB ? parseFloat(valB) : NaN);

      const isImproved = !isNaN(numA) && !isNaN(numB) ? numB >= numA : (mb?.status === 'GREEN' && ma.status !== 'GREEN');

      metricDeltas.push({
        indicator: ma.indicator,
        value_a: valA,
        value_b: valB,
        percentage_a: pctA,
        percentage_b: pctB,
        status_a: ma.status || 'NEUTRAL',
        status_b: mb ? mb.status : 'NOT_REPORTED',
        is_improved: isImproved
      });
    }

    // So sánh điểm nghẽn
    const bA: any[] = rawA.report_data?.level2_details?.relationships || [];
    const bB: any[] = rawB.report_data?.level2_details?.relationships || [];

    const persistentBottlenecks: string[] = [];
    const newBottlenecks: string[] = [];

    for (const itemB of bB) {
      const textB = (itemB.problem || itemB.cause_description || '').toLowerCase();
      const existsInA = bA.some((itemA: any) => {
        const textA = (itemA.problem || itemA.cause_description || '').toLowerCase();
        return textA.includes(textB.substring(0, Math.min(15, textB.length))) || textB.includes(textA.substring(0, Math.min(15, textA.length)));
      });

      if (existsInA) {
        persistentBottlenecks.push(itemB.problem || itemB.cause_description || 'Điểm nghẽn kéo dài');
      } else {
        newBottlenecks.push(itemB.problem || itemB.cause_description || 'Điểm nghẽn phát sinh mới');
      }
    }

    // So sánh nhiệm vụ (tasks)
    const tasksA: any[] = rawA.report_data?.level2_details?.action_items || [];
    const pendingTasks = tasksA
      .filter((t: any) => t.status !== 'COMPLETED')
      .map((t: any) => t.task_title || t.action || 'Nhiệm vụ tồn đọng');

    return {
      report_a: {
        id: reportIdA,
        title: metaA.document_title || 'Báo cáo Kỳ 1',
        date: metaA.issuance_date || null,
        authority: metaA.issuing_authority || 'Cơ quan A'
      },
      report_b: {
        id: reportIdB,
        title: metaB.document_title || 'Báo cáo Kỳ 2',
        date: metaB.issuance_date || null,
        authority: metaB.issuing_authority || 'Cơ quan B'
      },
      metric_deltas: metricDeltas,
      persistent_bottlenecks: persistentBottlenecks,
      new_bottlenecks: newBottlenecks,
      task_reconciliation: {
        carried_over_count: pendingTasks.length,
        pending_tasks: pendingTasks
      }
    };
  }

  /**
   * 4. Thẻ Tổng Quan Điều Hành Cho Màn Hình Chào Lãnh Đạo (Executive Summary KPI Cards)
   */
  getExecutiveSummary(): ExecutiveSummaryResponse {
    const reports = this.warehouse.getAllRelationalReports();
    const metrics = this.warehouse.getAllRelationalMetrics();
    const bottlenecks = this.warehouse.getAllRelationalBottlenecks();

    const authorities = new Set(reports.map(r => r.issuing_authority));
    const redMetrics = metrics.filter(m => m.status === 'RED');
    const criticalBottlenecks = bottlenecks.filter(b => b.urgency === 'HIGH' || b.urgency === 'CRITICAL');

    // Gom nhóm danh mục điểm nghẽn
    const catCounts = new Map<string, number>();
    for (const b of bottlenecks) {
      catCounts.set(b.category, (catCounts.get(b.category) || 0) + 1);
    }
    const topCategories = Array.from(catCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total_reports_ingested: reports.length,
      total_indicators_tracked: metrics.length,
      active_bottlenecks_count: bottlenecks.length,
      authorities_active_count: authorities.size,
      red_alert_metrics: redMetrics,
      critical_bottlenecks: criticalBottlenecks,
      top_problematic_categories: topCategories
    };
  }
}
