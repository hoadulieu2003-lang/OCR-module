import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import mammoth from 'mammoth';
import { CoreTable } from '../schemas/report-ir.schema.js';
import { DocumentEvidenceIR } from '../schemas/document-evidence.schema.js';
import { TableMatrixService } from './table-matrix.service.js';

export interface PageBlock {
  bbox: [number, number, number, number];
  text: string;
  type?: number | string;
  is_watermark?: boolean;
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  charCount: number;
  hasImages: boolean;
  blocks: PageBlock[];
  tables: CoreTable[];
  words?: any[];
}

export interface ParsedDocument {
  documentId?: string;
  filePath: string;
  fileName: string;
  totalPages: number;
  totalChars: number;
  isScanned: boolean;
  ocrApplied?: boolean;
  pages: ParsedPage[];
  tables: CoreTable[];
  evidenceIR?: DocumentEvidenceIR;
  watermarks_detected?: any[];
}

export class PdfParserService {
  private scriptPath: string;
  private tableMatrixService: TableMatrixService;

  // Persistent Python Worker Daemon state (Shared singleton)
  private static daemonProcess: any = null;
  private static daemonReady: boolean = false;
  private static pendingRequests: Map<string, { resolve: (data: any) => void; reject: (err: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private static stdoutBuffer: string = '';

  constructor() {
    this.scriptPath = path.resolve(__dirname, '../../scripts/parse_pdf.py');
    this.tableMatrixService = new TableMatrixService();
  }

  /**
   * Phân tích và bóc tách cấu trúc Text, Blocks và Tables từ file PDF hoặc Word (.docx)
   */
  async parse(filePath: string): Promise<ParsedDocument> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.doc') {
      throw new Error('Định dạng file Word nhị phân (.doc cũ) không được hỗ trợ. Vui lòng lưu/chuyển đổi file sang định dạng Word mới (.docx) hoặc PDF trước khi tải lên.');
    }

    if (ext === '.docx') {
      return this.parseDocx(filePath);
    }

    return this.parsePdf(filePath);
  }

  /**
   * Trích xuất văn bản và bảng biểu từ file Word (.docx) với cấu trúc trang logic và EvidenceIR đồng bộ 100% với PDF
   */
  private async parseDocx(docxPath: string): Promise<ParsedDocument> {
    try {
      const rawResult = await mammoth.extractRawText({ path: docxPath });
      const htmlResult = await mammoth.convertToHtml({ path: docxPath });

      const fullText = (rawResult.value || '').trim();
      const htmlContent = htmlResult.value || '';

      // 1. Phân tách HTML thành các phần tử tuần tự (Paragraphs, Headings, Tables)
      const parsedFlow = this.parseDocxHtmlFlow(htmlContent);

      // 2. Phân trang logic và gán đúng vị trí xuất hiện của bảng vào từng trang
      const { pages, structuredTables } = this.buildDocxPagesAndTables(parsedFlow, fullText);

      // 3. Xây dựng DocumentEvidenceIR chuẩn hóa tương thích 1:1 với PDF
      const evidenceIR: DocumentEvidenceIR = {
        document_id: `doc-${path.basename(docxPath)}`,
        file_name: path.basename(docxPath),
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        total_pages: pages.length,
        total_chars: fullText.length,
        pipeline_version: '3.0.0-evidence-v1',
        pages: pages.map(p => ({
          page_number: p.pageNumber,
          width: 595,
          height: 842,
          rotation: 0,
          is_scanned: false,
          has_watermark: false,
          char_count: p.charCount,
          blocks: p.blocks.map((b, bIdx) => ({
            block_id: `doc_p${p.pageNumber}_b${bIdx + 1}`,
            page_number: p.pageNumber,
            block_type: (b.type === 1 ? 'HEADING_1' : (b.type === 2 ? 'TABLE' : 'PARAGRAPH')) as any,
            bbox: b.bbox,
            text: b.text,
            reading_order_index: bIdx,
            confidence: 1.0,
            is_watermark: false
          })),
          tables: p.tables.map((t, tIdx) => ({
            table_id: t.table_id || `word-table-p${p.pageNumber}-${tIdx + 1}`,
            page_number: p.pageNumber,
            bbox: t.bbox || [50, 200, 545, 400],
            title: t.table_title || `Bảng trang ${p.pageNumber}`,
            row_count: t.row_count,
            col_count: t.col_count,
            headers: t.headers,
            cells: t.rows.flatMap((r, rI) => r.map((c, cI) => ({
              cell_id: `p${p.pageNumber}_tbl_${rI}_${cI}`,
              row_index: rI,
              col_index: cI,
              row_span: 1,
              col_span: 1,
              raw_text: c,
              normalized_value: c,
              confidence: 1.0
            }))),
            confidence: 1.0
          }))
        })),
        all_tables: structuredTables.map(t => ({
          table_id: t.table_id,
          page_number: t.page_ref,
          bbox: t.bbox || [50, 200, 545, 400],
          title: t.table_title || `Bảng trang ${t.page_ref}`,
          row_count: t.row_count,
          col_count: t.col_count,
          headers: t.headers,
          cells: t.rows.flatMap((r, rI) => r.map((c, cI) => ({
            cell_id: `p${t.page_ref}_tbl_${rI}_${cI}`,
            row_index: rI,
            col_index: cI,
            row_span: 1,
            col_span: 1,
            raw_text: c,
            normalized_value: c,
            confidence: 1.0
          }))),
          confidence: 1.0
        })),
        watermarks_detected: [],
        extracted_at: new Date().toISOString()
      };

      return {
        documentId: `doc-${path.basename(docxPath)}`,
        filePath: docxPath,
        fileName: path.basename(docxPath),
        totalPages: pages.length,
        totalChars: fullText.length,
        isScanned: false,
        watermarks_detected: [],
        pages,
        tables: structuredTables,
        evidenceIR
      };
    } catch (err: any) {
      throw new Error(`Lỗi đọc file Word (.docx): ${err.message}`);
    }
  }

  /**
   * Phân tách dòng HTML thành các phần tử tuần tự (Paragraphs, Headings, Tables)
   */
  private parseDocxHtmlFlow(html: string): Array<{ type: 'heading' | 'paragraph' | 'table'; text: string; tableData?: any }> {
    const flow: Array<{ type: 'heading' | 'paragraph' | 'table'; text: string; tableData?: any }> = [];
    const elementRegex = /<(h[1-6]|p|table)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = elementRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const inner = match[2];

      if (tag === 'table') {
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch: RegExpExecArray | null;
        const allRows: string[][] = [];

        while ((rowMatch = rowRegex.exec(inner)) !== null) {
          const rowInner = rowMatch[1];
          const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
          let cellMatch: RegExpExecArray | null;
          const rowCells: string[] = [];

          while ((cellMatch = cellRegex.exec(rowInner)) !== null) {
            const cleanText = cellMatch[1].replace(/<[^>]+>/g, '').trim();
            rowCells.push(cleanText);
          }

          if (rowCells.length > 0) {
            allRows.push(rowCells);
          }
        }

        if (allRows.length >= 2) {
          const headers = allRows[0];
          const dataRows = allRows.slice(1);
          const tableText = allRows.map(r => r.join(' | ')).join('\n');
          flow.push({
            type: 'table',
            text: tableText,
            tableData: {
              headers,
              rows: dataRows,
              row_count: dataRows.length,
              col_count: headers.length
            }
          });
        } else if (allRows.length === 1) {
          // Khối callout box 1x1 hoặc bảng 1 dòng đơn
          const calloutText = allRows[0].join('\n');
          if (calloutText.length > 0) {
            flow.push({
              type: 'paragraph',
              text: calloutText
            });
          }
        }
      } else {
        const cleanText = inner.replace(/<[^>]+>/g, '').trim();
        if (cleanText.length > 0) {
          flow.push({
            type: tag.startsWith('h') ? 'heading' : 'paragraph',
            text: cleanText
          });
        }
      }
    }

    return flow;
  }

  /**
   * Phân trang logic và định vị chính xác vị trí của từng bảng trong luồng văn bản Word
   */
  private buildDocxPagesAndTables(
    flow: Array<{ type: 'heading' | 'paragraph' | 'table'; text: string; tableData?: any }>,
    fullTextFallback: string
  ): { pages: ParsedPage[]; structuredTables: CoreTable[] } {
    if (flow.length === 0) {
      const fallbackPages = this.paginateWordTextFallback(fullTextFallback);
      return { pages: fallbackPages, structuredTables: [] };
    }

    const pages: ParsedPage[] = [];
    const structuredTables: CoreTable[] = [];

    let currentPageNo = 1;
    let currentPageTexts: string[] = [];
    let currentPageBlocks: PageBlock[] = [];
    let currentPageTables: CoreTable[] = [];
    let currentY = 50;
    let currentChars = 0;
    let tableIndex = 1;

    const TARGET_CHARS_PER_PAGE = 2200;

    const flushPage = () => {
      if (currentPageTexts.length > 0 || currentPageTables.length > 0) {
        const pageText = currentPageTexts.join('\n\n');
        pages.push({
          pageNumber: currentPageNo,
          text: pageText,
          charCount: pageText.length,
          hasImages: false,
          blocks: currentPageBlocks,
          tables: currentPageTables
        });
        currentPageNo++;
        currentPageTexts = [];
        currentPageBlocks = [];
        currentPageTables = [];
        currentY = 50;
        currentChars = 0;
      }
    };

    for (const item of flow) {
      const isMajorSection = item.type === 'heading' || /^(?:[I|V|X]+\.|\bPHẦN\b|\bBÁO CÁO\b|III\.\s*ĐỀ XUẤT|II\.\s*KẾT QUẢ)/i.test(item.text);

      if ((currentChars >= TARGET_CHARS_PER_PAGE) || (currentChars >= 800 && isMajorSection)) {
        flushPage();
      }

      if (item.type === 'table' && item.tableData) {
        const rawTable = item.tableData;
        const matrix = this.tableMatrixService.processTable(rawTable);
        const tableHeight = Math.min(300, (rawTable.rows.length + 1) * 22);

        const tableId = `word-table-${tableIndex++}`;
        const coreTable: CoreTable = {
          table_id: tableId,
          page_ref: currentPageNo,
          table_title: matrix.table_title || `Bảng số liệu Word #${tableIndex - 1}`,
          headers: matrix.headers,
          rows: matrix.rows,
          row_count: matrix.row_count,
          col_count: matrix.col_count,
          bbox: [50, currentY, 545, Math.min(800, currentY + tableHeight)],
          evidence_refs: [`p${currentPageNo}_tbl${tableIndex - 1}`]
        };

        currentPageTables.push(coreTable);
        structuredTables.push(coreTable);

        currentPageBlocks.push({
          bbox: [50, currentY, 545, Math.min(800, currentY + tableHeight)],
          text: item.text,
          type: 2
        });

        currentPageTexts.push(`[Bảng: ${coreTable.table_title}]\n${item.text}`);
        currentY += tableHeight + 15;
        currentChars += item.text.length;
      } else {
        const blockHeight = Math.max(18, Math.ceil(item.text.length / 80) * 16);
        const blockBbox: [number, number, number, number] = [
          50,
          currentY,
          545,
          Math.min(800, currentY + blockHeight)
        ];

        currentPageBlocks.push({
          bbox: blockBbox,
          text: item.text,
          type: item.type === 'heading' ? 1 : 0
        });

        currentPageTexts.push(item.text);
        currentY += blockHeight + 10;
        currentChars += item.text.length;
      }

      if (currentY >= 760) {
        flushPage();
      }
    }

    flushPage();

    if (pages.length === 0) {
      pages.push({
        pageNumber: 1,
        text: fullTextFallback || '',
        charCount: fullTextFallback?.length || 0,
        hasImages: false,
        blocks: [{ bbox: [50, 50, 545, 750], text: fullTextFallback || '', type: 0 }],
        tables: structuredTables
      });
    }

    return { pages, structuredTables };
  }

  private paginateWordTextFallback(text: string): ParsedPage[] {
    if (!text || text.length === 0) {
      return [{
        pageNumber: 1,
        text: '',
        charCount: 0,
        hasImages: false,
        blocks: [{ bbox: [50, 50, 545, 750], text: '', type: 0 }],
        tables: []
      }];
    }
    const pages: ParsedPage[] = [];
    pages.push({
      pageNumber: 1,
      text: text.trim(),
      charCount: text.trim().length,
      hasImages: false,
      blocks: [{ bbox: [50, 50, 545, 750], text: text.trim(), type: 0 }],
      tables: []
    });
    return pages;
  }

  /**
   * Đảm bảo Python Worker Daemon đang hoạt động
   */
  private ensureDaemon(): void {
    if (PdfParserService.daemonProcess && !PdfParserService.daemonProcess.killed) {
      return;
    }

    const pythonCmd = process.env.PYTHON_PATH || 'python';
    try {
      PdfParserService.daemonProcess = spawn(pythonCmd, [this.scriptPath, '--daemon'], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      PdfParserService.daemonProcess.stdout.on('data', (data: Buffer) => {
        PdfParserService.stdoutBuffer += data.toString('utf-8');
        const lines = PdfParserService.stdoutBuffer.split('\n');
        PdfParserService.stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.status === 'READY') {
              PdfParserService.daemonReady = true;
              continue;
            }
            if (msg.id && PdfParserService.pendingRequests.has(msg.id)) {
              const req = PdfParserService.pendingRequests.get(msg.id)!;
              clearTimeout(req.timeout);
              PdfParserService.pendingRequests.delete(msg.id);
              if (msg.error) {
                req.reject(new Error(msg.error));
              } else {
                req.resolve(msg);
              }
            }
          } catch {
            // Bỏ qua log phi JSON
          }
        }
      });

      PdfParserService.daemonProcess.on('error', () => {
        PdfParserService.daemonReady = false;
        PdfParserService.daemonProcess = null;
      });

      PdfParserService.daemonProcess.on('close', () => {
        PdfParserService.daemonReady = false;
        PdfParserService.daemonProcess = null;
        for (const [, req] of PdfParserService.pendingRequests.entries()) {
          clearTimeout(req.timeout);
          req.reject(new Error('Python Worker Daemon terminated'));
        }
        PdfParserService.pendingRequests.clear();
      });
    } catch {
      PdfParserService.daemonReady = false;
      PdfParserService.daemonProcess = null;
    }
  }

  /**
   * Bóc tách PDF siêu tốc qua Daemon IPC
   */
  private async parseWithDaemon(pdfPath: string): Promise<any> {
    this.ensureDaemon();
    if (!PdfParserService.daemonProcess || !PdfParserService.daemonReady) {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!PdfParserService.daemonProcess || !PdfParserService.daemonReady) {
        throw new Error('Daemon worker not ready yet');
      }
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        PdfParserService.pendingRequests.delete(id);
        reject(new Error(`Daemon timeout processing: ${pdfPath}`));
      }, 15000);

      PdfParserService.pendingRequests.set(id, { resolve, reject, timeout });
      const payload = JSON.stringify({ id, file_path: pdfPath }) + '\n';
      PdfParserService.daemonProcess.stdin.write(payload);
    });
  }

  /**
   * Fallback: Phân tích file PDF qua Subprocess độc lập
   */
  private async parseWithSubprocess(pdfPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonCmd = process.env.PYTHON_PATH || 'python';
      const pythonProcess = spawn(pythonCmd, [this.scriptPath, pdfPath], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString('utf-8');
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString('utf-8');
      });

      pythonProcess.on('error', (err) => {
        reject(new Error(`Không thể khởi chạy tiến trình Python (${pythonCmd}): ${err.message}. Vui lòng cài đặt Python và cấu hình biến môi trường PYTHON_PATH.`));
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`PDF Parser failed with code ${code}: ${stderrData}`));
        }

        try {
          const jsonStart = stdoutData.indexOf('{');
          const jsonEnd = stdoutData.lastIndexOf('}');
          if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error(`No JSON found in stdout: ${stdoutData}`);
          }
          const cleanJson = stdoutData.substring(jsonStart, jsonEnd + 1);
          const rawParsed = JSON.parse(cleanJson);
          if (rawParsed.error) {
            return reject(new Error(rawParsed.error));
          }
          resolve(rawParsed);
        } catch (err: any) {
          reject(new Error(`Failed to parse JSON output from pdf parser: ${err.message}`));
        }
      });
    });
  }

  /**
   * Phân tích file PDF qua PyMuPDF (với Persistent Worker Daemon & Subprocess Fallback)
   */
  private async parsePdf(pdfPath: string): Promise<ParsedDocument> {
    let rawParsed: any = null;

    if (process.env.DISABLE_PDF_DAEMON !== 'true') {
      try {
        rawParsed = await this.parseWithDaemon(pdfPath);
      } catch {
        // Tự động fallback sang Subprocess nếu Daemon chưa sẵn sàng
        rawParsed = await this.parseWithSubprocess(pdfPath);
      }
    } else {
      rawParsed = await this.parseWithSubprocess(pdfPath);
    }

    // Xử lý chuẩn hóa bảng qua TableMatrixService
    const processedTables: CoreTable[] = (rawParsed.tables || []).map((t: any) => {
      const matrix = this.tableMatrixService.processTable(t);
      return {
        table_id: matrix.table_id,
        page_ref: matrix.page_ref,
        table_title: matrix.table_title,
        headers: matrix.headers,
        rows: matrix.rows,
        row_count: matrix.row_count,
        col_count: matrix.col_count,
        bbox: matrix.bbox,
        evidence_refs: []
      };
    });

    return {
      documentId: rawParsed.document_id,
      filePath: rawParsed.filePath,
      fileName: rawParsed.fileName,
      totalPages: rawParsed.totalPages,
      totalChars: rawParsed.totalChars,
      isScanned: rawParsed.isScanned,
      ocrApplied: rawParsed.ocrApplied,
      watermarks_detected: rawParsed.watermarks_detected || [],
      pages: rawParsed.pages || [],
      tables: processedTables
    };
  }
}
