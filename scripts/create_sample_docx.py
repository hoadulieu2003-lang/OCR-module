import zipfile
import os

def create_sample_docx(output_path):
    # Minimal valid docx structure
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''

    rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

    document_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        <w:p><w:r><w:t>ỦY BAN NHÂN DÂN XÃ ĐỊNH CƯƠNG</w:t></w:r></w:p>
        <w:p><w:r><w:t>Số: 45/BC-UBND - Định Cương, ngày 10 tháng 8 năm 2026</w:t></w:r></w:p>
        <w:p><w:r><w:t>BÁO CÁO</w:t></w:r></w:p>
        <w:p><w:r><w:t>Tình hình thực hiện công tác Cải cách hành chính và Chuyển đổi số 6 tháng đầu năm 2026</w:t></w:r></w:p>
        <w:p><w:r><w:t>I. KẾT QUẢ CÔNG TÁC ĐẠT ĐƯỢC</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Tiếp nhận và giải quyết hồ sơ TTHC: 1.450 hồ sơ (tỷ lệ đúng hạn đạt 99.2%)</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Đăng ký khai sinh: 185 trường hợp</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Chứng thực chữ ký: 320 trường hợp</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Chứng thực bản sao từ bản chính: 5.600 bản</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Kinh phí đầu tư trang thiết bị CNTT: 250 triệu đồng</w:t></w:r></w:p>
        <w:p><w:r><w:t>II. KHÓ KHĂN, VƯỚNG MẮC</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Đường truyền mạng chuyên dùng tại bộ phận Một cửa thỉnh thoảng bị gián đoạn, ảnh hưởng tốc độ tiếp nhận hồ sơ trực tuyến.</w:t></w:r></w:p>
        <w:p><w:r><w:t>III. ĐỀ XUẤT, KIẾN NGHỊ</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Đề nghị Sở Thông tin và Truyền thông nâng cấp băng thông đường truyền mạng cáp quang cho UBND xã.</w:t></w:r></w:p>
        <w:p><w:r><w:t>- Đề nghị hỗ trợ bổ sung 02 máy scan tốc độ cao phục vụ công tác số hóa hồ sơ.</w:t></w:r></w:p>
    </w:body>
</w:document>'''

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', rels)
        zf.writestr('word/document.xml', document_xml)

    print(f"Sample DOCX created at: {output_path}")

if __name__ == '__main__':
    create_sample_docx('uploads/sample_report_cchc.docx')
