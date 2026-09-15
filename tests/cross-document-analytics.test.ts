import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { buildApp } from '../src/server.js';
import { FastifyInstance } from 'fastify';
import { WarehouseStorageService } from '../src/services/warehouse-storage.service.js';
import { CrossDocumentAnalyticsService } from '../src/services/cross-document-analytics.service.js';

describe('Work Package 2, 3 & 4: Relational Warehouse & Cross-Document Longitudinal Analytics', () => {
  let app: FastifyInstance;
  let warehouseDir: string;
  let warehouse: WarehouseStorageService;
  let analytics: CrossDocumentAnalyticsService;

  let reportIdMonth1: string;
  let reportIdMonth2: string;

  beforeAll(async () => {
    // Tạo thư mục test warehouse riêng biệt
    warehouseDir = path.resolve(__dirname, '../data/test_warehouse_analytics');
    if (fs.existsSync(warehouseDir)) {
      fs.rmSync(warehouseDir, { recursive: true, force: true });
    }

    warehouse = new WarehouseStorageService(warehouseDir);
    analytics = new CrossDocumentAnalyticsService(warehouse);

    // Mock Report Tháng 1: UBND Huyện Long Thành
    const reportMonth1 = {
      metadata: {
        document_title: 'Báo cáo tình hình kinh tế - xã hội Tháng 1/2026',
        document_type: 'BAO_CAO',
        document_number: '12/BC-UBND',
        issuing_authority: 'UBND Huyện Long Thành',
        issuance_date: '2026-01-25',
        reporting_period: 'Tháng 1/2026',
        primary_domain: 'Đầu tư công & GPMB',
        domain_tags: ['DAU_TU_CONG', 'GPMB']
      },
      level2_details: {
        metrics: [
          {
            indicator: 'Tỷ lệ giải ngân vốn đầu tư công',
            plan_target: '100%',
            actual: '15.5%',
            percentage: '15.5',
            unit: '%',
            status: 'RED',
            trend: 'GIAM_SUT',
            page_ref: 1,
            quote: 'Giải ngân vốn đầu tư công mới đạt 15.5% kế hoạch'
          },
          {
            indicator: 'Thu ngân sách nhà nước',
            actual: '120 tỷ đồng',
            percentage: '20.0',
            unit: 'tỷ đồng',
            status: 'GREEN',
            trend: 'TANG_TRUONG',
            page_ref: 2,
            quote: 'Thu ngân sách đạt 120 tỷ đồng'
          }
        ],
        tables: [
          {
            table_title: 'Bảng tiến độ các dự án trọng điểm',
            headers: ['STT', 'Tên dự án', 'Tiến độ'],
            rows: [['1', 'Đường cao tốc Biên Hòa - Vũng Tàu', 'Chậm tiến độ']],
            row_count: 1,
            col_count: 3,
            page_ref: 2
          }
        ],
        relationships: [
          {
            problem: 'Vướng mắc bồi thường giải phóng mặt bằng đường cao tốc',
            root_cause: 'Chưa thống nhất đơn giá đền bù đất nông nghiệp',
            consequence: 'Chậm bàn giao mặt bằng thi công',
            urgency: 'HIGH',
            responsible_agency: 'Trung tâm Phát triển quỹ đất'
          }
        ],
        action_items: [
          {
            task_title: 'Hoàn tất phương án bồi thường đất nông nghiệp',
            lead_assignee: 'Phòng TN&MT',
            deadline: '2026-02-15',
            status: 'IN_PROGRESS'
          }
        ]
      }
    };

    // Mock Report Tháng 2: UBND Huyện Long Thành (Đột phá giải ngân và tăng trưởng)
    const reportMonth2 = {
      metadata: {
        document_title: 'Báo cáo tình hình kinh tế - xã hội Tháng 2/2026',
        document_type: 'BAO_CAO',
        document_number: '45/BC-UBND',
        issuing_authority: 'UBND Huyện Long Thành',
        issuance_date: '2026-02-25',
        reporting_period: 'Tháng 2/2026',
        primary_domain: 'Đầu tư công & GPMB',
        domain_tags: ['DAU_TU_CONG', 'GPMB']
      },
      level2_details: {
        metrics: [
          {
            indicator: 'Tỷ lệ giải ngân vốn đầu tư công',
            plan_target: '100%',
            actual: '38.2%',
            percentage: '38.2',
            unit: '%',
            status: 'GREEN',
            trend: 'TANG_TRUONG',
            page_ref: 1,
            quote: 'Giải ngân vốn đầu tư công lũy kế 2 tháng đạt 38.2%'
          },
          {
            indicator: 'Thu ngân sách nhà nước',
            actual: '250 tỷ đồng',
            percentage: '41.6',
            unit: 'tỷ đồng',
            status: 'GREEN',
            trend: 'TANG_TRUONG',
            page_ref: 2,
            quote: 'Thu ngân sách lũy kế đạt 250 tỷ đồng'
          }
        ],
        tables: [
          {
            table_title: 'Bảng tiến độ các dự án trọng điểm',
            headers: ['STT', 'Tên dự án', 'Tiến độ'],
            rows: [['1', 'Đường cao tốc Biên Hòa - Vũng Tàu', 'Đã bàn giao 80% mặt bằng']],
            row_count: 1,
            col_count: 3,
            page_ref: 2
          }
        ],
        relationships: [
          {
            problem: 'Vướng mắc bồi thường giải phóng mặt bằng đường cao tốc',
            root_cause: 'Còn 15 hộ dân chưa nhận tiền đền bù',
            consequence: 'Thi công xôi đỗ một số đoạn',
            urgency: 'HIGH',
            responsible_agency: 'UBND Xã Long An'
          },
          {
            problem: 'Thiếu hụt nguồn vật liệu cát san lấp',
            root_cause: 'Các mỏ cát địa phương chưa nâng công suất khai thác',
            consequence: 'Giá vật liệu tăng cao',
            urgency: 'MEDIUM',
            responsible_agency: 'Sở Xây dựng'
          }
        ],
        action_items: [
          {
            task_title: 'Cưỡng chế thu hồi đất đối với các hộ cố tình chây ì',
            lead_assignee: 'UBND Huyện',
            deadline: '2026-03-10',
            status: 'PENDING'
          }
        ]
      }
    };

    const rec1 = warehouse.saveReport(reportMonth1, 'Văn bản tháng 1');
    const rec2 = warehouse.saveReport(reportMonth2, 'Văn bản tháng 2');

    reportIdMonth1 = rec1.record_id;
    reportIdMonth2 = rec2.record_id;

    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fs.existsSync(warehouseDir)) {
      try {
        fs.rmSync(warehouseDir, { recursive: true, force: true });
      } catch {
        // Bỏ qua nếu đang lock
      }
    }
  });

  it('WP2: lưu trữ đa bảng quan hệ (Relational Persistence) và khử trùng lặp qua SHA-256', () => {
    const reports = warehouse.getAllRelationalReports();
    expect(reports.length).toBe(2);

    const metrics = warehouse.getAllRelationalMetrics();
    expect(metrics.length).toBe(4); // 2 chỉ số * 2 báo cáo

    const bottlenecks = warehouse.getAllRelationalBottlenecks();
    expect(bottlenecks.length).toBe(3); // 1 tháng 1 + 2 tháng 2

    const tasks = warehouse.getAllRelationalTasks();
    expect(tasks.length).toBe(2);

    // Kiểm tra tính toàn vẹn mã băm SHA-256
    const report1 = reports.find(r => r.id === reportIdMonth1);
    expect(report1?.file_hash_sha256).toBeDefined();

    // Thử lưu trùng văn bản -> Hệ thống tự động khử trùng lặp
    const duplicateRec = warehouse.saveReport({ metadata: { document_title: 'Báo cáo trùng' } }, 'Văn bản tháng 1');
    expect(duplicateRec.record_id).toBe(reportIdMonth1);
  });

  it('WP3: tính toán xu hướng chỉ số KPI (Longitudinal Trends) và tốc độ tăng trưởng liên kỳ', () => {
    const trends = analytics.getKpiTrends({
      indicatorName: 'Tỷ lệ giải ngân',
      authority: 'Long Thành'
    });

    expect(trends.length).toBe(1);
    const kpi = trends[0];
    expect(kpi.indicator_name).toContain('Tỷ lệ giải ngân');
    expect(kpi.data_points_count).toBe(2);
    expect(kpi.timeline[0].percentage).toBe('15.5');
    expect(kpi.timeline[1].percentage).toBe('38.2');
    expect(kpi.overall_trajectory).toBe('IMPROVING');
    expect(kpi.growth_rate).toBeGreaterThan(100); // (38.2 - 15.5) / 15.5 = +146.5%
  });

  it('WP3: phân tích bản đồ nhiệt điểm nghẽn hệ thống (Systemic Bottleneck Heatmap)', () => {
    const heatmap = analytics.getSystemicBottleneckHeatmap();
    expect(heatmap.length).toBeGreaterThanOrEqual(1);

    // Điểm nghẽn GPMB xuất hiện nhiều nhất
    const gpmb = heatmap.find(h => h.category === 'GIAI_PHONG_MAT_BANG');
    expect(gpmb).toBeDefined();
    expect(gpmb?.total_occurrences).toBeGreaterThanOrEqual(2);
    expect(gpmb?.high_urgency_count).toBeGreaterThanOrEqual(2);
    expect(gpmb?.affected_authorities).toContain('UBND Huyện Long Thành');
  });

  it('WP3: đối soát so sánh 2 kỳ báo cáo (Period-over-Period Reconciliation)', () => {
    const diff = analytics.comparePeriods(reportIdMonth1, reportIdMonth2);
    expect(diff).not.toBeNull();

    expect(diff?.metric_deltas.length).toBeGreaterThanOrEqual(2);
    const disburseDelta = diff?.metric_deltas.find(m => m.indicator.includes('giải ngân'));
    expect(disburseDelta?.value_a).toBe('15.5%');
    expect(disburseDelta?.value_b).toBe('38.2%');
    expect(disburseDelta?.is_improved).toBe(true);

    // Điểm nghẽn kéo dài và điểm nghẽn mới
    expect(diff?.persistent_bottlenecks.length).toBeGreaterThanOrEqual(1);
    expect(diff?.new_bottlenecks.length).toBeGreaterThanOrEqual(1);
    expect(diff?.task_reconciliation.carried_over_count).toBe(1);
  });

  it('WP4: kiểm chứng các API Điều Hành Lãnh Đạo qua Fastify HTTP', async () => {
    // 1. Executive Summary
    const resSummary = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/executive-summary'
    });
    expect(resSummary.statusCode).toBe(200);
    const jsonSummary = resSummary.json();
    expect(jsonSummary.success).toBe(true);
    expect(jsonSummary.data).toHaveProperty('total_reports_ingested');
    expect(jsonSummary.data).toHaveProperty('total_indicators_tracked');

    // 2. Bottleneck Heatmap
    const resHeatmap = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/bottleneck-heatmap'
    });
    expect(resHeatmap.statusCode).toBe(200);
    const jsonHeatmap = resHeatmap.json();
    expect(jsonHeatmap.success).toBe(true);
    expect(Array.isArray(jsonHeatmap.data)).toBe(true);

    // 3. KPI Trends
    const resTrends = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/kpi-trends?indicator=gi%E1%BA%A3i%20ng%C3%A2n'
    });
    expect(resTrends.statusCode).toBe(200);
    const jsonTrends = resTrends.json();
    expect(jsonTrends.success).toBe(true);
    expect(Array.isArray(jsonTrends.data)).toBe(true);

    // 4. Period Comparison thiếu params -> 400
    const resCompMissing = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/period-comparison'
    });
    expect(resCompMissing.statusCode).toBe(400);
  });
});
