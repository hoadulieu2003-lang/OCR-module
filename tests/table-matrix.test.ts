import { describe, it, expect } from 'vitest';
import { TableMatrixService } from '../src/services/table-matrix.service.js';
import { TableValidatorService } from '../src/services/table-validator.service.js';

describe('Sprint 3 / 4: Complex Table Matrix Engine & TableValidator', () => {
  const tableMatrixService = new TableMatrixService();

  it('should pass audit when table total row mathematically matches sum of parts', () => {
    const validTable = {
      table_id: 'table-budget-01',
      headers: ['Nội dung chi', 'Kế hoạch vốn (tỷ)', 'Đã giải ngân (tỷ)'],
      rows: [
        ['1. Xây lắp', '50.0', '40.0'],
        ['2. Thiết bị', '30.0', '25.0'],
        ['3. GPMB', '20.0', '15.0'],
        ['Tổng cộng', '100.0', '80.0']
      ]
    };

    const report = TableValidatorService.validate(validTable);
    expect(report.status).toBe('AUDIT_PASSED');
    expect(report.findings.length).toBe(0);
  });

  it('should correctly ignore "Trong đó" sub-breakdown rows to avoid double counting', () => {
    const tableWithTrongDo = {
      table_id: 'table-budget-trong-do',
      headers: ['Nguồn vốn', 'Số tiền (tỷ đồng)'],
      rows: [
        ['1. Vốn ngân sách Trung ương', '100'],
        ['Trong đó: Vốn trái phiếu chính phủ', '40'], // Sub-item, không được cộng dồn vào tổng
        ['2. Vốn ngân sách Tỉnh', '50'],
        ['3. Vốn ngân sách Huyện', '30'],
        ['Tổng cộng', '180'] // 100 + 50 + 30 = 180 (Nếu cộng cả 40 sẽ thành 220 sai)
      ]
    };

    const report = TableValidatorService.validate(tableWithTrongDo);
    expect(report.status).toBe('AUDIT_PASSED');
    expect(report.findings.length).toBe(0);
  });

  it('should detect percentage mismatch when actual/plan does not match reported rate', () => {
    const tableWithPercentageError = {
      table_id: 'table-percentage-err',
      headers: ['Chỉ tiêu', 'Kế hoạch (tỷ)', 'Thực hiện (tỷ)', 'Tỷ lệ đạt (%)'],
      rows: [
        ['Thu nội địa', '100', '50', '85%'], // Thực tế 50/100 = 50%, nhưng báo cáo 85%
        ['Thu xuất nhập khẩu', '200', '180', '90%'] // Đúng: 180/200 = 90%
      ]
    };

    const report = TableValidatorService.validate(tableWithPercentageError);
    expect(report.status).toBe('REVIEW_REQUIRED');
    expect(report.findings.some(f => f.type === 'PERCENTAGE_MISMATCH')).toBe(true);
    const pFinding = report.findings.find(f => f.type === 'PERCENTAGE_MISMATCH');
    expect(pFinding?.expectedValue).toBe('50%');
    expect(pFinding?.actualValue).toBe('85%');
  });

  it('should detect unit inconsistency when mixed units exist in the same column', () => {
    const tableWithMixedUnits = {
      table_id: 'table-unit-err',
      headers: ['Hạng mục công trình', 'Dự toán kinh phí'],
      rows: [
        ['Công trình A', '15 tỷ đồng'],
        ['Công trình B', '500 triệu đồng'],
        ['Công trình C', '20 tỷ đồng']
      ]
    };

    const report = TableValidatorService.validate(tableWithMixedUnits);
    expect(report.status).toBe('REVIEW_REQUIRED');
    expect(report.findings.some(f => f.type === 'UNIT_INCONSISTENCY')).toBe(true);
  });

  it('should flag REVIEW_REQUIRED when total row does not match component sums', () => {
    const invalidTable = {
      table_id: 'table-budget-error',
      headers: ['Khoản mục', 'Số tiền (triệu đồng)'],
      rows: [
        ['Khoản A', '100'],
        ['Khoản B', '200'],
        ['Tổng cộng', '500'] // Thực tế 100 + 200 = 300 != 500
      ]
    };

    const report = TableValidatorService.validate(invalidTable);
    expect(report.status).toBe('REVIEW_REQUIRED');
    expect(report.findings.length).toBe(1);
    expect(report.findings[0].type).toBe('SUM_MISMATCH');
    expect(report.findings[0].expectedValue).toBe(300);
    expect(report.findings[0].actualValue).toBe(500);
  });

  it('should process table into markdown and hierarchical header tree', () => {
    const rawTable = {
      table_id: 'tab-p1-1',
      page_ref: 1,
      table_title: 'Kế hoạch ngân sách',
      headers: ['Chỉ tiêu', 'Năm 2025 - Kế hoạch', 'Năm 2025 - Thực hiện'],
      rows: [
        ['Thu NSNN', '1.500', '1.620'],
        ['Chi NSNN', '1.200', '1.180']
      ],
      row_count: 2,
      col_count: 3
    };

    const processed = tableMatrixService.processTable(rawTable);
    expect(processed.markdown_table).toContain('| Chỉ tiêu | Năm 2025 - Kế hoạch | Năm 2025 - Thực hiện |');
    expect(processed.header_tree).toBeDefined();
    expect(processed.header_tree?.['Năm 2025']).toBeDefined();
    expect(processed.header_tree?.['Năm 2025'].length).toBe(2);
  });

  it('should calculate positive column widths for wide multi-column tables without negative widths', async () => {
    const { calculateTableColumnWidths } = await import('../src/services/export/text-cleaner.js');
    const headers = ['THỊ TRƯỜNG', 'VTC', 'M8 VTP 3 IA C', 'MYN', 'NAT', 'STL', 'VTB', 'VTL', 'VTC', 'MOV', 'VTZ'];
    const rows = [['Số lượng DA', '06', '1 05 g n', '04', '03', '03', '03', '03', '02', '01', '01']];
    const widths = calculateTableColumnWidths(headers, rows, 9638);
    expect(widths.length).toBe(11);
    widths.forEach(w => {
      expect(w).toBeGreaterThan(0);
    });
    expect(widths.reduce((a, b) => a + b, 0)).toBe(9638);
  });
});

