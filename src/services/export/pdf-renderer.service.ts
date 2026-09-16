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
        if (struct.header.superiorAgency) {
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
          doc.fontSize(11.5).font('Times-Bold').text('CÁC CHỈ SỐ THỐNG KÊ ĐỊNH LƯỢNG GỐC', { align: 'left' });
          doc.moveDown(0.4);

          // Render Bảng Chỉ Số Chuẩn
          const metricTableData: CoreTable = {
            table_id: 'tbl-metrics-summary',
            table_title: 'Tổng hợp chỉ tiêu định lượng',
            headers: ['STT', 'Tên Chỉ Tiêu / Khoản Mục', 'Thực Hiện / Đạt Được', 'Đơn Vị', 'Trang'],
            rows: metrics.slice(0, 50).map((m, idx) => [
              String(idx + 1),
              m.indicator,
              m.actual || '—',
              m.unit || '—',
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
          doc.fontSize(11.5).font('Times-Bold').text('BẢNG BIỂU SỐ LIỆU GỐC TRÍCH XUẤT', { align: 'left' });
          doc.moveDown(0.4);

          tables.forEach((tbl, idx) => {
            if (doc.y > doc.page.height - 100) doc.addPage();
            doc.fontSize(10.5).font('Times-BoldItalic').text(`Bảng ${idx + 1}: ${tbl.table_title || 'Bảng số liệu tổng hợp'} (Trang ${tbl.page_ref || 1})`);
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
   * Helper vẽ Bảng Biểu Vector chuẩn xác trong PDFKit
   */
  private renderPdfVectorTable(doc: PDFKit.PDFDocument, tbl: CoreTable, startX: number, contentWidth: number): void {
    const headers = tbl.headers && tbl.headers.length > 0 ? tbl.headers : (tbl.rows?.[0] ? tbl.rows[0].map((_, i) => `Cột ${i + 1}`) : []);
    const rows = tbl.rows || [];
    if (headers.length === 0 && rows.length === 0) return;

    const colWidths = calculateTableColumnWidths(headers, rows, contentWidth);
    const cellPadding = 4;
    const fontSize = 8.5;

    const drawRow = (cells: string[], isHeader: boolean, isTotal: boolean = false) => {
      doc.fontSize(fontSize).font(isHeader || isTotal ? 'Times-Bold' : 'Times-Regular');
      let maxHeight = 16;
      cells.forEach((c, i) => {
        const w = (colWidths[i] || 50) - (cellPadding * 2);
        const h = doc.heightOfString(String(c || '—'), { width: w }) + (cellPadding * 2);
        if (h > maxHeight) maxHeight = h;
      });

      if (doc.y + maxHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }

      const currentY = doc.y;

      // Nền header hoặc nền hàng Tổng
      if (isHeader) {
        doc.rect(startX, currentY, contentWidth, maxHeight).fill('#E2E8F0');
      } else if (isTotal) {
        doc.rect(startX, currentY, contentWidth, maxHeight).fill('#F1F5F9');
      }

      let currentX = startX;
      cells.forEach((cellText, i) => {
        const w = colWidths[i] || 50;
        const textVal = String(cellText || '—').trim();
        const isNumeric = /^[0-9.,%]+$/.test(textVal);
        const align = i === 0 && (colWidths[0] <= 35) ? 'center' : (isNumeric ? 'right' : (isHeader ? 'center' : 'left'));

        doc.fillColor('#0F172A').fontSize(fontSize).font(isHeader || isTotal ? 'Times-Bold' : 'Times-Regular');
        doc.text(textVal, currentX + cellPadding, currentY + cellPadding, {
          width: w - (cellPadding * 2),
          align: align as any
        });

        // Vẽ viền ô (Grid Line)
        doc.rect(currentX, currentY, w, maxHeight).lineWidth(0.5).strokeColor('#94A3B8').stroke();
        currentX += w;
      });

      doc.y = currentY + maxHeight;
    };

    if (headers.length > 0) {
      drawRow(headers, true);
    }

    rows.slice(0, 100).forEach(r => {
      const firstCell = String(r[0] || '').toLowerCase().trim();
      const isTotal = firstCell.includes('tổng') || firstCell.includes('cộng');
      drawRow(r, false, isTotal);
    });
  }
}
