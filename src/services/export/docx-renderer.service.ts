import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
  Header,
  PageNumber,
  FootnoteReferenceRun
} from 'docx';
import { ExecutiveReportIR } from '../../schemas/report-ir.schema.js';
import { AdministrativeDocumentFormatterService } from '../administrative-document-formatter.service.js';
import { ExecutiveTextCleaner, calculateTableColumnWidths } from './text-cleaner.js';

/**
 * Renderer chuyên biệt xuất file Microsoft Word (.docx) Chuẩn Nghị Định 30/2020/NĐ-CP
 */
export class DocxRendererService {
  async render(ir: ExecutiveReportIR, rawFullText?: string): Promise<Buffer> {
    const meta = ir.metadata;
    const struct = AdministrativeDocumentFormatterService.parseDocumentStructure(
      rawFullText || meta.document_title || '',
      meta
    );

    const docChildren: (Paragraph | Table)[] = [];

    // --- 1. KHỐI TIÊU ĐỀ 2 CỘT (HEADER TABLE) THEO NGHỊ ĐỊNH 30 ---
    const agencyLeftRuns: TextRun[] = [];
    if (struct.header.superiorAgency) {
      agencyLeftRuns.push(new TextRun({ text: struct.header.superiorAgency, size: 24, font: 'Times New Roman' }));
      agencyLeftRuns.push(new TextRun({ break: 1 }));
    }
    agencyLeftRuns.push(new TextRun({ text: struct.header.issuingAgency, bold: true, size: 24, font: 'Times New Roman' }));
    agencyLeftRuns.push(new TextRun({ break: 1 }));
    agencyLeftRuns.push(new TextRun({ text: '————————', bold: true, size: 16, font: 'Times New Roman' }));
    agencyLeftRuns.push(new TextRun({ break: 1 }));
    agencyLeftRuns.push(new TextRun({ text: struct.header.docNumber, size: 24, font: 'Times New Roman' }));

    const mottoRightRuns: TextRun[] = [
      new TextRun({ text: struct.header.nationalMotto, bold: true, size: 24, font: 'Times New Roman' }),
      new TextRun({ break: 1 }),
      new TextRun({ text: struct.header.subMotto, bold: true, size: 26, font: 'Times New Roman' }),
      new TextRun({ break: 1 }),
      new TextRun({ text: '————————————', bold: true, size: 18, font: 'Times New Roman' }),
      new TextRun({ break: 1 }),
      new TextRun({ text: struct.header.locationAndDate, italics: true, size: 26, font: 'Times New Roman' })
    ];

    const headerTable = new Table({
      width: { size: 9145, type: WidthType.DXA },
      columnWidths: [4250, 4895],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4250, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 240, after: 0 },
                  children: agencyLeftRuns
                })
              ]
            }),
            new TableCell({
              width: { size: 4895, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 240, after: 0 },
                  children: mottoRightRuns
                })
              ]
            })
          ]
        })
      ]
    });

    docChildren.push(headerTable);

    // Khoảng cách sau tiêu đề đầu trang
    docChildren.push(new Paragraph({ spacing: { after: 140 } }));

    // --- 2. TÊN LOẠI VĂN BẢN & TRÍCH YẾU NỘI DUNG ---
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 140, after: 80, line: 240 },
      children: [
        new TextRun({
          text: struct.title || 'BÁO CÁO',
          bold: true,
          size: 30, // 15pt
          font: 'Times New Roman'
        })
      ]
    }));

    if (struct.subject) {
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160, line: 240 },
        children: [
          new TextRun({
            text: struct.subject,
            bold: true,
            size: 28, // 14pt
            font: 'Times New Roman'
          })
        ]
      }));
    }

    if (struct.recipientsLine && !/^BÁO CÁO/i.test(struct.title)) {
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 250 },
        children: [
          new TextRun({
            text: struct.recipientsLine,
            bold: true,
            italics: true,
            size: 26, // 13pt
            font: 'Times New Roman'
          })
        ]
      }));
    }

    if (struct.submittingUnit) {
      docChildren.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: struct.submittingUnit,
            bold: true,
            size: 26,
            font: 'Times New Roman'
          })
        ]
      }));
    }

    // --- 3. NỘI DUNG THÂN VĂN BẢN (BODY PARAGRAPHS & SECTIONS) ---
    // Khởi tạo bộ gom chú thích chân trang chuẩn Word (Native Word Footnotes Container)
    // Đưa toàn bộ FOOTNOTE về vùng chân trang (Footnote Container w:footnote) thay vì chèn vào giữa trang
    const docxFootnotes: Record<number, { children: Paragraph[] }> = {};
    let currentFootnoteId = 0;
    const targetToFns = new Map<number, Array<{ fnId: number; marker: string }>>();

    if (struct.bodyElements.length > 0) {
      struct.bodyElements.forEach((el, idx) => {
        if (el.type === 'FOOTNOTE') {
          currentFootnoteId++;
          const fnId = currentFootnoteId;
          const markerMatch = el.text.match(/^(\*?\d+|\[\d+\]|\(\*\)|\*)/);
          const marker = markerMatch ? markerMatch[1].replace(/\D/g, '') : '';

          // Tìm phần tử thân bài (HEADING, PARAGRAPH hoặc LIST_ITEM) trước đó chứa ký hiệu dẫn nguồn
          let targetElIdx = -1;
          for (let j = idx - 1; j >= Math.max(0, idx - 30); j--) {
            const cand = struct.bodyElements[j];
            if (cand.type !== 'FOOTNOTE') {
              const regex = new RegExp('(?:([\\p{L}\\)]|\\d{4})' + (marker || '\\d') + '|\\s*\\[\\s*' + (marker || '\\d') + '\\s*\\]|\\s*\\(\\s*' + (marker || '\\d') + '\\s*\\))([.,;:]|\\s|$)', 'u');
              if (regex.test(cand.text)) {
                targetElIdx = j;
                break;
              }
            }
          }
          if (targetElIdx === -1) {
            for (let j = idx - 1; j >= 0; j--) {
              if (struct.bodyElements[j].type !== 'FOOTNOTE') {
                targetElIdx = j;
                break;
              }
            }
          }

          if (targetElIdx >= 0) {
            if (!targetToFns.has(targetElIdx)) targetToFns.set(targetElIdx, []);
            targetToFns.get(targetElIdx)!.push({ fnId, marker });
          }

          const fLines = el.text.split('\n').map(l => l.trim()).filter(Boolean);
          const fnParagraphs: Paragraph[] = [];
          for (let lIdx = 0; lIdx < fLines.length; lIdx++) {
            let lineText = fLines[lIdx];
            if (lIdx === 0) {
              // Loại bỏ số hoặc ký hiệu đầu dòng vì Word đã tự động đánh số chú thích dạng chỉ số trên
              lineText = lineText.replace(/^(\*?\d+|\[\d+\]|\(\*\)|\*)\s*[-–—]?\s*/, '');
            }
            fnParagraphs.push(new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 0, after: 15, line: 200 },
              children: [
                new TextRun({
                  text: ExecutiveTextCleaner.clean(lineText),
                  italics: true,
                  size: 16, // 8.0pt chuẩn theo văn bản gốc và Nghị định 30/2020/NĐ-CP
                  font: 'Times New Roman',
                  color: '000000'
                })
              ]
            }));
          }

          docxFootnotes[fnId] = {
            children: fnParagraphs
          };
        }
      });
    }

    const buildRunsWithFootnotes = (
      rawText: string,
      fns: Array<{ fnId: number; marker: string }>,
      baseSize: number = 26,
      bold: boolean = false
    ): (TextRun | FootnoteReferenceRun)[] => {
      let remainingText = ExecutiveTextCleaner.clean(rawText);
      const runs: (TextRun | FootnoteReferenceRun)[] = [];
      const unattached: Array<{ fnId: number; marker: string }> = [];

      for (const fn of fns) {
        if (!fn.marker) {
          unattached.push(fn);
          continue;
        }
        const m = fn.marker;
        const reg = new RegExp('(?:([\\p{L}\\)]|\\d{4})' + m + '|\\s*\\[\\s*' + m + '\\s*\\]|\\s*\\(\\s*' + m + '\\s*\\))([.,;:]|\\s|$)', 'u');
        const match = remainingText.match(reg);
        if (match && match.index !== undefined) {
          const matchStart = match.index;
          const wordChar = match[1] || '';
          const punct = match[2];
          const before = remainingText.slice(0, matchStart) + wordChar;
          if (before) {
            runs.push(new TextRun({ text: before, bold, size: baseSize, font: 'Times New Roman', color: '000000' }));
          }
          runs.push(new FootnoteReferenceRun(fn.fnId));
          remainingText = punct + remainingText.slice(matchStart + match[0].length);
        } else {
          unattached.push(fn);
        }
      }

      if (remainingText) {
        runs.push(new TextRun({ text: remainingText, bold, size: baseSize, font: 'Times New Roman', color: '000000' }));
      }

      for (const fn of unattached) {
        runs.push(new FootnoteReferenceRun(fn.fnId));
      }

      return runs;
    };

    if (struct.bodyElements.length > 0) {
      for (let elIdx = 0; elIdx < struct.bodyElements.length; elIdx++) {
        const el = struct.bodyElements[elIdx];
        const assignedFns = targetToFns.get(elIdx) || [];

        if (el.type === 'FOOTNOTE') {
          // Bỏ qua không chèn vào body: Word sẽ tự động neo phần chú thích này ở chân trang tương ứng
          continue;
        } else if (el.type === 'HEADING_1') {
          const runs = assignedFns.length > 0
            ? buildRunsWithFootnotes(el.text, assignedFns, 28, true)
            : [new TextRun({ text: el.text, bold: true, size: 28, font: 'Times New Roman', color: '000000' })];
          docChildren.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 140, after: 60, line: 250 },
            children: runs
          }));
        } else if (el.type === 'HEADING_2') {
          const runs = assignedFns.length > 0
            ? buildRunsWithFootnotes(el.text, assignedFns, 26, true)
            : [new TextRun({ text: el.text, bold: true, size: 26, font: 'Times New Roman', color: '000000' })];
          docChildren.push(new Paragraph({
            spacing: { before: 100, after: 30, line: 250 },
            indent: { left: 360 }, // 0.63cm
            children: runs
          }));
        } else if (el.type === 'SUB_NOTE') {
          docChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 100, line: 250 },
            children: [
              new TextRun({
                text: el.text,
                italics: true,
                size: 24, // 12pt
                font: 'Times New Roman',
                color: '333333'
              })
            ]
          }));
        } else if (el.type === 'LIST_ITEM') {
          const runs = assignedFns.length > 0
            ? buildRunsWithFootnotes(el.text, assignedFns, 26)
            : [new TextRun({ text: el.text, size: 26, font: 'Times New Roman', color: '000000' })];
          docChildren.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 15, line: 250 },
            indent: { left: 720, hanging: 360 },
            children: runs
          }));
        } else {
          const runs = assignedFns.length > 0
            ? buildRunsWithFootnotes(el.text, assignedFns, 26)
            : [new TextRun({ text: ExecutiveTextCleaner.clean(el.text), size: 26, font: 'Times New Roman', color: '000000' })];
          const isConcluding = elIdx === struct.bodyElements.length - 1 || el.text.includes('Trên đây là Báo cáo');
          docChildren.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 20, line: 250 },
            indent: { firstLine: 720 }, // 1.27cm
            keepNext: isConcluding,
            children: runs
          }));
        }
      }
    } else {
      // Fallback nếu không có raw body: render từ IR details
      if (ir.level1_executive_brief?.headline) {
        docChildren.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 150, line: 300 },
          indent: { firstLine: 720 },
          children: [new TextRun({ text: ExecutiveTextCleaner.clean(ir.level1_executive_brief.headline), size: 26, font: 'Times New Roman' })]
        }));
      }
    }

    // --- 4. CÁC CHỈ SỐ THỐNG KÊ ĐỊNH LƯỢNG GỐC (METRICS) ---
    const metrics = ir.level2_details?.metrics || [];
    if (metrics.length > 0) {
      docChildren.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: 'CÁC CHỈ SỐ THỐNG KÊ ĐỊNH LƯỢNG GỐC', bold: true, size: 28, font: 'Times New Roman' })]
      }));

      metrics.forEach((m, idx) => {
        docChildren.push(new Paragraph({
          spacing: { after: 80, line: 280 },
          indent: { left: 720, hanging: 360 },
          children: [
            new TextRun({
              text: `${idx + 1}. ${m.indicator}: ${m.actual || '—'} ${m.unit || ''} (Trang ${m.page_ref || 1})`,
              size: 26,
              font: 'Times New Roman'
            })
          ]
        }));
      });
    }

    // --- 5. BẢNG BIỂU SỐ LIỆU GỐC (STRUCTURED TABLES) ---
    const tables = ir.level2_details?.tables || [];
    if (tables.length > 0) {
      docChildren.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
        children: [new TextRun({ text: 'BẢNG BIỂU SỐ LIỆU GỐC TRÍCH XUẤT', bold: true, size: 28, font: 'Times New Roman' })]
      }));

      tables.forEach((tbl, tIdx) => {
        docChildren.push(new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: `Bảng ${tIdx + 1}: ${tbl.table_title || 'Bảng số liệu tổng hợp'} (Trang ${tbl.page_ref || 1})`,
              bold: true,
              italics: true,
              size: 24,
              font: 'Times New Roman'
            })
          ]
        }));

        const headers = tbl.headers || [];
        const rows = tbl.rows || [];
        const colWidths = calculateTableColumnWidths(headers, rows, 9638);

        const tableRows: TableRow[] = [];

        // Header Row
        if (headers.length > 0) {
          tableRows.push(new TableRow({
            children: headers.map((h, cIdx) => new TableCell({
              width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
              shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: h, bold: true, size: 22, font: 'Times New Roman' })]
                })
              ]
            }))
          }));
        }

        // Data Rows
        (rows || []).slice(0, 100).forEach(row => {
          const firstCell = String(row[0] || '').toLowerCase().trim();
          const isTotalRow = firstCell.includes('tổng') || firstCell.includes('cộng');

          tableRows.push(new TableRow({
            children: row.map((cell, cIdx) => {
              const textVal = String(cell || '—').trim();
              const isNumeric = /^[0-9.,%]+$/.test(textVal);
              const align = cIdx === 0 && (colWidths[0] <= 800) ? AlignmentType.CENTER : (isNumeric ? AlignmentType.RIGHT : AlignmentType.LEFT);

              return new TableCell({
                width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
                shading: isTotalRow ? { fill: 'F1F5F9', type: ShadingType.CLEAR } : undefined,
                children: [
                  new Paragraph({
                    alignment: align,
                    children: [new TextRun({
                      text: textVal,
                      bold: isTotalRow,
                      size: 22,
                      font: 'Times New Roman'
                    })]
                  })
                ]
              });
            })
          }));
        });

        docChildren.push(new Table({
          width: { size: 9638, type: WidthType.DXA },
          columnWidths: colWidths,
          rows: tableRows
        }));
      });
    }

    // --- 6. KHỐI KẾT THÚC: NƠI NHẬN & CHỮ KÝ (FOOTER TABLE) ---
    const recipientRuns: TextRun[] = [
      new TextRun({ text: 'Nơi nhận:', bold: true, italics: true, size: 24, font: 'Times New Roman' }),
      new TextRun({ break: 1 })
    ];

    struct.footer.recipients.forEach(r => {
      recipientRuns.push(new TextRun({ text: r.startsWith('-') ? r : `- ${r}`, size: 22, font: 'Times New Roman' }));
      recipientRuns.push(new TextRun({ break: 1 }));
    });

    const signerRuns: TextRun[] = [];
    const signerTitles = (struct.footer.signerTitle || 'CHỦ TỊCH').split('\n').map(t => t.trim()).filter(Boolean);
    signerTitles.forEach(st => {
      signerRuns.push(new TextRun({ text: st, bold: true, size: 26, font: 'Times New Roman' }));
      signerRuns.push(new TextRun({ break: 1 }));
    });
    signerRuns.push(new TextRun({ text: '(Ký, đóng dấu)', italics: true, size: 20, font: 'Times New Roman' }));
    signerRuns.push(new TextRun({ break: 1 }));
    signerRuns.push(new TextRun({ break: 1 }));
    signerRuns.push(new TextRun({ break: 1 }));
    signerRuns.push(new TextRun({ break: 1 }));
    if (struct.footer.signerName) {
      signerRuns.push(new TextRun({ text: struct.footer.signerName, bold: true, size: 26, font: 'Times New Roman' }));
    }

    const footerTable = new Table({
      width: { size: 9145, type: WidthType.DXA },
      columnWidths: [4250, 4895],
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: 4250, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { line: 240, after: 0 },
                  children: recipientRuns
                })
              ]
            }),
            new TableCell({
              width: { size: 4895, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 240, after: 0 },
                  children: signerRuns
                })
              ]
            })
          ]
        })
      ]
    });

    docChildren.push(new Paragraph({ spacing: { before: 200 } }));
    docChildren.push(footerTable);

    // Khởi tạo Document với lề chuẩn Nghị định 30 (Trái 3.0cm, Phải 1.87cm, Trên 1.8cm, Dưới 2.0cm khớp nguyên gốc PDF)
    // Đánh số trang chuẩn Nghị định 30: Đặt canh giữa lề trên, font Times New Roman 13pt đứng, không hiển thị ở trang thứ nhất
    // Chú thích chân trang chuẩn Word (Native Word Footnotes): neo trực tiếp tại chân trang của trang tương ứng
    const doc = new Document({
      footnotes: Object.keys(docxFootnotes).length > 0 ? docxFootnotes : undefined,
      sections: [{
        properties: {
          titlePage: true, // Không hiển thị số trang ở trang thứ nhất theo NĐ 30
          page: {
            margin: {
              top: 1020,    // 1.80 cm
              bottom: 1134, // 2.00 cm
              left: 1701,   // 3.00 cm chuẩn khớp PDF gốc
              right: 1060   // 1.87 cm chuẩn khớp PDF gốc
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 26, // 13pt
                    font: 'Times New Roman'
                  })
                ]
              })
            ]
          }),
          first: new Header({
            children: [] // Trang thứ nhất không hiển thị số trang
          })
        },
        children: docChildren
      }]
    });

    return await Packer.toBuffer(doc);
  }
}
