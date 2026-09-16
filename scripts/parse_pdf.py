#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Advanced Evidence-Centric PDF, Table & Watermark Parser for KGLVS V3
Produces DocumentEvidenceIR with Page-Level Routing, Word Spans, and Watermark Isolation.
"""

import sys
import os
import json
import io
import math
import re
import contextlib
from collections import defaultdict
import numpy as np

try:
    import pymupdf as fitz
except ImportError:
    import fitz

_ocr_engine = None
_ocr_initialized = False

def get_ocr_engine():
    """
    Khởi tạo lười (Lazy initialization) cho RapidOCR ONNX Engine.
    Hoạt động 100% Offline, Zero Cloud API, tối ưu hóa tốc độ trên CPU.
    """
    global _ocr_engine, _ocr_initialized
    if not _ocr_initialized:
        _ocr_initialized = True
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
        except Exception as e:
            sys.stderr.write(f"RapidOCR initialization warning: {e}\n")
            _ocr_engine = None
    return _ocr_engine

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8')

if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

def detect_watermark_patterns(doc) -> list:
    """
    Phát hiện các mẫu Watermark thực thụ (chữ chéo / góc nghiêng hoặc từ khóa Watermark đặc thù).
    Tuyệt đối không phân loại nhầm các từ vựng phổ biến trong văn bản làm watermark.
    """
    span_counts = defaultdict(lambda: {"count": 0, "angles": [], "pages": set(), "bbox": None})
    total_pages = len(doc)

    COMMON_WM_KEYWORDS = {
        'dự thảo', 'bản dự thảo', 'tài liệu mật', 'tuyệt mật', 'tối mật', 
        'bản lưu', 'confidential', 'draft', 'sample document', 
        'watermark', 'dấu chìm', 'bản nháp', 'scan by', 'camscanner', 'adobe scan',
        'aspose', 'aspose.cells', 'evaluation only', 'copyright 2003', 'aspose pty ltd'
    }

    for page_idx in range(total_pages):
        page = doc[page_idx]
        text_page = page.get_text("dict")
        for block in text_page.get("blocks", []):
            if "lines" in block:
                for line in block["lines"]:
                    dir_vec = line.get("dir", (1, 0))
                    # Tính góc nghiêng của dòng chữ (degrees)
                    angle = round(math.degrees(math.atan2(dir_vec[1], dir_vec[0])), 1)
                    for span in line.get("spans", []):
                        text = span.get("text", "").strip()
                        if len(text) >= 4:
                            entry = span_counts[text]
                            entry["count"] += 1
                            entry["angles"].append(angle)
                            entry["pages"].add(page_idx + 1)
                            if entry["bbox"] is None:
                                entry["bbox"] = [round(x, 2) for x in span.get("bbox", [0, 0, 0, 0])]

    watermarks = []
    for text, data in span_counts.items():
        # Điều kiện phát hiện watermark thực thụ:
        # 1. Có góc nghiêng chéo rõ rệt (abs(angle) > 10)
        # 2. Hoặc chứa từ khóa watermark chuyên dụng và độ dài ngắn (<= 80 ký tự)
        has_diagonal_angle = any(abs(a) > 10 for a in data["angles"])
        is_explicit_wm_kw = any(kw in text.lower() for kw in COMMON_WM_KEYWORDS) and len(text) <= 80

        if has_diagonal_angle or is_explicit_wm_kw:
            watermarks.append({
                "pattern_text": text,
                "angle_deg": data["angles"][0] if data["angles"] else 0.0,
                "occurrences_count": data["count"],
                "pages_affected": sorted(list(data["pages"])),
                "sample_bbox": data["bbox"]
            })

    return watermarks

def is_valid_administrative_table(df_data, tab_bbox=None) -> bool:
    """
    Bộ lọc phân loại bảng biểu chuẩn:
    Loại bỏ 100% các bảng giả lập (header 2 cột UBND/Quốc hiệu, tiêu đề BÁO CÁO, đề mục PHẦN THỨ, đoạn văn bị phân mảnh).
    Chỉ giữ lại các bảng số liệu / bảng biểu danh mục thực thụ.
    """
    if not df_data or len(df_data) < 2:
        return False
    
    rows_cnt = len(df_data)
    cols_cnt = len(df_data[0]) if rows_cnt > 0 else 0
    
    # Bảng thật thường từ 2 đến 16 cột
    if cols_cnt < 2 or cols_cnt > 16:
        return False
    
    # 1. Kiểm tra nếu là Header hành chính (Quốc hiệu / Cơ quan ban hành)
    flat_first_row = ' '.join([str(c) for c in df_data[0] if c is not None]).upper()
    flat_all_text = ' '.join([str(c) for row in df_data for c in row if c is not None]).upper()
    
    header_keywords = [
        'CỘNG HÒA XÃ HỘI', 'ĐỘC LẬP - TỰ DO', 'ĐỘC LẬP – TỰ DO',
        'ỦY BAN NHÂN DÂN', 'UỶ BAN NHÂN DÂN', 'HỘI ĐỒNG NHÂN DÂN', 'SỐ:'
    ]
    if any(kw in flat_first_row for kw in header_keywords) and rows_cnt <= 3:
        return False
    
    # 2. Kiểm tra nếu là Tiêu đề hoặc Đầu mục văn bản bị chia cột
    title_keywords = ['BÁO CÁO', 'PHIẾU TRÌNH', 'TỜ TRÌNH', 'KẾ HOẠCH', 'PHẦN THỨ', 'KÍNH GỬI', 'NƠI NHẬN']
    if rows_cnt <= 2 and any(tk in flat_all_text for tk in title_keywords):
        return False
    
    # 3. Kiểm tra độ phân mảnh ký tự (Từng từ bị tách thành từng cột)
    non_empty_cells = []
    numeric_cells_count = 0
    
    for row in df_data:
        for cell in row:
            if cell is not None and str(cell).strip():
                c_str = str(cell).strip()
                non_empty_cells.append(c_str)
                # Số liệu định lượng, tỷ lệ, tiền tệ hoặc ký hiệu bảng
                if re.search(r'\d+', c_str) or c_str in ['-', '—', 'x', 'X', '%']:
                    numeric_cells_count += 1
    
    if len(non_empty_cells) < 4:
        return False
    
    avg_cell_len = sum(len(c) for c in non_empty_cells) / len(non_empty_cells)
    
    # Nếu bảng nhiều cột mà độ dài trung bình mỗi ô <= 3 ký tự (các từ bị cắt xén do giãn dòng)
    if avg_cell_len <= 3 and cols_cnt >= 4 and rows_cnt <= 2:
        return False
    
    total_cells = rows_cnt * cols_cnt
    density = len(non_empty_cells) / total_cells
    
    # Mật độ ô không được quá rỗng (< 25%)
    if density < 0.25:
        return False
    
    # Với bảng 2 hàng: Phải có ít nhất 2 ô chứa số liệu hoặc mật độ lấp đầy >= 50%
    if rows_cnt == 2:
        if numeric_cells_count < 2 and density < 0.5:
            return False
    
    return True

def find_table_context_title(page, tab_bbox, default_title: str) -> str:
    """
    Tìm tiêu đề ngữ cảnh của bảng từ các dòng chữ ngay phía trên bảng (Bảng ..., Biểu ..., Phụ lục ...)
    """
    try:
        tab_top = tab_bbox[1]
        blocks = page.get_text("dict").get("blocks", [])
        candidates = []
        for b in blocks:
            if "lines" in b:
                for l in b["lines"]:
                    bbox = l.get("bbox", [0, 0, 0, 0])
                    # Nằm phía trên bảng trong phạm vi 70pt
                    if bbox[3] <= tab_top and (tab_top - bbox[3]) <= 70:
                        text = "".join([s.get("text", "") for s in l.get("spans", [])]).strip()
                        if text and len(text) > 3:
                            candidates.append((tab_top - bbox[3], text))
        
        if candidates:
            candidates.sort(key=lambda x: x[0])
            ignored_patterns = ['aspose', 'evaluation only', 'copyright', 'dự thảo', 'camscanner', 'watermark', 'created with']
            # Ưu tiên tìm các từ khóa tiêu đề bảng/phụ lục
            for _, text in candidates:
                if any(ip in text.lower() for ip in ignored_patterns):
                    continue
                if re.search(r'^(Phụ lục|Bảng|Biểu|Danh mục|Tổng hợp|Thống kê|Kết quả|Thời hạn|Nhiệm vụ|Chi tiết)\b', text, re.IGNORECASE):
                    return text
            # Nếu có dòng văn bản ngắn hợp lệ phía trên
            for _, text in candidates:
                if any(ip in text.lower() for ip in ignored_patterns):
                    continue
                if len(text) < 120 and not text.startswith(('I.', 'II.', 'III.', 'IV.', '1.', '2.', '3.')):
                    return text
    except Exception:
        pass
    return default_title

def parse_pdf_evidence(file_path: str) -> dict:
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}", "pages": []}

    doc = fitz.open(file_path)
    total_pages = len(doc)
    pages_data = []
    total_raw_pages = len(doc)
    pages_data = []
    master_stitched_tables = []
    active_master_table = None
    total_text_len = 0

    # 1. Nhận diện các mẫu Watermark toàn tài liệu
    detected_watermarks = detect_watermark_patterns(doc)
    watermark_patterns_set = {w["pattern_text"].lower() for w in detected_watermarks}
    
    # Bổ sung danh sách watermark cố định phổ biến
    COMMON_WATERMARK_KEYWORDS = {
        'dự thảo', 'bản dự thảo', 'tài liệu mật', 'tuyệt mật', 'tối mật', 
        'bản lưu', 'copy', 'confidential', 'draft', 'sample document', 
        'watermark', 'dấu chìm', 'bản nháp', 'scan by', 'camscanner', 'adobe scan',
        'aspose', 'aspose.cells', 'evaluation only', 'copyright 2003', 'aspose pty ltd'
    }
    watermark_patterns_set.update(COMMON_WATERMARK_KEYWORDS)

    meaningful_page_counter = 0
    was_any_page_scanned = False
    was_ocr_applied = False

    for page_idx in range(total_raw_pages):
        page = doc[page_idx]
        rect = page.rect
        page_width = round(rect.width, 2)
        page_height = round(rect.height, 2)

        raw_page_text = page.get_text("text").strip()
        has_page_images = len(page.get_images()) > 0
        is_page_scanned = (len(raw_page_text) < 40 and has_page_images) or (len(raw_page_text) == 0 and not page.rect.is_empty)
        if is_page_scanned:
            was_any_page_scanned = True

        # Phân rã Layout Blocks & Phân lập Watermark
        blocks_raw = page.get_text("blocks")
        evidence_blocks = []
        clean_page_lines = []
        words_raw_ocr = []
        page_ocr_applied = False

        # Nếu là trang scan (không có Text Layer) -> Kích hoạt Smart Offline OCR
        if is_page_scanned:
            ocr_engine = get_ocr_engine()
            if ocr_engine:
                try:
                    dpi = 150
                    scale = dpi / 72.0
                    pix = page.get_pixmap(dpi=dpi)
                    img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))
                    if pix.n == 4:
                        img_array = img_array[:, :, :3]
                    
                    ocr_res, _ = ocr_engine(img_array)
                    if ocr_res:
                        page_ocr_applied = True
                        was_ocr_applied = True
                        for o_idx, item in enumerate(ocr_res):
                            box, text, conf_val = item[0], item[1].strip(), item[2]
                            if not text:
                                continue
                            conf = float(conf_val) if isinstance(conf_val, (int, float, str)) else 0.85
                            min_x = round(min(pt[0] for pt in box) / scale, 2)
                            min_y = round(min(pt[1] for pt in box) / scale, 2)
                            max_x = round(max(pt[0] for pt in box) / scale, 2)
                            max_y = round(max(pt[1] for pt in box) / scale, 2)
                            line_bbox = [min_x, min_y, max_x, max_y]

                            b_type = "PARAGRAPH"
                            if min_y < 70:
                                b_type = "HEADER"
                            elif max_y > (page_height - 60):
                                b_type = "FOOTER"
                            elif len(text) < 120 and (text.isupper() or text.startswith(('I.', 'II.', 'III.', 'IV.', 'V.', 'PHẦN', 'BÁO CÁO'))):
                                b_type = "HEADING_1"

                            evidence_blocks.append({
                                "block_id": f"p{page_idx + 1}_b{o_idx + 1}",
                                "page_number": page_idx + 1,
                                "block_type": b_type,
                                "bbox": line_bbox,
                                "text": text,
                                "reading_order_index": o_idx,
                                "confidence": round(conf, 4),
                                "is_watermark": False
                            })
                            clean_page_lines.append(text)

                            # Phân rã từ (Words) cho OCR Spans
                            parts = text.split()
                            if parts:
                                part_w = (max_x - min_x) / len(parts)
                                for p_idx, part in enumerate(parts):
                                    w_box = [
                                        round(min_x + p_idx * part_w, 2),
                                        min_y,
                                        round(min_x + (p_idx + 1) * part_w, 2),
                                        max_y
                                    ]
                                    words_raw_ocr.append((w_box[0], w_box[1], w_box[2], w_box[3], part, conf))

                        clean_page_text = "\n\n".join(clean_page_lines).strip()
                        raw_page_text = clean_page_text
                except Exception as ocr_err:
                    sys.stderr.write(f"OCR execution warning on page {page_idx + 1}: {ocr_err}\n")

        # Nếu không chạy OCR (PDF điện tử bình thường), trích xuất từ PyMuPDF blocks
        if not page_ocr_applied:
            for b_idx, b in enumerate(blocks_raw):
                if len(b) >= 5 and b[4].strip():
                    b_text = b[4].strip()
                    b_bbox = [round(b[0], 2), round(b[1], 2), round(b[2], 2), round(b[3], 2)]
                    
                    b_clean = b_text.strip().lower()
                    is_wm = False
                    for wm in watermark_patterns_set:
                        wm_clean = wm.strip().lower()
                        if not wm_clean:
                            continue
                        if b_clean == wm_clean or (len(b_clean) < len(wm_clean) + 40 and wm_clean in b_clean):
                            is_wm = True
                            break

                    block_type = "PARAGRAPH"
                    if is_wm:
                        block_type = "WATERMARK"
                    elif b[1] < 70:
                        block_type = "HEADER"
                    elif b[3] > (page_height - 60):
                        block_type = "FOOTER"
                    elif len(b_text) < 120 and (b_text.isupper() or b_text.startswith(('I.', 'II.', 'III.', 'IV.', 'V.', 'PHẦN', 'BÁO CÁO'))):
                        block_type = "HEADING_1"

                    evidence_blocks.append({
                        "block_id": f"p{page_idx + 1}_b{b_idx + 1}",
                        "page_number": page_idx + 1,
                        "block_type": block_type,
                        "bbox": b_bbox,
                        "text": b_text,
                        "reading_order_index": b_idx,
                        "confidence": 0.99 if not is_page_scanned else 0.85,
                        "is_watermark": is_wm
                    })

                    if not is_wm:
                        clean_page_lines.append(b_text)

            clean_page_text = "\n\n".join(clean_page_lines).strip()

        # Quét trích xuất bảng biểu
        page_raw_tables = []
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                tabs = page.find_tables()
            for t_idx, tab in enumerate(tabs.tables):
                df_data = tab.extract()
                if is_valid_administrative_table(df_data, tab.bbox):
                    page_raw_tables.append((df_data, tab.bbox))
        except Exception:
            pass

        # 2. BỘ LỌC TRANG TRẮNG / TRANG RÁC (BLANK & WATERMARK-ONLY PAGE ELIMINATOR)
        is_blank_noise_page = (len(clean_page_text) == 0 or (len(clean_page_text) <= 5 and clean_page_text.isdigit())) and len(page_raw_tables) == 0
        if is_blank_noise_page:
            continue

        meaningful_page_counter += 1
        page_display_num = meaningful_page_counter

        # 3. ĐỘNG CƠ NỐI BẢNG ĐA TRANG (MULTI-PAGE TABLE STITCHING ENGINE)
        page_processed_tables = []
        for df_data, tab_bbox in page_raw_tables:
            first_row = [str(c).strip().replace('\n', ' ') if c is not None else '' for c in df_data[0]]
            first_cell = first_row[0] if first_row else ''

            is_continuation = (
                active_master_table is not None and
                len(first_row) == active_master_table["col_count"] and
                (first_cell.isdigit() or re.match(r'^\d+$', first_cell))
            )

            if is_continuation:
                inherited_headers = active_master_table["headers"]
                continuation_rows = []
                for row in df_data:
                    clean_row = [str(cell).strip().replace('\n', ' ') if cell is not None else '' for cell in row]
                    if any(c for c in clean_row):
                        continuation_rows.append(clean_row)
                        active_master_table["rows"].append(clean_row)

                active_master_table["page_refs"].append(page_display_num)
                active_master_table["row_count"] = len(active_master_table["rows"])

                page_tbl_obj = {
                    "table_id": f"table-p{page_display_num}-{len(page_processed_tables) + 1}",
                    "page_number": page_display_num,
                    "page_ref": page_display_num,
                    "table_title": f"{active_master_table['table_title']} (Tiếp theo - Trang {page_display_num})",
                    "headers": inherited_headers,
                    "rows": continuation_rows,
                    "row_count": len(continuation_rows),
                    "col_count": len(inherited_headers),
                    "bbox": [round(tab_bbox[0], 2), round(tab_bbox[1], 2), round(tab_bbox[2], 2), round(tab_bbox[3], 2)],
                    "is_continuation": True,
                    "master_table_id": active_master_table["table_id"]
                }
                page_processed_tables.append(page_tbl_obj)
            else:
                tbl_headers = first_row
                tbl_rows = []
                for row in df_data[1:]:
                    clean_row = [str(cell).strip().replace('\n', ' ') if cell is not None else '' for cell in row]
                    if any(c for c in clean_row):
                        tbl_rows.append(clean_row)

                ctx_title = find_table_context_title(page, tab_bbox, f"Bảng số liệu #{len(master_stitched_tables) + 1} tại Trang {page_display_num}")

                active_master_table = {
                    "table_id": f"tbl-{len(master_stitched_tables) + 1}",
                    "table_title": ctx_title,
                    "headers": tbl_headers,
                    "rows": tbl_rows,
                    "row_count": len(tbl_rows),
                    "col_count": len(tbl_headers),
                    "page_ref": page_display_num,
                    "start_page": page_display_num,
                    "page_refs": [page_display_num],
                    "bbox": [round(tab_bbox[0], 2), round(tab_bbox[1], 2), round(tab_bbox[2], 2), round(tab_bbox[3], 2)]
                }
                master_stitched_tables.append(active_master_table)

                page_tbl_obj = {
                    "table_id": f"table-p{page_display_num}-{len(page_processed_tables) + 1}",
                    "page_number": page_display_num,
                    "page_ref": page_display_num,
                    "table_title": ctx_title,
                    "headers": tbl_headers,
                    "rows": tbl_rows,
                    "row_count": len(tbl_rows),
                    "col_count": len(tbl_headers),
                    "bbox": [round(tab_bbox[0], 2), round(tab_bbox[1], 2), round(tab_bbox[2], 2), round(tab_bbox[3], 2)],
                    "is_continuation": False,
                    "master_table_id": active_master_table["table_id"]
                }
                page_processed_tables.append(page_tbl_obj)

        word_spans = []
        if words_raw_ocr:
            for w_idx, w in enumerate(words_raw_ocr):
                word_spans.append({
                    "word_id": f"p{page_display_num}_w{w_idx + 1}",
                    "text": w[4],
                    "bbox": [round(w[0], 2), round(w[1], 2), round(w[2], 2), round(w[3], 2)],
                    "confidence": round(w[5], 4)
                })
        else:
            words_raw = page.get_text("words")
            for w_idx, w in enumerate(words_raw):
                w_text = w[4].strip()
                if w_text:
                    word_spans.append({
                        "word_id": f"p{page_display_num}_w{w_idx + 1}",
                        "text": w_text,
                        "bbox": [round(w[0], 2), round(w[1], 2), round(w[2], 2), round(w[3], 2)],
                        "confidence": 0.99 if not is_page_scanned else 0.85
                    })

        total_text_len += len(clean_page_text)

        pages_data.append({
            "page_number": page_display_num,
            "pageNumber": page_display_num,
            "original_page_number": page_idx + 1,
            "width": page_width,
            "height": page_height,
            "rotation": 0,
            "is_scanned": is_page_scanned,
            "ocr_applied": page_ocr_applied,
            "has_watermark": any(b["is_watermark"] for b in evidence_blocks),
            "text": clean_page_text,
            "raw_text_with_wm": raw_page_text,
            "charCount": len(clean_page_text),
            "blocks": evidence_blocks,
            "words": word_spans,
            "tables": page_processed_tables
        })

    is_document_scanned = was_any_page_scanned or (total_text_len < (50 * len(pages_data)) if pages_data else False)

    return {
        "document_id": f"doc-{os.path.basename(file_path)}",
        "filePath": file_path,
        "fileName": os.path.basename(file_path),
        "totalPages": len(pages_data),
        "totalRawPages": total_raw_pages,
        "eliminatedBlankPages": total_raw_pages - len(pages_data),
        "totalChars": total_text_len,
        "isScanned": is_document_scanned,
        "ocrApplied": was_ocr_applied,
        "pipeline_version": "3.0.0-evidence-v1",
        "watermarks_detected": detected_watermarks,
        "pages": pages_data,
        "tables": master_stitched_tables,
        "all_tables": master_stitched_tables,
        "extracted_at": "2026-08-22T11:46:00Z"
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: parse_pdf.py <pdf_path> or parse_pdf.py --daemon"}))
        sys.exit(1)

    if sys.argv[1] == '--daemon':
        # Bật flush ngay lập tức cho stdout
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
        # Phát tín hiệu sẵn sàng
        sys.stdout.write(json.dumps({"status": "READY"}) + "\n")
        sys.stdout.flush()

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            if line == 'QUIT' or line == 'EXIT':
                break
            req_id = None
            try:
                req = json.loads(line)
                req_id = req.get("id")
                pdf_file = req.get("file_path")
                if not pdf_file:
                    res = {"id": req_id, "error": "file_path is required"}
                else:
                    res = parse_pdf_evidence(pdf_file)
                    res["id"] = req_id
                sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
                sys.stdout.flush()
            except Exception as e:
                err_res = {"id": req_id, "error": str(e)}
                sys.stdout.write(json.dumps(err_res, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        sys.exit(0)

    pdf_path = sys.argv[1]
    result = parse_pdf_evidence(pdf_path)
    print(json.dumps(result, ensure_ascii=False))
