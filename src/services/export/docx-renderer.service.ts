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
  ShadingType
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
      width: { size: 9638, type: WidthType.DXA },
      columnWidths: [4600, 5038],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4600, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 260 },
                  children: agencyLeftRuns
                })
              ]
            }),
            new TableCell({
              width: { size: 5038, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 260 },
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
    docChildren.push(new Paragraph({ spacing: { after: 200 } }));

    // --- 2. TÊN LOẠI VĂN BẢN & TRÍCH YẾU NỘI DUNG ---
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
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
        spacing: { after: 200 },
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

    if (struct.recipientsLine) {
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
    if (struct.bodyElements.length > 0) {
      for (const el of struct.bodyElements) {
        if (el.type === 'HEADING_1') {
          docChildren.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 120 },
            children: [
              new TextRun({
                text: el.text,
                bold: true,
                size: 28, // 14pt
                font: 'Times New Roman',
                color: '000000'
              })
            ]
          }));
        } else if (el.type === 'HEADING_2') {
          docChildren.push(new Paragraph({
            spacing: { before: 180, after: 80 },
            indent: { left: 360 }, // 0.63cm
            children: [
              new TextRun({
                text: el.text,
                bold: true,
                size: 26,
                font: 'Times New Roman',
                color: '000000'
              })
            ]
          }));
        } else if (el.type === 'LIST_ITEM') {
          docChildren.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 100, line: 300 },
            indent: { left: 720, hanging: 360 },
            children: [
              new TextRun({
                text: el.text,
                size: 26,
                font: 'Times New Roman',
                color: '000000'
              })
            ]
          }));
        } else {
          docChildren.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 120, line: 300 },
            indent: { firstLine: 720 }, // 1.27cm
            children: [
              new TextRun({
                text: ExecutiveTextCleaner.clean(el.text),
                size: 26, // 13pt
                font: 'Times New Roman',
                color: '000000'
              })
            ]
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

    const signerRuns: TextRun[] = [
      new TextRun({ text: struct.footer.signerTitle || 'CHỦ TỊCH', bold: true, size: 26, font: 'Times New Roman' }),
      new TextRun({ break: 1 }),
      new TextRun({ text: '(Ký, đóng dấu)', italics: true, size: 20, font: 'Times New Roman' }),
      new TextRun({ break: 1 }),
      new TextRun({ break: 1 }),
      new TextRun({ break: 1 }),
      new TextRun({ break: 1 }),
      new TextRun({ text: struct.footer.signerName || '', bold: true, size: 26, font: 'Times New Roman' })
    ];

    const footerTable = new Table({
      width: { size: 9638, type: WidthType.DXA },
      columnWidths: [4600, 5038],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4600, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { line: 240 },
                  children: recipientRuns
                })
              ]
            }),
            new TableCell({
              width: { size: 5038, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 260 },
                  children: signerRuns
                })
              ]
            })
          ]
        })
      ]
    });

    docChildren.push(new Paragraph({ spacing: { before: 300 } }));
    docChildren.push(footerTable);

    // Khởi tạo Document với lề chuẩn Nghị định 30 (Trái 2.5cm, Phải 2.0cm, Trên 2.0cm, Dưới 2.0cm)
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1134,    // 2.0 cm
              bottom: 1134, // 2.0 cm
              left: 1417,   // 2.5 cm
              right: 1134   // 2.0 cm
            }
          }
        },
        children: docChildren
      }]
    });

    return await Packer.toBuffer(doc);
  }
}
