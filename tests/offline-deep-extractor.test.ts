import { describe, it, expect } from 'vitest';
import { StructuredExtractorService } from '../src/services/structured-extractor.service.js';
import { WarehouseStorageService } from '../src/services/warehouse-storage.service.js';
import { ParsedDocument } from '../src/services/pdf-parser.service.js';
import path from 'path';
import fs from 'fs';

describe('Offline Deep Extractor & Security & Warehouse Tests', () => {
  const extractor = new StructuredExtractorService();

  it('1. Narrative Metric Extractor: Should extract complex narrative sentences without colons', async () => {
    const mockDoc: ParsedDocument = {
      filePath: 'test.pdf',
      fileName: 'test.pdf',
      totalPages: 1,
      totalChars: 500,
      isScanned: false,
      pages: [
        {
          pageNumber: 1,
          charCount: 500,
          hasImages: false,
          blocks: [
            {
              bbox: [50, 100, 500, 150],
              text: 'Tổng thu ngân sách nhà nước trên địa bàn ước đạt 5.200 tỷ đồng, bằng 102% dự toán năm.',
              type: 0
            },
            {
              bbox: [50, 160, 500, 200],
              text: 'Giải ngân vốn đầu tư công đạt 850,5 tỷ đồng, đạt 76,4% kế hoạch giao.',
              type: 0
            },
            {
              bbox: [50, 210, 500, 260],
              text: 'Khó khăn vướng mắc lớn do công tác bồi thường giải phóng mặt bằng còn chậm, dẫn đến tiến độ thi công bị kéo dài.',
              type: 0
            }
          ],
          tables: [],
          text: `BÁO CÁO KẾT QUẢ CÔNG TÁC
I. BỐI CẢNH
Tổng quan tình hình.
II. KẾT QUẢ
Tổng thu ngân sách nhà nước trên địa bàn ước đạt 5.200 tỷ đồng, bằng 102% dự toán năm.
Giải ngân vốn đầu tư công đạt 850,5 tỷ đồng, đạt 76,4% kế hoạch giao.
Khó khăn vướng mắc lớn do công tác bồi thường giải phóng mặt bằng còn chậm, dẫn đến tiến độ thi công bị kéo dài.`
        }
      ],
      tables: []
    };

    const ir = await extractor.extract(mockDoc);

    // 1. Kiểm tra bóc tách chỉ số văn xuôi
    expect(ir.level2_details.metrics.length).toBeGreaterThanOrEqual(2);
    const budgetMetric = ir.level2_details.metrics.find(m => m.indicator.toLowerCase().includes('thu ngân sách'));
    expect(budgetMetric).toBeDefined();
    expect(budgetMetric?.actual).toBe('5.200');
    expect(budgetMetric?.unit).toBe('tỷ đồng');
    expect(budgetMetric?.data_nature).toBe('UOC_THUC_HIEN');

    const investMetric = ir.level2_details.metrics.find(m => m.indicator.toLowerCase().includes('đầu tư công'));
    expect(investMetric).toBeDefined();
    expect(investMetric?.actual).toBe('850,5');

    // 2. Kiểm tra chuỗi nhân quả của điểm nghẽn
    expect(ir.level2_details.relationships.length).toBeGreaterThanOrEqual(1);
    const rel = ir.level2_details.relationships[0];
    expect(rel.cause.toLowerCase()).toContain('công tác bồi thường');
    expect(rel.impact.toLowerCase()).toContain('tiến độ thi công');
  });

  it('2. Table Matrix Metric Extractor: Should extract metrics directly from table summary rows', async () => {
    const mockDocWithTable: ParsedDocument = {
      filePath: 'table_test.pdf',
      fileName: 'table_test.pdf',
      totalPages: 1,
      totalChars: 300,
      isScanned: false,
      pages: [
        {
          pageNumber: 1,
          charCount: 300,
          hasImages: false,
          blocks: [
            {
              bbox: [50, 50, 500, 100],
              text: 'BÁO CÁO GIẢI NGÂN',
              type: 1
            }
          ],
          tables: [],
          text: 'BÁO CÁO GIẢI NGÂN VỐN ĐẦU TƯ CÔNG'
        }
      ],
      tables: [
        {
          table_id: 'tbl-1',
          table_title: 'Kế hoạch và giải ngân vốn đầu tư công',
          page_ref: 1,
          headers: ['Nội dung', 'Kế hoạch giao', 'Ước thực hiện', 'Tỷ lệ %'],
          rows: [
            ['1. Vốn ngân sách trung ương', '500', '450', '90%'],
            ['2. Vốn ngân sách địa phương', '700', '630', '90%'],
            ['Tổng số vốn đầu tư công', '1.200', '1.080', '90%']
          ],
          row_count: 3,
          col_count: 4,
          bbox: [50, 120, 540, 300],
          evidence_refs: ['p1_tbl1']
        }
      ]
    };

    const ir = await extractor.extract(mockDocWithTable);
    const tableMetric = ir.level2_details.metrics.find(m => m.indicator.toLowerCase().includes('tổng số'));
    expect(tableMetric).toBeDefined();
    expect(tableMetric?.plan_target).toBe('1.200');
    expect(tableMetric?.actual).toBe('1.080');
    expect(tableMetric?.percentage).toBe('90%');
  });

  it('3. Fuzzy Coordinate Anchoring: Should map coordinates accurately despite whitespace differences', () => {
    const pages = [
      {
        pageNumber: 1,
        charCount: 200,
        hasImages: false,
        blocks: [
          {
            bbox: [60, 120, 530, 180] as [number, number, number, number],
            text: 'Tổng số hồ sơ tiếp nhận trong kỳ là 1.450 hồ sơ trực tuyến.',
            block_id: 'p1_b2'
          }
        ],
        tables: [],
        text: 'Tổng số hồ sơ tiếp nhận trong kỳ là 1.450 hồ sơ trực tuyến.'
      }
    ];

    // Truyền câu có ngắt dòng hoặc khoảng trắng khác biệt
    const ptr = extractor.findEvidencePointer(pages as any, 'Tổng số hồ   sơ tiếp nhận   trong kỳ');
    expect(ptr.pageRef).toBe(1);
    expect(ptr.provenanceType).toBe('PHYSICAL');
    expect(ptr.evidenceRef).toBe('p1_b2');
    expect(ptr.bbox).toEqual([60, 120, 530, 180]);
  });

  it('4. Warehouse Persistence: Should store and query indexed records correctly', () => {
    const testWarehouseDir = path.resolve(__dirname, '../scratch/test-warehouse');
    if (fs.existsSync(testWarehouseDir)) {
      fs.rmSync(testWarehouseDir, { recursive: true, force: true });
    }

    const warehouse = new WarehouseStorageService(testWarehouseDir);
    const record = warehouse.saveReport({
      metadata: {
        document_title: 'Báo cáo kiểm thử Warehouse',
        issuing_authority: 'UBND Tỉnh',
        primary_domain: 'Kinh tế - Xã hội',
        domain_tags: ['KTXH']
      },
      level2_details: {
        metrics: [{ id: 'm1' }],
        tables: []
      }
    });

    expect(record.record_id).toBeDefined();
    expect(record.status).toBe('SYNCED_TO_EXECUTIVE_WAREHOUSE');

    const list = warehouse.listReports({ domain: 'Kinh tế' });
    expect(list.total).toBe(1);
    expect(list.records[0].document_title).toBe('Báo cáo kiểm thử Warehouse');

    const detail = warehouse.getReportById(record.record_id);
    expect(detail).toBeDefined();
    expect(detail.record_id).toBe(record.record_id);

    // Clean up
    fs.rmSync(testWarehouseDir, { recursive: true, force: true });
  });
});
