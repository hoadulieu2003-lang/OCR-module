import {
  ExecutiveReportIR,
  ExecutivePriorityCard,
  CoreDecisionNeeded,
  CoreZeroCases,
  CoreMetric,
  CoreRelationship,
  CoreAchievement,
  CoreRecommendation
} from '../schemas/report-ir.schema.js';

export class PriorityRankerService {
  /**
   * Tính toán và chuẩn hóa toàn bộ Level 1 Executive Brief dựa trên Fact Ranking & Zero Grouping
   */
  rankAndSynthesize(ir: ExecutiveReportIR): ExecutiveReportIR {
    const rawCards: ExecutivePriorityCard[] = [];
    let cardCounter = 1;

    // 1. Nhóm 1 (Rank 1): Nội dung cần Lãnh đạo ra quyết định / phê duyệt
    const decision = ir.level1_executive_brief?.decision_needed;
    if (decision && decision.is_required && decision.decision_summary) {
      rawCards.push({
        card_id: `card-rank-${cardCounter++}`,
        priority_rank: 1,
        priority_level: 'CRITICAL',
        badge_color: 'RED',
        title: 'Nội Dung Cần Lãnh Đạo Quyết Định',
        highlight_fact: decision.decision_summary,
        supporting_context: decision.deadline ? `Thời hạn yêu cầu: ${decision.deadline}` : 'Cần xem xét chỉ đạo sớm',
        source_page_ref: decision.page_ref || 1,
        bbox: decision.bbox,
        evidence_refs: decision.evidence_refs || []
      });
    }

    // 2. Nhóm 2 (Rank 2): Rủi ro an toàn, thiên tai, sự cố khẩn cấp
    const incidentExt = ir.extensions?.incident_disaster;
    if (incidentExt && incidentExt.incident_type) {
      rawCards.push({
        card_id: `card-rank-${cardCounter++}`,
        priority_rank: 2,
        priority_level: 'CRITICAL',
        badge_color: 'RED',
        title: `Sự Cố Khẩn Cấp: ${incidentExt.incident_type}`,
        highlight_fact: incidentExt.property_damage || incidentExt.casualties || 'Cần ứng phó khẩn cấp',
        supporting_context: incidentExt.affected_location ? `Địa bàn: ${incidentExt.affected_location}` : null,
        source_page_ref: 1,
        evidence_refs: []
      });
    }

    // 3. Nhóm 3-5 (Rank 3-5): Điểm nghẽn, khó khăn, vướng mắc thực tế
    const relationships = ir.level2_details?.relationships || [];
    for (const rel of relationships) {
      let rank = 5;
      let level: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'MEDIUM';
      let color: 'RED' | 'AMBER' = 'AMBER';

      const sev = (rel.severity || '').toUpperCase();
      if (sev === 'CRITICAL' || sev === 'NGHIEM_TRONG') {
        rank = 3;
        level = 'CRITICAL';
        color = 'RED';
      } else if (sev === 'HIGH' || sev === 'CAO') {
        rank = 4;
        level = 'HIGH';
        color = 'RED';
      }

      rawCards.push({
        card_id: `card-rank-${cardCounter++}`,
        priority_rank: rank,
        priority_level: level,
        badge_color: color,
        title: `Điểm Nghẽn: ${rel.domain}`,
        highlight_fact: rel.issue,
        supporting_context: rel.cause ? `Nguyên nhân: ${rel.cause}` : null,
        source_page_ref: rel.page_ref,
        bbox: rel.bbox,
        evidence_refs: rel.evidence_refs || []
      });
    }

    // 4. Nhóm 6-8 (Rank 6-8): Kiến nghị của đơn vị xin cấp trên
    const recommendations = ir.level2_details?.recommendations || [];
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      if (decision && decision.is_required && decision.decision_summary) {
        const decLower = decision.decision_summary.toLowerCase();
        const recSnippet = rec.request_content.substring(0, 30).toLowerCase();
        if (decLower.includes(recSnippet) || rec.request_content.toLowerCase().includes(decLower.substring(0, 30))) {
          continue;
        }
      }

      rawCards.push({
        card_id: `card-rank-${cardCounter++}`,
        priority_rank: 7,
        priority_level: 'MEDIUM',
        badge_color: 'AMBER',
        title: `Kiến Nghị: ${rec.requester}`,
        highlight_fact: rec.request_content,
        supporting_context: rec.resource_amount ? `Nguồn lực đề xuất: ${rec.resource_amount}` : null,
        source_page_ref: rec.page_ref,
        bbox: rec.bbox,
        evidence_refs: rec.evidence_refs || []
      });
    }

    // 5. Nhóm 9 (Rank 9): Thành tích & Chỉ tiêu KPI quan trọng
    const metrics = ir.level2_details?.metrics || [];
    for (const metric of metrics) {
      if (metric.actual === '0' || metric.actual === '0 lượt' || metric.actual === '0 vụ') {
        continue;
      }

      rawCards.push({
        card_id: `card-rank-${cardCounter++}`,
        priority_rank: 9,
        priority_level: 'INFO',
        badge_color: metric.status === 'RED' ? 'RED' : (metric.status === 'YELLOW' ? 'AMBER' : 'GREEN'),
        title: metric.indicator,
        highlight_fact: `${metric.actual || 'Đạt chỉ tiêu'} (${metric.data_nature === 'UOC_THUC_HIEN' ? 'Ước thực hiện' : 'Thực tế'})`,
        supporting_context: metric.quote || null,
        source_page_ref: metric.page_ref,
        bbox: metric.bbox,
        evidence_refs: metric.evidence_refs || []
      });
    }

    // 6. Nhóm 10 (Rank 10): Thành tích tiêu biểu
    const achievements = ir.level2_details?.achievements || [];
    for (const ach of achievements) {
      rawCards.push({
        card_id: `card-rank-${cardCounter++}`,
        priority_rank: 10,
        priority_level: 'INFO',
        badge_color: 'GREEN',
        title: `Kết Quả Đạt Được`,
        highlight_fact: ach.achievement_title,
        supporting_context: ach.milestone_impact || ach.metrics_evidence || null,
        source_page_ref: ach.page_ref,
        bbox: ach.bbox,
        evidence_refs: ach.evidence_refs || []
      });
    }

    // 7. Sắp xếp thẻ theo Thứ tự ưu tiên & Cắt gọn (2 đến 8 thẻ tốt nhất)
    rawCards.sort((a, b) => a.priority_rank - b.priority_rank);

    let priorityCards: ExecutivePriorityCard[] = rawCards.slice(0, 8);
    if (priorityCards.length < 2) {
      const fallbackCards: ExecutivePriorityCard[] = [
        {
          card_id: `card-rank-fallback-1`,
          priority_rank: 9,
          priority_level: 'INFO',
          badge_color: 'BLUE',
          title: 'Tổng Hợp Chỉ Số',
          highlight_fact: `${metrics.length} chỉ tiêu đã được số hóa và chuẩn hóa`,
          supporting_context: 'Số liệu phục vụ điều hành',
          source_page_ref: 1,
          evidence_refs: []
        },
        {
          card_id: `card-rank-fallback-2`,
          priority_rank: 11,
          priority_level: 'INFO',
          badge_color: 'BLUE',
          title: 'Nhiệm Vụ Triển Khai',
          highlight_fact: `${ir.level2_details?.actions_next_period?.length || 0} nhiệm vụ tiếp theo`,
          supporting_context: 'Theo dõi tiến độ kỳ tới',
          source_page_ref: 1,
          evidence_refs: []
        }
      ];
      priorityCards = [...priorityCards, ...fallbackCards].slice(0, 2);
    }

    // 8. Gom cụm các trường hợp số 0 (Zero Cases Grouping)
    const zeroMetrics = metrics.filter(m =>
      m.actual === '0' || m.actual === '0 vụ' || m.actual === '0 lượt' || m.actual === '0 trường hợp'
    );

    let zeroSummary: CoreZeroCases | undefined;
    if (zeroMetrics.length > 0) {
      const zeroDomains = Array.from(new Set(zeroMetrics.map(m => m.indicator)));
      zeroSummary = {
        has_zero_occurrences: true,
        grouped_statement: `Trong kỳ không phát sinh các sự việc thuộc lĩnh vực: ${zeroDomains.slice(0, 4).join(', ')}.`,
        domains_covered: zeroDomains
      };
    }

    // 9. Xác định Đèn Tín Hiệu Điều Hành Toàn Cảnh
    let overallStatus: 'BINH_THUONG' | 'CAN_LUU_Y' | 'CANH_BAO_KHAN' = 'BINH_THUONG';
    const hasEmergencyIncident = Boolean(ir.extensions?.incident_disaster?.incident_type);
    const hasCriticalDisruption = relationships.some(r => {
      const s = (r.severity || '').toUpperCase();
      return s === 'CRITICAL' || s === 'NGHIEM_TRONG';
    });

    if (hasEmergencyIncident || hasCriticalDisruption) {
      overallStatus = 'CANH_BAO_KHAN';
    } else if (decision && decision.is_required) {
      overallStatus = 'CAN_LUU_Y';
    } else if (relationships.some(r => r.severity === 'HIGH' || r.severity === 'CAO')) {
      overallStatus = 'CAN_LUU_Y';
    }

    return {
      ...ir,
      level1_executive_brief: {
        ...ir.level1_executive_brief,
        overall_status: overallStatus,
        priority_cards: priorityCards,
        zero_cases_summary: zeroSummary
      }
    };
  }
}
