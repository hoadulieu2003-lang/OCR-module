# ĐẶC TẢ NGHIỆP VỤ & BỐI CẢNH GỐC
## Module AI/OCR Bóc Tách Báo Cáo Hành Chính Phục Vụ Điều Hành Lãnh Đạo (KGLVS)

### 1. Bối cảnh và Mục tiêu Sản phẩm
- **Đối tượng sử dụng:** Lãnh đạo (Chủ tịch/PCT/Trưởng ngành), Cán bộ chuyên môn, Chuyên viên tổng hợp.
- **Mục tiêu cốt lõi:** Biến Báo cáo Hành chính thành **Bản Thông Tin Phục Vụ Điều Hành và Ra Quyết Định** (30 giây nắm trọn tình hình $\rightarrow$ Điểm nghẽn $\rightarrow$ Nguyên nhân $\rightarrow$ Trách nhiệm $\rightarrow$ Hạn xử lý $\rightarrow$ Quyết định cần đưa ra).

### 2. Triết lý 5 Lớp Kiến Trúc
1. **Lớp 1 (Ingestion & Parsing):** PyMuPDF / OCR đọc text, bảng biểu (grid), headings, tọa độ bounding box.
2. **Lớp 2 (Classification):** Định danh văn bản và phân loại đa nhãn (Multi-label Tags: KTXH, Đầu tư công, GPMB, Ngân sách, CCHC, Sự cố...).
3. **Lớp 3 (Structured Extraction):** Trích xuất Fact Provenance (Fact/Estimate/Calculated), Bảng biểu, Chuỗi quan hệ (`Issue -> Cause -> Impact -> Responsible -> Deadline`).
4. **Lớp 4 (Intelligence & Priority Ranking):** Deterministic Ranking theo 11 mức ưu tiên điều hành, Gom cụm số 0, Phát hiện Anomaly và `Decision Needed`.
5. **Lớp 5 (Presentation & Grounding):** Level 1 (30s Brief), Level 2 (Drill-down chi tiết), Đối chiếu nguồn 100%.

### 3. Bộ 10 Tiêu Chí Kiểm Thử Nghiệm Thu (Acceptance Test Cases)
- TEST 1: Báo cáo CCHC (Tổng nhiệm vụ, hoàn thành %, trễ hạn, hạn chế).
- TEST 2: Báo cáo Ngân sách (Thu/chi lệch lớn, nguyên nhân).
- TEST 3: Báo cáo Giải ngân nhiều đơn vị (Bảng xếp hạng Top/Bottom, 0%, tăng trưởng).
- TEST 4: Báo cáo GPMB (Diện tích, số hộ, vướng mắc, tái định cư).
- TEST 5: Theo dõi nhiệm vụ (Phân biệt đúng hạn / trễ / quá hạn / trong hạn).
- TEST 6: Báo cáo Sự cố / Thiên tai (Ưu tiên mức độ khẩn cấp, thiệt hại, cứu hộ).
- TEST 7: Báo cáo Không phát sinh (Gom thành 1 câu, không sinh cảnh báo giả).
- TEST 8: Phiếu trình (Đơn vị trình, đề xuất cốt lõi, nội dung cần quyết định).
- TEST 9: Tài liệu có "Ước thực hiện" (Phân biệt UOC_THUC_HIEN vs DA_THUC_HIEN).
- TEST 10: Tài liệu có số liệu mâu thuẫn (Gắn cờ DATA_CONFLICT).
