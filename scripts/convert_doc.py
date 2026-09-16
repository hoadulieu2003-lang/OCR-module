#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
High-Fidelity Word Binary (.doc) to Modern Word (.docx) Converter
Utilizes Microsoft Word Automation COM Bridge on Windows with LibreOffice headless fallback.
"""

import sys
import os
import json
import subprocess

def convert_doc_to_docx(doc_path: str, docx_path: str) -> dict:
    if not os.path.exists(doc_path):
        return {"success": False, "error": f"Tệp tin không tồn tại: {doc_path}"}

    abs_doc = os.path.abspath(doc_path)
    abs_docx = os.path.abspath(docx_path)

    # Strategy 1: Microsoft Word COM Automation on Windows
    if sys.platform == 'win32':
        try:
            import win32com.client
            import pythoncom
            pythoncom.CoInitialize()
            try:
                word = win32com.client.DispatchEx('Word.Application')
                word.Visible = False
                word.DisplayAlerts = False
                try:
                    doc = word.Documents.Open(abs_doc, ReadOnly=True, ConfirmConversions=False)
                    # FileFormat 12: wdFormatXMLDocument (.docx in Word 2007+)
                    # FileFormat 16: wdFormatDocumentDefault
                    try:
                        doc.SaveAs2(abs_docx, FileFormat=12)
                    except Exception:
                        doc.SaveAs(abs_docx, FileFormat=12)
                    doc.Close(SaveChanges=False)
                    if os.path.exists(abs_docx) and os.path.getsize(abs_docx) > 0:
                        return {"success": True, "docx_path": abs_docx, "method": "Word.Application"}
                finally:
                    word.Quit()
            finally:
                pythoncom.CoUninitialize()
        except Exception as com_err:
            sys.stderr.write(f"Word COM Automation warning: {com_err}\n")

    # Strategy 2: LibreOffice / soffice headless converter
    for soffice_bin in ['soffice', 'libreoffice']:
        try:
            outdir = os.path.dirname(abs_docx) or '.'
            res = subprocess.run(
                [soffice_bin, '--headless', '--convert-to', 'docx', abs_doc, '--outdir', outdir],
                capture_output=True,
                text=True,
                timeout=30
            )
            # LibreOffice outputs with same basename and .docx
            expected_lo_output = os.path.splitext(abs_doc)[0] + '.docx'
            if os.path.exists(expected_lo_output):
                if expected_lo_output != abs_docx:
                    if os.path.exists(abs_docx):
                        os.remove(abs_docx)
                    os.rename(expected_lo_output, abs_docx)
                return {"success": True, "docx_path": abs_docx, "method": soffice_bin}
        except Exception as lo_err:
            sys.stderr.write(f"LibreOffice converter warning: {lo_err}\n")

    return {
        "success": False,
        "error": "Không thể chuyển đổi file .doc cũ sang .docx. Máy chủ chưa kích hoạt Microsoft Word COM hoặc LibreOffice. Vui lòng lưu file sang định dạng .docx hoặc PDF trước khi nạp."
    }

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: convert_doc.py <input.doc> <output.docx>"}))
        sys.exit(1)

    in_doc = sys.argv[1]
    out_docx = sys.argv[2]
    result = convert_doc_to_docx(in_doc, out_docx)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result["success"] else 1)
