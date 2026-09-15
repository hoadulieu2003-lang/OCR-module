# TÀI LIỆU HƯỚNG DẪN TÍCH HỢP REST API — KGLVS REPORT OCR & EXTRACTION ENGINE

> **Phiên bản:** 2.0.0 (Deterministic Ground-Truth Architecture)  
> **Giao thức:** HTTP/REST (Fastify v4 Framework)  
> **Định dạng dữ liệu:** JSON Intermediate Representation (IR)  
> **Hiệu năng:** Độ trễ <50ms, Zero Hallucination, Thể thức NĐ 30/2020/NĐ-CP  
> **Quy mô API:** 19 RESTful Endpoints (`/api/v1/*`)  
> **Tài liệu Tương Tác:** `http://localhost:3001/docs` (Swagger OpenAPI 3.0)

---

## 1. TỔNG QUAN VỀ API

Module OCR & Bóc Tách Báo Cáo KGLVS được đóng gói thành một **Microservice độc lập**, cho phép bất kỳ hệ thống quản lý, phần mềm điều hành hoặc luồng tự động hóa (iOffice, eGov, n8n, Activepieces, ERP, DMS) gửi file PDF/Word báo cáo và nhận về cấu trúc dữ liệu trích xuất nguyên bản hoàn chỉnh chỉ trong **<50ms**.

### 1.1. Luồng hoạt động (Workflow)
1. **Client** gửi yêu cầu `POST /api/v1/reports/upload` kèm file **PDF (`.pdf`)** hoặc **Word (`.docx`)**.
2. **KGLVS OCR Engine** thực thi chu trình trích xuất dữ liệu gốc xác định:
   * *Giai đoạn 1:* Phân tích layout, bóc tách ma trận bảng biểu đa trang (`multi-page table stitcher`) và tọa độ bbox (PyMuPDF & Mammoth).
   * *Giai đoạn 2:* Nhận diện thể thức văn bản hành chính theo Nghị định 30/2020/NĐ-CP.
   * *Giai đoạn 3:* Trích xuất sâu thực thể (Chỉ số KPI định lượng, Điểm nghẽn & Nguyên nhân, Nhiệm vụ, Kiến nghị).
   * *Giai đoạn 4:* Phân hạng mức độ ưu tiên (Priority Ranking) và chuẩn hóa dữ liệu gốc kèm trích dẫn nguyên văn.
   * *Giai đoạn 5:* Đồng bộ vào Kho Dữ Liệu Điều Hành hoặc Xuất bản đa định dạng (Word, PDF, CSV, JSON).

### 1.2. Danh mục toàn bộ 19 REST Endpoints (`/api/v1`):

| # | Phương thức | Endpoint | Phân nhóm | Mô tả chức năng |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `POST` | `/api/v1/reports/upload` | Ingestion | **Endpoint chính:** Tải file PDF hoặc Word lên để bóc tách tức thì |
| 2 | `POST` | `/api/v1/reports/extract-by-path` | Ingestion | Bóc tách file PDF/Word theo đường dẫn trên server (Sandbox bảo mật) |
| 3 | `POST` | `/api/v1/reports/batch` | Batch Queue | Tạo phiên xử lý hàng đợi cho nhiều tài liệu đồng thời |
| 4 | `GET` | `/api/v1/reports/batch/:batchId` | Batch Queue | Tra cứu trạng thái và tiến độ hoàn thành của batch job |
| 5 | `GET` | `/api/v1/reports/batch/metrics` | Batch Queue | Thống kê hiệu năng hàng đợi (tổng jobs, thời gian xử lý) |
| 6 | `POST` | `/api/v1/reports/sync-to-warehouse` | Warehouse | Lưu trữ cấu trúc dữ liệu IR vào Kho Dữ Liệu Điều Hành |
| 7 | `GET` | `/api/v1/reports/warehouse` | Warehouse | Truy vấn danh sách báo cáo trong kho (lọc theo cơ quan, lĩnh vực, kỳ) |
| 8 | `GET` | `/api/v1/reports/warehouse/:recordId` | Warehouse | Chi tiết dữ liệu một báo cáo đã lưu trong kho |
| 9 | `POST` | `/api/v1/reports/export/docx` | Export | Xuất bản báo cáo ra file Word (.docx) chuẩn thể thức NĐ 30 |
| 10 | `POST` | `/api/v1/reports/export/pdf` | Export | Xuất bản báo cáo ra file PDF (.pdf) đa trang vector |
| 11 | `POST` | `/api/v1/reports/export/tables-csv` | Export | Xuất toàn bộ các bảng số liệu ma trận ra file CSV |
| 12 | `POST` | `/api/v1/reports/export/raw-json` | Export | Xuất file JSON cây dữ liệu trung gian chuẩn hóa |
| 13 | `GET` | `/api/v1/reports/samples` | Samples | Lấy danh sách 50 văn bản thực tế phục vụ thử nghiệm nhanh |
| 14 | `GET` | `/api/v1/reports/taxonomy` | Taxonomy | Lấy bảng phân loại các lĩnh vực quản lý nhà nước theo NĐ 30 |
| 15 | `GET` | `/api/v1/analytics/kpi-trends` | Analytics | Phân tích chuỗi số liệu xu hướng của một chỉ số KPI qua các kỳ |
| 16 | `GET` | `/api/v1/analytics/bottleneck-heatmap` | Analytics | Ma trận bản đồ nhiệt các điểm nghẽn theo lĩnh vực và mức độ |
| 17 | `GET` | `/api/v1/analytics/period-comparison` | Analytics | So sánh đối chiếu chỉ số giữa 2 kỳ báo cáo |
| 18 | `GET` | `/api/v1/analytics/executive-summary` | Analytics | Báo cáo tóm tắt tình hình điều hành tổng hợp từ kho dữ liệu |
| 19 | `GET` | `/api/v1/health` | System | Kiểm tra trạng thái hoạt động của hệ thống (Healthcheck) |

---

## 2. XÁC THỰC BẢO MẬT (API KEY)

Khi kích hoạt `ENFORCE_API_KEY=true` trong file `.env`, hệ thống yêu cầu truyền khóa API qua một trong 2 cách:
1. Header `x-api-key: <YOUR_API_KEY>`
2. Header `Authorization: Bearer <YOUR_API_KEY>`

*(Mặc định trong môi trường Development: `API_KEY=kglvs-secret-key-2026`)*

---

## 3. MẪU TÍCH HỢP THEO NGÔN NGỮ

### 🔹 1. cURL / Postman / Terminal
```bash
curl -X POST "http://localhost:3001/api/v1/reports/upload" \
  -H "x-api-key: kglvs-secret-key-2026" \
  -F "file=@/duong/dan/to/bao_cao_ubnd.pdf"
```

---

### 🔹 2. Python (Dùng trong AI Pipeline / Django / FastAPI)
```python
import requests
import json

API_URL = "http://localhost:3001/api/v1/reports/upload"
API_KEY = "kglvs-secret-key-2026"
PDF_FILE_PATH = "BC_Kinh_Te_Xa_Hoi.pdf"

headers = {
    "x-api-key": API_KEY
}

with open(PDF_FILE_PATH, "rb") as f:
    files = {"file": f}
    response = requests.post(API_URL, headers=headers, files=files)

if response.status_code == 200:
    res_data = response.json()
    ir = res_data["data"]
    
    # 1. Metadata
    print("=== METADATA ===")
    print("Tiêu đề:", ir["metadata"]["document_title"])
    print("Cơ quan:", ir["metadata"]["issuing_authority"])
    print("Lĩnh vực:", ir["metadata"]["primary_domain"])
    
    # 2. Level 1: Tóm tắt 30s
    print("\n=== LEVEL 1: EXECUTIVE BRIEF ===")
    print("Tóm tắt:", ir["level1_executive_brief"]["headline"])
    if ir["level1_executive_brief"]["decision_needed"]["is_required"]:
        print("CẦN QUYẾT ĐỊNH:", ir["level1_executive_brief"]["decision_needed"]["decision_summary"])
        
    # 3. Level 2: Chỉ số KPI
    print("\n=== LEVEL 2: CHỈ SỐ KPI ===")
    for m in ir["level2_details"]["metrics"]:
        print(f"- {m['indicator']}: {m['actual']} (Trang {m['page_ref']})")
else:
    print("Lỗi bóc tách:", response.text)
```

---

### 🔹 3. Node.js / TypeScript (Next.js, Express, NestJS)
```typescript
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

async function extractAdministrativeReport(pdfFilePath: string) {
  const form = new FormData();
  form.append('file', fs.createReadStream(pdfFilePath));

  try {
    const response = await axios.post('http://localhost:3001/api/v1/reports/upload', form, {
      headers: {
        ...form.getHeaders(),
        'x-api-key': 'kglvs-secret-key-2026'
      }
    });

    const result = response.data;
    console.log('Bóc tách thành công:', result.data.metadata.document_title);
    return result.data;
  } catch (error: any) {
    console.error('Lỗi khi gọi API:', error.response?.data || error.message);
    throw error;
  }
}
```

---

### 🔹 4. PHP / Laravel
```php
<?php

$curl = curl_init();
$filePath = '/path/to/bao_cao.pdf';

curl_setopt_array($curl, array(
  CURLOPT_URL => 'http://localhost:3001/api/v1/reports/upload',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => array(
    'x-api-key: kglvs-secret-key-2026'
  ),
  CURLOPT_POSTFIELDS => array(
    'file' => new CURLFile($filePath, 'application/pdf')
  ),
));

$response = curl_exec($curl);
curl_close($curl);

$data = json_decode($response, true);
print_r($data['data']['level1_executive_brief']);
```

---

### 🔹 5. C# / .NET (.NET Core, C# Enterprise)
```csharp
using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

class Program
{
    static async Task Main(string[] args)
    {
        using var client = new HttpClient();
        client.DefaultRequestHeaders.Add("x-api-key", "kglvs-secret-key-2026");

        using var form = new MultipartFormDataContent();
        using var fileStream = File.OpenRead(@"C:\path\to\bao_cao.pdf");
        form.Add(new StreamContent(fileStream), "file", "bao_cao.pdf");

        var response = await client.PostAsync("http://localhost:3001/api/v1/reports/upload", form);
        var resultJson = await response.Content.ReadAsStringAsync();

        Console.WriteLine("API Response:\n" + resultJson);
    }
}
```

---

### 🔹 6. n8n / Activepieces (Workflow Automation)
1. Thêm Node **HTTP Request**.
2. **Method:** `POST`.
3. **URL:** `http://localhost:3001/api/v1/reports/upload`.
4. **Authentication:** Header Auth -> Header: `x-api-key`, Value: `kglvs-secret-key-2026`.
5. **Body:** Multipart Form-Data:
   - Field Name: `file`
   - Value: `{{ $binary.data }}`

---

## 4. CẤU TRÚC JSON TRẢ VỀ (DATA CONTRACT)

```typescript
interface ExecutiveReportIR {
  metadata: {
    document_title: string;
    document_type: string;
    document_number: string | null;
    issuing_authority: string;
    receiving_authority: string;
    issuance_date: string | null;
    reporting_period: string;
    primary_domain: string;
    domain_tags: string[];
    signer: { name: string | null; title: string | null };
  };
  level1_executive_brief: {
    overall_status: "BINH_THUONG" | "CAN_LUU_Y" | "CANH_BAO_KHAN";
    headline: string;
    decision_needed: {
      is_required: boolean;
      decision_summary: string | null;
      action_verb: string;
      page_ref: number;
    };
    priority_cards: Array<{
      card_id: string;
      priority_rank: number;
      priority_level: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
      badge_color: "RED" | "AMBER" | "GREEN";
      title: string;
      highlight_fact: string;
      source_page_ref: number;
    }>;
  };
  level2_details: {
    metrics: Array<{
      indicator: string;
      unit: string | null;
      actual: string;
      percentage: string | null;
      data_nature: "THUC_HIEN_THUC_TE" | "UOC_THUC_HIEN" | "KE_HOACH";
      page_ref: number;
      quote: string;
    }>;
    relationships: Array<{
      domain: string;
      issue: string;
      cause: string | null;
      impact: string | null;
      proposed_action: string | null;
      severity: "CRITICAL" | "HIGH" | "MEDIUM";
      page_ref: number;
    }>;
    tables: Array<{
      table_title: string;
      page_ref: number;
      headers: string[];
      rows: string[][];
    }>;
  };
}
```
