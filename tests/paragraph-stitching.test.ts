import { describe, it, expect } from 'vitest';
import { AdministrativeDocumentFormatterService } from '../src/services/administrative-document-formatter.service.js';
import { DocxRendererService } from '../src/services/export/docx-renderer.service.js';
import { ExecutiveReportIR } from '../src/schemas/report-ir.schema.js';

describe('Intelligent Paragraph & Heading Re-Stitching Engine (NĐ 30/2020/NĐ-CP)', () => {
  it('should stitch wrapped headings (I. ... PHONG + TRÀO) into a single HEADING_1', () => {
    const rawText = `
ỦY BAN NHÂN DÂN
XÃ MINH LONG
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
Số: 34/BC-UBND
Minh Long, ngày 15 tháng 12 năm 2025

BÁO CÁO
Về việc kết quả phong trào văn hóa năm 2025

I. TÌNH HÌNH CHUNG VỀ VIỆC TRIỂN KHAI THỰC HIỆN PHONG
TRÀO
1. Đặc điểm tình hình
Nội dung báo cáo chi tiết.
`;

    const doc = AdministrativeDocumentFormatterService.parseDocumentStructure(rawText);
    const heading1 = doc.bodyElements.find(e => e.type === 'HEADING_1');
    expect(heading1).toBeDefined();
    expect(heading1?.text).toBe('I. TÌNH HÌNH CHUNG VỀ VIỆC TRIỂN KHAI THỰC HIỆN PHONG TRÀO');
  });

  it('should stitch wrapped sentences within a paragraph into continuous flow text', () => {
    const rawText = `
ỦY BAN NHÂN DÂN
XÃ MINH LONG
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
Số: 34/BC-UBND

BÁO CÁO
Tình hình kinh tế xã hội

1. Đặc điểm tình hình
Xã Minh Long được thành lập trên cơ sở sáp nhập toàn bộ diện tích tự nhiên
và quy mô dân số của các xã Long Hiệp, Thanh An và Long Môn cũ. Có diện tích
tự nhiên 124,739 ha, có 16 thôn, 2.686 hộ với quy mô dân số 9.964 người, người
đồng bào dân tộc thiểu số chiếm khoảng 70%, tỷ lệ hộ nghèo chiếm 10,15%, hộ cận
nghèo chiếm 2,9% cuối năm 2024.
Xã Minh Long đang nỗ lực phát triển kinh tế - xã hội, chú trọng xây dựng
khối đoàn kết giữa chính quyền và Nhân dân, thực hiện dân chủ ở cơ sở. Chú trọng
tập trung đầu tư xây dựng các công trình giao thông nông thôn (đường ngõ, xóm),
đặc biệt là các tuyến đường theo cơ chế tỉnh hỗ trợ xi măng, nhằm tạo điều kiện đi
lại, giao thông thuận lợi hơn.
`;

    const doc = AdministrativeDocumentFormatterService.parseDocumentStructure(rawText);
    const paragraphs = doc.bodyElements.filter(e => e.type === 'PARAGRAPH');

    // Should produce exactly 2 distinct continuous paragraphs under section 1
    expect(paragraphs.length).toBe(2);

    // Paragraph 1 should be fully stitched without "cận" on its own line
    expect(paragraphs[0].text).toContain('tỷ lệ hộ nghèo chiếm 10,15%, hộ cận nghèo chiếm 2,9% cuối năm 2024.');
    expect(paragraphs[0].text).toContain('Long Hiệp, Thanh An và Long Môn cũ. Có diện tích tự nhiên 124,739 ha');

    // Paragraph 2 should be fully stitched without "trọng" on its own line
    expect(paragraphs[1].text).toContain('dân chủ ở cơ sở. Chú trọng tập trung đầu tư');
    expect(paragraphs[1].text).toContain('nhằm tạo điều kiện đi lại, giao thông thuận lợi hơn.');
  });

  it('should stitch multi-line document subject (Trích yếu) right below Title', () => {
    const rawText = `
ỦY BAN NHÂN DÂN
XÃ MINH LONG
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
Số: 34/BC-UBND
Minh Long, ngày 15 tháng 12 năm 2025

BÁO CÁO
Kết quả hoạt động Phong trào “Toàn dân đoàn kết xây dựng đời sống văn
hóa” năm 2025 và phương hướng, nhiệm vụ năm 2026 trên địa bàn xã

Thực hiện Công văn số 2208/SVHTTDL-QLVH ngày 19/11/2025 của Sở Văn hóa.
`;

    const doc = AdministrativeDocumentFormatterService.parseDocumentStructure(rawText);
    expect(doc.title).toBe('BÁO CÁO');
    expect(doc.subject).toBe('Kết quả hoạt động Phong trào “Toàn dân đoàn kết xây dựng đời sống văn hóa” năm 2025 và phương hướng, nhiệm vụ năm 2026 trên địa bàn xã');
  });

  it('should stitch multi-line list items correctly', () => {
    const rawText = `
BÁO CÁO
- Tuyên truyền thông qua các hội nghị, các cuộc họp triển khai bình xét các tiêu
chuẩn văn hóa, ngày đại đoàn kết toàn dân được tổ chức tại 16 thôn trên địa bàn xã, đã
góp phần xây dựng môi trường văn hóa lành mạnh;
- Tăng cường công tác thanh tra, kiểm tra việc chấp hành kỷ cương
kỷ luật hành chính.
`;

    const doc = AdministrativeDocumentFormatterService.parseDocumentStructure(rawText);
    const listItems = doc.bodyElements.filter(e => e.type === 'LIST_ITEM');
    expect(listItems.length).toBe(2);
    expect(listItems[0].text).toContain('bình xét các tiêu chuẩn văn hóa, ngày đại đoàn kết toàn dân được tổ chức tại 16 thôn');
    expect(listItems[1].text).toContain('chấp hành kỷ cương kỷ luật hành chính.');
  });

  it('should not break paragraph on administrative abbreviations like TP. or đ/c.', () => {
    const rawText = `
BÁO CÁO
Triển khai kế hoạch công tác tại địa bàn các phường thuộc TP.
Hồ Chí Minh trong giai đoạn 2025 - 2026 theo chỉ đạo của đ/c.
Bí thư Thành ủy.
`;

    const doc = AdministrativeDocumentFormatterService.parseDocumentStructure(rawText);
    const paragraphs = doc.bodyElements.filter(e => e.type === 'PARAGRAPH');
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].text).toContain('thuộc TP. Hồ Chí Minh trong giai đoạn 2025 - 2026 theo chỉ đạo của đ/c. Bí thư Thành ủy.');
  });

  it('should export valid Word DOCX buffer with stitched paragraphs', async () => {
    const renderer = new DocxRendererService();
    const mockIR: ExecutiveReportIR = {
      metadata: {
        document_title: 'BÁO CÁO KẾT QUẢ CÔNG TÁC',
        issuing_authority: 'ỦY BAN NHÂN DÂN XÃ MINH LONG',
        document_number: 'Số: 34/BC-UBND',
        date: 'Ngày 15 tháng 12 năm 2025'
      },
      level1_executive_brief: { headline: 'Tình hình kinh tế xã hội phát triển ổn định.' },
      level2_details: { metrics: [], tables: [] }
    };

    const rawFullText = `
ỦY BAN NHÂN DÂN
XÃ MINH LONG
CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
Số: 34/BC-UBND
Minh Long, ngày 15 tháng 12 năm 2025

BÁO CÁO
Về việc kết quả phong trào văn hóa năm 2025

I. TÌNH HÌNH CHUNG VỀ VIỆC TRIỂN KHAI THỰC HIỆN PHONG
TRÀO
1. Đặc điểm tình hình
Xã Minh Long có diện tích tự nhiên 124,739 ha, có 16 thôn, 2.686 hộ với quy mô dân số 9.964 người, hộ cận
nghèo chiếm 2,9% cuối năm 2024.
`;

    const buffer = await renderer.render(mockIR, rawFullText);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);
  });
});