# KGLVS Executive Report OCR & Ground-Truth Extraction Engine

> **Trạm Nạp, Bóc Tách Xác Định & Xuất Chuẩn Dữ Liệu Gốc Báo Cáo Điều Hành (<50ms, Zero Hallucination)**  
> Phân hệ Microservice độc lập phục vụ Lãnh đạo cấp cao (Chủ tịch, Ban Giám đốc, Hội đồng Quản trị) và Cán bộ chuyên môn trong **Không Gian Làm Việc Số (KGLVS)**.

---

## 🌟 1. Điểm Đột Phá Dành Cho Lãnh Đạo & Nghiệp Vụ

1. **Động Cơ Trích Xuất Dữ Liệu Gốc Xác Định (<50ms, Zero Hallucination)**:
   - Thay thế việc đọc 50–100 trang văn bản bằng khả năng bóc tách tự động 100% dữ liệu gốc: đoạn văn, ma trận bảng biểu đa trang (`multi-page table stitcher`), chỉ số KPI định lượng, và siêu dữ liệu hành chính.
   - Cơ chế xác định hoàn toàn (Deterministic Ground-Truth), không suy diễn sai lệch số liệu.
2. **Tuân Thủ Thể Thức Nghị Định 30/2020/NĐ-CP & Xuất Bản Đa Định Dạng**:
   - Trình duyệt văn bản hành chính hai màn hình (Dual-View Workspace) hiển thị chuẩn mực thể thức NĐ 30: Quốc hiệu, Tiêu ngữ, Tên cơ quan, Số ký hiệu, Trích yếu, Nội dung và Khối chữ ký.
   - Hỗ trợ xuất dữ liệu gốc đa định dạng:
     - **Word (.docx)**: Chuẩn hóa OpenXML DXA Grid `[9026 DXA]`, tương thích 100% Google Docs và Microsoft Word.
     - **PDF (.pdf)**: Đa trang vector sắc nét chuẩn phong cách báo cáo hành chính.
     - **CSV (.csv)**: Xuất toàn bộ hoặc từng bảng số liệu phục vụ phân tích bảng tính.
     - **JSON IR (.json)**: Cây dữ liệu trung gian chuẩn hóa cho các hệ thống phần mềm khác.
3. **Bảo Chứng Dẫn Chứng Gốc 100% — Click-to-Highlight (`#facc15`)**:
   - Click vào bất kỳ dòng chỉ số KPI hoặc thẻ điểm nghẽn $\rightarrow$ Màn hình văn bản bên phải lập tức nhảy đến đúng trang, tự động **Tô Vàng Hổ Phách (`#facc15`)** đoạn văn chứng cứ và cuộn mượt vào tầm mắt để đối soát tức thì.
4. **Kho Lưu Trữ Báo Cáo & Phân Tích Liên Văn Bản (Warehouse & Cross-Doc Analytics)**:
   - Tích hợp kho dữ liệu tập trung lưu trữ toàn bộ văn bản đã bóc tách.
   - Cung cấp các API phân tích chuỗi xu hướng KPI, bản đồ nhiệt điểm nghẽn, so sánh kỳ điều hành.
5. **Bảo Mật Sandbox & Xác Thực API Key**:
   - Bảo vệ Sandbox chống tấn công duyệt thư mục (Path Traversal), chỉ cho phép nạp tài liệu từ các thư mục hợp lệ.
   - Hỗ trợ xác thực khóa API (`ENFORCE_API_KEY=true`) qua header `x-api-key` hoặc `Authorization: Bearer`.

---

## 🏗️ 2. Kiến Trúc Kỹ Thuật & Công Nghệ Cốt Lõi

* **Runtime:** Node.js 20 LTS + TypeScript (Fastify v4 Enterprise Framework).
* **Multi-Format Parser:** Python PyMuPDF Grid Extractor + Word Mammoth OpenXML AST Parser.
* **Pipeline Trích Xuất Dữ Liệu Gốc:**
  - *Giai đoạn 1 (Ingestion & Layout Parsing):* Tách trang, nhận diện ma trận bảng biểu, trích xuất tọa độ BBox.
  - *Giai đoạn 2 (Ontology & Document Classification):* Phân loại lĩnh vực hành chính theo Nghị định 30.
  - *Giai đoạn 3 (Structured Extraction):* Bóc tách chỉ số KPI, điểm nghẽn & nguyên nhân, nhiệm vụ và đề xuất kiến nghị.
  - *Giai đoạn 4 (Priority Ranking & Normalization):* Phân cấp mức độ ưu tiên, chuẩn hóa số liệu và trích dẫn gốc.
  - *Giai đoạn 5 (Warehouse Storage & Multi-Format Exporter):* Đồng bộ kho dữ liệu và xuất Word/PDF/CSV/JSON.
* **Giao diện API RESTful:** 19 Endpoints + Swagger OpenAPI 3.0 tại `http://localhost:3001/docs`.
* **Kiểm thử Doanh nghiệp:** 18/18 Test Suites (62 tests) đạt 100% GREEN.

---

## 📂 3. Cấu Trúc Thư Mục Chuẩn Doanh Nghiệp

```text
kglvs-report-ocr-engine/
├── 🚀 start_server.bat                    # Script 1-Click: Tự chạy server và mở trình duyệt
├── 🐳 Dockerfile & docker-compose.yml     # Đóng gói container microservice với volume warehouse
├── 📑 BAO_CAO_BAN_GIAO_KGLVS.md           # Báo cáo nghiệm thu bàn giao chính thức
├── 📘 docs/
│   ├── ARCHITECTURE_HANDOVER_BLUEPRINT.md # Bản thiết kế kiến trúc & Luận điểm công nghệ
│   ├── API_INTEGRATION_GUIDE.md           # Cẩm nang tích hợp 19 REST API đa ngôn ngữ (cURL, Python, PHP...)
│   └── SPEC_AI_EXECUTIVE_REPORT_ENGINE.md # Đặc tả kỹ thuật schema IR & thuật toán nhận diện
│
├── 🌐 public/index.html                   # Trạm Nạp & Xuất Chuẩn Dữ Liệu Gốc (Dual-View, Tô Vàng #facc15)
├── ⚙️ src/                                # Mã nguồn TypeScript Backend & Engines
│   ├── routes/                            # Định tuyến REST API (19 endpoints: /upload, /export/*, /analytics/*)
│   ├── services/                          # Động cơ PDF Parser, DOCX Parser, Extractor, Exporter, Warehouse
│   ├── schemas/                           # Zod Schemas chuẩn hóa (ReportIR, RequestSchemas)
│   ├── use-cases/                         # Luồng nghiệp vụ ProcessDocumentUseCase, ExportReportUseCase
│   └── utils/                             # Tiện ích định dạng file, sanitize tên tiếng Việt ISO
│
├── 🧪 tests/                              # Bộ kiểm thử tự động Vitest (18 Test Suites, 62 Tests)
├── 📊 dataset-50-real-reports/            # 50 Báo cáo thực tế phục vụ Golden Benchmark
└── 📂 uploads/                            # Thư mục lưu trữ an toàn các file tải lên
```

---

## 🚀 4. Hướng Dẫn Vận Hành & Khởi Chạy

### Cách 1: Khởi Chạy 1-Click (Dành cho Lãnh đạo / Người dùng cuối)
Kích đúp chuột vào file **`start_server.bat`** $\rightarrow$ Hệ thống tự động khởi động máy chủ và mở trình duyệt tại:
* **Giao diện Trạm Nạp & Xuất Dữ Liệu Gốc:** `http://localhost:3001`
* **Tài liệu Swagger API UI:** `http://localhost:3001/docs`

### Cách 2: Lệnh Kỹ Thuật (Dành cho Lập trình viên)
```bash
# 1. Cài đặt thư viện
npm install

# 2. Chạy toàn bộ 18 Test Suites (62 tests)
npm test

# 3. Biên dịch mã nguồn (Clean build)
npm run build

# 4. Khởi động môi trường phát triển
npm run dev
```

---

## 📖 5. Danh Mục RESTful API Chính (19 Endpoints)

* `POST /api/v1/reports/upload`: Tải lên và bóc tách tức thì file PDF / DOCX (Multipart).
* `POST /api/v1/reports/extract-by-path`: Bóc tách file PDF/DOCX theo đường dẫn máy chủ (Sandbox Protected).
* `POST /api/v1/reports/batch`: Xử lý hàng đợi bóc tách nhiều tài liệu đồng thời.
* `POST /api/v1/reports/sync-to-warehouse`: Lưu trữ dữ liệu điều hành vào kho tập trung.
* `POST /api/v1/reports/export/docx`: Xuất bản văn bản Word (.docx) chuẩn thể thức NĐ 30.
* `POST /api/v1/reports/export/pdf`: Xuất bản văn bản PDF (.pdf) đa trang vector.
* `POST /api/v1/reports/export/tables-csv`: Xuất toàn bộ bảng ma trận số liệu ra CSV.
* `POST /api/v1/reports/export/raw-json`: Xuất file JSON dữ liệu gốc nguyên bản.
* `GET /api/v1/reports/samples`: Lấy danh sách 50 tài liệu mẫu thực tế.
* `GET /api/v1/reports/warehouse`: Truy vấn danh sách báo cáo trong kho dữ liệu.
* `GET /api/v1/analytics/kpi-trends`: Phân tích chuỗi dữ liệu xu hướng chỉ số KPI.
* `GET /api/v1/analytics/bottleneck-heatmap`: Bản đồ nhiệt các điểm nghẽn điều hành.
* `GET /api/v1/analytics/period-comparison`: Đối chiếu so sánh số liệu giữa các kỳ báo cáo.
* `GET /api/v1/health`: Kiểm tra trạng thái sức khỏe hệ thống (Healthcheck).
