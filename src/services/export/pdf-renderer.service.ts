import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { ExecutiveReportIR, CoreTable } from '../../schemas/report-ir.schema.js';
import { AdministrativeDocumentFormatterService } from '../administrative-document-formatter.service.js';
import { ExecutiveTextCleaner, calculateTableColumnWidths } from './text-cleaner.js';

/**
 * Renderer chuyên biệt xuất file PDF (.pdf) Chuẩn Nghị định 30/2020/NĐ-CP (100% Tiếng Việt UTF-8 & Vector Tables)
 */
export class PdfRendererService {
  async render(ir: ExecutiveReportIR, rawFullText?: string): Promise<Buffer> {
    const meta = ir.metadata;
    const isPureTabular = meta.document_type === 'PHU_LUC' ||
      Boolean(meta.is_pure_table) ||
      (rawFullText && /^\s*phụ\s+lục\b/i.test(rawFullText.trim())) ||
      (rawFullText && /PHỤ LỤC/i.test(meta.document_title) && !rawFullText.includes('CỘNG HÒA XÃ HỘI'));

    if (isPureTabular) {
      return this.renderPureTabular(ir, rawFullText);
    }

    const struct = AdministrativeDocumentFormatterService.parseDocumentStructure(
      rawFullText || meta.document_title || '',
      meta
    );

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 56.7, bottom: 56.7, left: 70.8, right: 56.7 }, // 2.0cm / 2.5cm / 2.0cm
          autoFirstPage: true
        });

        // Đăng ký Font chữ Times New Roman hỗ trợ đầy đủ Unicode Tiếng Việt
        const regularFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/times.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/times.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\times.ttf') ? 'C:\\Windows\\Fonts\\times.ttf' : 'Helvetica');
        const boldFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/timesbd.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/timesbd.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\timesbd.ttf') ? 'C:\\Windows\\Fonts\\timesbd.ttf' : 'Helvetica-Bold');
        const italicFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/timesi.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/timesi.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\timesi.ttf') ? 'C:\\Windows\\Fonts\\timesi.ttf' : 'Helvetica-Oblique');
        const boldItalicFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/timesbi.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/timesbi.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\timesbi.ttf') ? 'C:\\Windows\\Fonts\\timesbi.ttf' : 'Helvetica-Bold');

        doc.registerFont('Times-Regular', regularFont);
        doc.registerFont('Times-Bold', boldFont);
        doc.registerFont('Times-Italic', italicFont);
        doc.registerFont('Times-BoldItalic', boldItalicFont);

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const startX = doc.page.margins.left;
        const startY = doc.page.margins.top;
        const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const halfWidth = contentWidth / 2;

        // --- 1. HEADER 2 CỘT CHUẨN NGHỊ ĐỊNH 30 ---
        // Cột trái: Cơ quan ban hành & Số hiệu
        doc.fontSize(10).font('Times-Bold');
        if (struct.header.superiorAgency && struct.header.superiorAgency.trim().toUpperCase() !== struct.header.issuingAgency.trim().toUpperCase()) {
          doc.font('Times-Regular').text(struct.header.superiorAgency, startX, startY, { width: halfWidth - 10, align: 'center' });
        }
        doc.font('Times-Bold').text(struct.header.issuingAgency, startX, doc.y, { width: halfWidth - 10, align: 'center' });

        // Đường gạch ngắn dưới cơ quan
        const agencyY = doc.y + 2;
        doc.moveTo(startX + (halfWidth - 10) * 0.3, agencyY)
           .lineTo(startX + (halfWidth - 10) * 0.7, agencyY)
           .lineWidth(0.8)
           .strokeColor('#1e293b')
           .stroke();

        doc.moveDown(0.6);
        doc.fontSize(10).font('Times-Regular').text(struct.header.docNumber, startX, doc.y, { width: halfWidth - 10, align: 'center' });

        const leftColBottom = doc.y;

        // Cột phải: Quốc hiệu, Tiêu ngữ, Ngày tháng
        doc.fontSize(10).font('Times-Bold')
           .text(struct.header.nationalMotto, startX + halfWidth, startY, { width: halfWidth, align: 'center' });
        
        doc.fontSize(10.5).font('Times-Bold')
           .text(struct.header.subMotto, startX + halfWidth, doc.y, { width: halfWidth, align: 'center' });

        // Đường kẻ liền dưới tiêu ngữ
        const mottoY = doc.y + 2;
        doc.moveTo(startX + halfWidth + 15, mottoY)
           .lineTo(startX + contentWidth - 15, mottoY)
           .lineWidth(1)
           .strokeColor('#0f172a')
           .stroke();

        doc.moveDown(0.6);
        doc.fontSize(10).font('Times-Italic')
           .text(struct.header.locationAndDate, startX + halfWidth, doc.y, { width: halfWidth, align: 'center' });

        const rightColBottom = doc.y;
        doc.y = Math.max(leftColBottom, rightColBottom) + 20;

        // --- 2. TIÊU ĐỀ & TRÍCH YẾU ---
        doc.fontSize(14).font('Times-Bold')
           .text(struct.title || 'BÁO CÁO', startX, doc.y, { width: contentWidth, align: 'center' });
        doc.moveDown(0.4);

        if (struct.subject) {
          doc.fontSize(12).font('Times-Bold')
             .text(struct.subject, startX, doc.y, { width: contentWidth, align: 'center' });
          doc.moveDown(0.6);
        }

        if (struct.recipientsLine && !/^BÁO CÁO/i.test(struct.title)) {
          doc.fontSize(11).font('Times-BoldItalic')
             .text(struct.recipientsLine, startX, doc.y, { width: contentWidth, align: 'center' });
          doc.moveDown(0.8);
        }

        if (struct.submittingUnit) {
          doc.fontSize(11).font('Times-Bold')
             .text(struct.submittingUnit, startX, doc.y, { width: contentWidth, align: 'left' });
          doc.moveDown(0.6);
        }

        // --- 3. NỘI DUNG VĂN BẢN (BODY) ---
        if (struct.bodyElements.length > 0) {
          struct.bodyElements.forEach(el => {
            if (doc.y > doc.page.height - 90) doc.addPage();

            if (el.type === 'HEADING_1') {
              doc.moveDown(0.5);
              doc.fontSize(11.5).font('Times-Bold').text(el.text, { width: contentWidth, align: 'left' });
              doc.moveDown(0.3);
            } else if (el.type === 'HEADING_2') {
              doc.fontSize(11).font('Times-Bold').text(`   ${el.text}`, { width: contentWidth, align: 'left' });
              doc.moveDown(0.2);
            } else if (el.type === 'SUB_NOTE') {
              doc.fontSize(10.5).font('Times-Italic').text(el.text, { width: contentWidth, align: 'center' });
              doc.moveDown(0.3);
            } else if (el.type === 'LIST_ITEM') {
              doc.fontSize(10.5).font('Times-Regular').text(`    ${el.text}`, { width: contentWidth, align: 'justify', indent: 15 });
              doc.moveDown(0.2);
            } else {
              doc.fontSize(10.5).font('Times-Regular').text(ExecutiveTextCleaner.clean(el.text), { width: contentWidth, align: 'justify', indent: 24 });
              doc.moveDown(0.35);
            }
          });
        } else {
          if (ir.level1_executive_brief?.headline) {
            doc.fontSize(10.5).font('Times-Regular').text(ExecutiveTextCleaner.clean(ir.level1_executive_brief.headline), { width: contentWidth, align: 'justify', indent: 24 });
            doc.moveDown(0.5);
          }
        }

        // --- 4. BẢNG CHỈ SỐ KPI / METRICS NẾU CÓ ---
        const metrics = ir.level2_details?.metrics || [];
        if (metrics.length > 0) {
          if (doc.y > doc.page.height - 120) doc.addPage();
          doc.moveDown(0.8);
          doc.fontSize(11.5).font('Times-Bold').text('CÁC CHỈ SỐ THỐNG KÊ ĐỊNH LƯỢNG GỐC', startX, doc.y, { width: contentWidth, align: 'left' });
          doc.moveDown(0.4);

          // Render Bảng Chỉ Số Chuẩn
          const metricTableData: CoreTable = {
            table_id: 'tbl-metrics-summary',
            table_title: 'Tổng hợp chỉ tiêu định lượng',
            headers: ['STT', 'Tên Chỉ Tiêu / Khoản Mục', 'Thực Hiện / Đạt Được', 'Đơn Vị', 'Trang'],
            rows: metrics.slice(0, 50).map((m, idx) => [
              String(idx + 1),
              m.indicator,
              m.actual || '',
              m.unit || '',
              `Trang ${m.page_ref || 1}`
            ]),
            row_count: metrics.length,
            col_count: 5,
            page_ref: 1,
            evidence_refs: []
          };
          this.renderPdfVectorTable(doc, metricTableData, startX, contentWidth);
        }

        // --- 5. BẢNG BIỂU SỐ LIỆU GỐC (VECTOR TABLES) ---
        const tables = ir.level2_details?.tables || [];
        if (tables.length > 0) {
          if (doc.y > doc.page.height - 120) doc.addPage();
          doc.moveDown(0.8);
          doc.fontSize(11.5).font('Times-Bold').text('BẢNG BIỂU SỐ LIỆU GỐC TRÍCH XUẤT', startX, doc.y, { width: contentWidth, align: 'left' });
          doc.moveDown(0.4);

          tables.forEach((tbl, idx) => {
            if (doc.y > doc.page.height - 100) doc.addPage();
            doc.fontSize(10.5).font('Times-BoldItalic').text(`Bảng ${idx + 1}: ${tbl.table_title || 'Bảng số liệu tổng hợp'} (Trang ${tbl.page_ref || 1})`, startX, doc.y, { width: contentWidth, align: 'left' });
            doc.moveDown(0.3);

            this.renderPdfVectorTable(doc, tbl, startX, contentWidth);
            doc.moveDown(0.6);
          });
        }

        // --- 6. NƠI NHẬN & CHỮ KÝ ---
        if (doc.y > doc.page.height - 140) doc.addPage();
        doc.moveDown(1.5);
        const footerY = doc.y;

        // Cột trái: Nơi nhận
        doc.fontSize(10).font('Times-BoldItalic').text('Nơi nhận:', startX, footerY, { width: halfWidth - 10 });
        doc.fontSize(9.5).font('Times-Regular');
        struct.footer.recipients.forEach(r => {
          doc.text(r.startsWith('-') ? r : `- ${r}`, { width: halfWidth - 10 });
        });

        // Cột phải: Chức vụ & Người ký
        const signerTitles = (struct.footer.signerTitle || 'CHỦ TỊCH').split('\n').map(t => t.trim()).filter(Boolean);
        doc.fontSize(10.5).font('Times-Bold');
        let curSignerY = footerY;
        signerTitles.forEach(st => {
          doc.text(st, startX + halfWidth, curSignerY, { width: halfWidth, align: 'center' });
          curSignerY = doc.y;
        });
        doc.fontSize(9).font('Times-Italic').text('(Ký, đóng dấu)', startX + halfWidth, curSignerY, { width: halfWidth, align: 'center' });
        
        doc.moveDown(3.5);
        if (struct.footer.signerName) {
          doc.fontSize(10.5).font('Times-Bold').text(struct.footer.signerName, startX + halfWidth, doc.y, { width: halfWidth, align: 'center' });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Render chuyên biệt cho văn bản thuần dạng bảng (Phụ lục hành chính khổ ngang Landscape)
   */
  private async renderPureTabular(ir: ExecutiveReportIR, rawFullText?: string): Promise<Buffer> {
    const meta = ir.metadata;
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margins: { top: 35, bottom: 35, left: 56.7, right: 48.0 },
          bufferPages: true,
          autoFirstPage: true
        });

        // Đăng ký Font chữ Times New Roman hỗ trợ đầy đủ Unicode Tiếng Việt
        const regularFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/times.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/times.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\times.ttf') ? 'C:\\Windows\\Fonts\\times.ttf' : 'Helvetica');
        const boldFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/timesbd.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/timesbd.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\timesbd.ttf') ? 'C:\\Windows\\Fonts\\timesbd.ttf' : 'Helvetica-Bold');
        const italicFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/timesi.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/timesi.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\timesi.ttf') ? 'C:\\Windows\\Fonts\\timesi.ttf' : 'Helvetica-Oblique');
        const boldItalicFont = fs.existsSync(path.resolve(process.cwd(), 'assets/fonts/timesbi.ttf'))
          ? path.resolve(process.cwd(), 'assets/fonts/timesbi.ttf')
          : (fs.existsSync('C:\\Windows\\Fonts\\timesbi.ttf') ? 'C:\\Windows\\Fonts\\timesbi.ttf' : 'Helvetica-Bold');

        doc.registerFont('Times-Regular', regularFont);
        doc.registerFont('Times-Bold', boldFont);
        doc.registerFont('Times-Italic', italicFont);
        doc.registerFont('Times-BoldItalic', boldItalicFont);

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const startX = doc.page.margins.left;
        const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        // 1. Số hiệu văn bản (chỉ in căn phải nếu thực sự có dòng số hiệu riêng biệt, không trùng lặp với ghi chú kèm theo)
        const topLines = (rawFullText || '').split('\n').slice(0, 10).map(l => l.trim()).filter(Boolean);
        let docNoLine = '';
        for (const line of topLines) {
          if (/^Số\s*:\s*[0-9a-zA-Z\-_./]+/i.test(line) && !/kèm theo/i.test(line)) {
            docNoLine = line;
            break;
          }
        }
        if (docNoLine) {
          doc.fontSize(10).font('Times-Regular').text(docNoLine, startX, doc.y, { width: contentWidth, align: 'right' });
          doc.moveDown(0.4);
        }

        // 2. Tiêu đề PHỤ LỤC
        doc.fontSize(14).font('Times-Bold').text('PHỤ LỤC', startX, doc.y, { width: contentWidth, align: 'center' });
        doc.moveDown(0.35);

        // 3. Tiêu đề trích yếu & Ghi chú kèm theo
        let mainTitle = meta.document_title || 'BẢNG BIỂU TỔNG HỢP';
        mainTitle = mainTitle.replace(/^PHỤ\s+LỤC\s*[-–—:]?\s*/i, '').trim();

        let attachmentNote = '';
        const attachMatch = mainTitle.match(/(\(Kèm theo[^\)]+\))/i) || (rawFullText || '').match(/(\(Kèm theo[^\n\)]+\))/i);
        if (attachMatch) {
          attachmentNote = attachMatch[1].trim();
          mainTitle = mainTitle.replace(attachMatch[0], '').trim();
        }
        mainTitle = mainTitle.replace(/^[-–—:]\s*/, '').replace(/\s*[-–—:]$/, '').trim();

        doc.fontSize(13).font('Times-Bold').text(mainTitle, startX, doc.y, { width: contentWidth, align: 'center' });
        doc.moveDown(0.35);

        if (attachmentNote) {
          doc.fontSize(11.5).font('Times-Italic').text(attachmentNote, startX, doc.y, { width: contentWidth, align: 'center' });
          doc.moveDown(0.6);
        } else {
          doc.moveDown(0.4);
        }

        // 4. Bảng biểu duy nhất (Master Table)
        const tables = ir.level2_details?.tables || [];
        tables.forEach(tbl => {
          this.renderPdfVectorTable(doc, tbl, startX, contentWidth, true);
          doc.moveDown(0.3);
        });

        // 5. Footnote nếu có ở chân tài liệu
        const rawFootnoteMatches = (rawFullText || '').match(/(?:^|\n)\s*(\d+\s+Thôn\s+Tu\s+Thôn[^\n]+(?:\n[^\n]+)?)/i);
        if (rawFootnoteMatches) {
          if (doc.y > doc.page.height - 40) doc.addPage();
          doc.moveDown(0.3);
          doc.fontSize(8.5).font('Times-Regular').text('————————', startX, doc.y);
          doc.moveDown(0.15);
          doc.fontSize(8.5).font('Times-Regular').text(rawFootnoteMatches[1].trim(), startX, doc.y, { width: contentWidth, align: 'justify', lineGap: 1 });
        }

        // 6. Đánh số trang chuẩn Nghị định 30 (chính giữa lề trên, bắt đầu từ trang 2)
        const pages = doc.bufferedPageRange();
        for (let i = 1; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(11).font('Times-Regular').text(String(i + 1), startX, 18, { width: contentWidth, align: 'center' });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Helper vẽ Bảng Biểu Vector chuẩn xác trong PDFKit
   */
  private renderPdfVectorTable(
    doc: PDFKit.PDFDocument,
    tbl: CoreTable,
    startX: number,
    contentWidth: number,
    repeatHeaderOnNewPage: boolean = false
  ): void {
    const headers = tbl.headers && tbl.headers.length > 0 ? tbl.headers : (tbl.rows?.[0] ? tbl.rows[0].map((_, i) => `Cột ${i + 1}`) : []);
    const rows = tbl.rows || [];
    if (headers.length === 0 && rows.length === 0) return;

    const colWidths = calculateTableColumnWidths(headers, rows, contentWidth);
    const isLandscape = contentWidth > 600;
    const cellPadding = 4;
    const fontSize = isLandscape ? 9.5 : 8.5;

    // Kiểm tra hàng đầu tiên có phải là sub-header (header cấp 2)
    let subHeaders: string[] | null = null;
    let effectiveRows = rows;

    if (rows.length >= 2 && headers.length > 0) {
      const r0 = rows[0];
      const r1 = rows[1];
      const firstCell0 = String(r0[0] || '').trim();
      const firstCell1 = String(r1[0] || '').trim();

      const isSubHeaderCandidate =
        (!firstCell0 || firstCell0 === '-' || firstCell0 === '—') &&
        (Boolean(firstCell1) && !firstCell1.startsWith('-')) &&
        r0.some(c => /^(đơn vị|đvt|số liệu|kế hoạch|thực hiện|tỷ lệ|kết quả|kinh phí|ngân sách|số lượng|ghi chú|tháng|năm|nam|nữ)/i.test(String(c || '').trim()) || (headers.some(h => !h.trim()) && Boolean(c?.trim()))) &&
        r0.every(c => String(c || '').trim().length <= 40);

      if (isSubHeaderCandidate) {
        subHeaders = r0;
        effectiveRows = rows.slice(1);
      }
    }

    const drawHeaderRow = () => {
      if (headers.length === 0) return;
      doc.fontSize(fontSize).font('Times-Bold');

      if (subHeaders) {
        // --- VẼ HEADER ĐA TẦNG (2-TIER HEADER) ---
        let maxH1 = 18;
        let maxH2 = 18;

        for (let i = 0; i < headers.length; i++) {
          const hasSub = Boolean(subHeaders[i]?.trim());
          if (hasSub) {
            let j = i + 1;
            while (j < headers.length && subHeaders[j]?.trim() && !headers[j]?.trim()) j++;
            const spanW = colWidths.slice(i, j).reduce((a, b) => a + b, 0);
            const parentTxt = String(headers[i] || '').trim();
            const h1 = (parentTxt ? doc.heightOfString(parentTxt, { width: spanW - cellPadding * 2, lineGap: 1.5 }) : 14) + cellPadding * 2;
            if (h1 > maxH1) maxH1 = h1;

            for (let k = i; k < j; k++) {
              const subTxt = String(subHeaders[k] || '').trim();
              const h2 = (subTxt ? doc.heightOfString(subTxt, { width: colWidths[k] - cellPadding * 2, lineGap: 1.5 }) : 14) + cellPadding * 2;
              if (h2 > maxH2) maxH2 = h2;
            }
            i = j - 1;
          }
        }

        let totalH = maxH1 + maxH2;
        // Kiểm tra các cột rowspan 2
        for (let i = 0; i < headers.length; i++) {
          if (!subHeaders[i]?.trim()) {
            const h = doc.heightOfString(String(headers[i] || ''), { width: colWidths[i] - cellPadding * 2, lineGap: 1.5 }) + cellPadding * 2;
            if (h > totalH) totalH = h;
          }
        }

        const currentY = doc.y;
        doc.rect(startX, currentY, contentWidth, totalH).fill('#E2E8F0');

        let curX = startX;
        let i = 0;
        while (i < headers.length) {
          if (!subHeaders[i]?.trim()) {
            // Cột đơn không có cấp con (rowspan 2)
            const w = colWidths[i];
            const txt = String(headers[i] || '').trim();
            const txtH = doc.heightOfString(txt, { width: w - cellPadding * 2, lineGap: 1.5 });
            const txtY = currentY + Math.max(cellPadding, (totalH - txtH) / 2);
            doc.fillColor('#0F172A').fontSize(fontSize).font('Times-Bold');
            doc.text(txt, curX + cellPadding, txtY, { width: w - cellPadding * 2, align: 'center', lineGap: 1.5 });
            doc.rect(curX, currentY, w, totalH).lineWidth(0.5).strokeColor('#94A3B8').stroke();
            curX += w;
            i++;
          } else {
            // Cụm cột có header cha và header con
            let j = i + 1;
            while (j < headers.length && subHeaders[j]?.trim() && !headers[j]?.trim()) j++;
            const spanW = colWidths.slice(i, j).reduce((a, b) => a + b, 0);
            const parentTxt = String(headers[i] || '').trim();
            const parentH = doc.heightOfString(parentTxt, { width: spanW - cellPadding * 2, lineGap: 1.5 });
            const parentY = currentY + Math.max(cellPadding, (maxH1 - parentH) / 2);

            // Vẽ tầng 1 (Header Cha gộp cột)
            doc.fillColor('#0F172A').fontSize(fontSize).font('Times-Bold');
            doc.text(parentTxt, curX + cellPadding, parentY, { width: spanW - cellPadding * 2, align: 'center', lineGap: 1.5 });
            doc.rect(curX, currentY, spanW, maxH1).lineWidth(0.5).strokeColor('#94A3B8').stroke();

            // Vẽ tầng 2 (Header Con từng cột)
            let subX = curX;
            for (let k = i; k < j; k++) {
              const subW = colWidths[k];
              const subTxt = String(subHeaders[k] || '').trim();
              const subTxtH = doc.heightOfString(subTxt, { width: subW - cellPadding * 2, lineGap: 1.5 });
              const subTxtY = currentY + maxH1 + Math.max(cellPadding, (maxH2 - subTxtH) / 2);
              doc.fillColor('#0F172A').fontSize(fontSize).font('Times-Bold');
              doc.text(subTxt, subX + cellPadding, subTxtY, { width: subW - cellPadding * 2, align: 'center', lineGap: 1.5 });
              doc.rect(subX, currentY + maxH1, subW, maxH2).lineWidth(0.5).strokeColor('#94A3B8').stroke();
              subX += subW;
            }
            curX += spanW;
            i = j;
          }
        }
        doc.y = currentY + totalH;
      } else {
        // --- VẼ HEADER 1 TẦNG TIÊU CHUẨN ---
        let headerMaxHeight = 16;
        headers.forEach((c, idx) => {
          const w = (colWidths[idx] || 50) - (cellPadding * 2);
          const h = doc.heightOfString(String(c || ''), { width: w, lineGap: 1.5 }) + (cellPadding * 2);
          if (h > headerMaxHeight) headerMaxHeight = h;
        });

        const currentY = doc.y;
        doc.rect(startX, currentY, contentWidth, headerMaxHeight).fill('#E2E8F0');

        let currentX = startX;
        headers.forEach((cellText, idx) => {
          const w = colWidths[idx] || 50;
          const textVal = String(cellText || '').trim();
          doc.fillColor('#0F172A').fontSize(fontSize).font('Times-Bold');
          doc.text(textVal, currentX + cellPadding, currentY + cellPadding, {
            width: w - (cellPadding * 2),
            align: 'center',
            lineGap: 1.5
          });
          doc.rect(currentX, currentY, w, headerMaxHeight).lineWidth(0.5).strokeColor('#94A3B8').stroke();
          currentX += w;
        });

        doc.y = currentY + headerMaxHeight;
      }
    };

    // Xác định quy tắc căn lề đồng nhất cho từng cột (Uniform Column Alignment Invariant)
    const colCount = Math.max(headers.length, (effectiveRows[0] || []).length);
    const colAlignments: ('center' | 'left' | 'right')[] = new Array(colCount).fill('left');

    for (let c = 0; c < colCount; c++) {
      const hText = String(headers[c] || '').trim();
      const subText = subHeaders ? String(subHeaders[c] || '').trim() : '';
      const combined = (hText + ' ' + subText).trim().toLowerCase();

      // Cột STT luôn căn giữa
      if (c === 0 && (colWidths[0] <= 50 || /^(stt|#|số tt|tt)$/i.test(hText))) {
        colAlignments[c] = 'center';
        continue;
      }

      // Cột Đơn vị tính hoặc Trang / Thời gian luôn căn giữa
      if (/^(đơn vị|đvt|đơn vị tính|trang|page|tháng|năm|quý|kỳ)$/i.test(combined)) {
        colAlignments[c] = 'center';
        continue;
      }

      // Cột Thực hiện / Đạt được / Số liệu / Kết quả / Tỷ lệ / Kế hoạch / Số lượng
      if (/^(thực hiện|đạt được|số liệu|kết quả|tỷ lệ|kế hoạch|ước thực hiện|chỉ số|chỉ tiêu số|số lượng)/i.test(combined)) {
        colAlignments[c] = 'center';
        continue;
      }

      // Cột Tên / Nội dung / Ghi chú luôn căn trái
      if (/^(tên|nội dung|chỉ tiêu|khoản mục|ghi chú|note|diễn giải)/i.test(combined)) {
        colAlignments[c] = 'left';
        continue;
      }

      // Phân tích mẫu dữ liệu các hàng nếu tiêu đề không đặc tả
      const sampleCells = effectiveRows.slice(0, 30).map(r => String(r[c] || '').trim()).filter(Boolean);
      const isMostlyQuantity = sampleCells.length > 0 && sampleCells.every(v => /^[0-9.,% -—/()xX]+$/.test(v) && v.length <= 15);
      if (isMostlyQuantity) {
        colAlignments[c] = 'center';
      } else {
        colAlignments[c] = 'left';
      }
    }

    const drawRow = (cells: string[], isHeader: boolean, isTotal: boolean = false, isSectionHeader: boolean = false) => {
      doc.fontSize(fontSize).font(isHeader || isTotal || isSectionHeader ? 'Times-Bold' : 'Times-Regular');
      let maxHeight = 18;
      cells.forEach((c, i) => {
        const w = (colWidths[i] || 50) - (cellPadding * 2);
        const rawCell = isSectionHeader && i > 1 ? '' : String(c || '');
        const h = doc.heightOfString(rawCell, { width: w, lineGap: 1.5 }) + (cellPadding * 2);
        if (h > maxHeight) maxHeight = h;
      });

      if (doc.y + maxHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (repeatHeaderOnNewPage && !isHeader) {
          drawHeaderRow();
        }
      }

      const currentY = doc.y;

      // Nền header, hàng Section hoặc hàng Tổng
      if (isHeader) {
        doc.rect(startX, currentY, contentWidth, maxHeight).fill('#E2E8F0');
      } else if (isSectionHeader) {
        doc.rect(startX, currentY, contentWidth, maxHeight).fill('#F8FAFC');
      } else if (isTotal) {
        doc.rect(startX, currentY, contentWidth, maxHeight).fill('#F1F5F9');
      }

      let currentX = startX;
      cells.forEach((cellText, i) => {
        const w = colWidths[i] || 50;
        const textVal = (isSectionHeader && i > 1) ? '' : String(cellText || '').trim();
        
        let align: 'center' | 'left' | 'right' = colAlignments[i] || 'left';
        if (isHeader) {
          align = 'center';
        } else if (isSectionHeader && i === 1) {
          align = 'left';
        }

        doc.fillColor('#0F172A').fontSize(fontSize).font(isHeader || isTotal || isSectionHeader ? 'Times-Bold' : 'Times-Regular');
        doc.text(textVal, currentX + cellPadding, currentY + cellPadding, {
          width: w - (cellPadding * 2),
          align: align as any,
          lineGap: 1.5
        });

        // Vẽ viền ô (Grid Line)
        doc.rect(currentX, currentY, w, maxHeight).lineWidth(0.5).strokeColor('#94A3B8').stroke();
        currentX += w;
      });

      doc.y = currentY + maxHeight;
    };

    if (headers.length > 0) {
      drawHeaderRow();
    }

    effectiveRows.forEach(r => {
      const firstCell = String(r[0] || '').trim();
      const isSectionHeader = /^[IVXLCDM]+$/i.test(firstCell) || (Boolean(r[1]) && !r[2] && !r[3]);
      const isTotal = firstCell.toLowerCase().includes('tổng') || firstCell.toLowerCase().includes('cộng');
      drawRow(r, false, isTotal, isSectionHeader);
    });

    doc.x = startX;
  }
}
