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
  PageOrientation,
  FootnoteReferenceRun,
  VerticalMergeType
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

    const isPureTabular = meta.document_type === 'PHU_LUC' ||
      Boolean(meta.is_pure_table) ||
      (rawFullText && /^\s*phụ\s+lục\b/i.test(rawFullText.trim())) ||
      (rawFullText && /PHỤ LỤC/i.test(meta.document_title) && !rawFullText.includes('CỘNG HÒA XÃ HỘI'));

    if (isPureTabular) {
      // 1. Số hiệu văn bản (chỉ in căn phải nếu thực sự có dòng số hiệu riêng biệt, không trùng lặp với ghi chú kèm theo)
      const rawP1 = (rawFullText || '').substring(0, 1000);
      let docNoLine = '';
      const topLines = (rawFullText || '').split('\n').slice(0, 10).map(l => l.trim()).filter(Boolean);
      for (const line of topLines) {
        if (/^Số\s*:\s*[0-9a-zA-Z\-_./]+/i.test(line) && !/kèm theo/i.test(line)) {
          docNoLine = line;
          break;
        }
      }
      if (docNoLine) {
        docChildren.push(new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: docNoLine.startsWith('Số') ? docNoLine : `Số: ${docNoLine}`,
              italics: false,
              size: 22, // 11pt
              font: 'Times New Roman'
            })
          ]
        }));
      }

      // 2. Tiêu đề PHỤ LỤC
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 60, line: 240 },
        children: [
          new TextRun({
            text: 'PHỤ LỤC',
            bold: true,
            size: 28, // 14pt
            font: 'Times New Roman'
          })
        ]
      }));

      // 3. Tiêu đề trích yếu & Ghi chú kèm theo
      let mainTitle = meta.document_title || 'BẢNG BIỂU TỔNG HỢP';
      mainTitle = mainTitle.replace(/^PHỤ\s+LỤC\s*[-–—:]?\s*/i, '').trim();

      let attachmentNote = '';
      const attachMatch = mainTitle.match(/(\(Kèm theo[^\)]+\))/i) || (rawP1 || '').match(/(\(Kèm theo[^\n\)]+\))/i);
      if (attachMatch) {
        attachmentNote = attachMatch[1].trim();
        mainTitle = mainTitle.replace(attachMatch[0], '').trim();
      }
      mainTitle = mainTitle.replace(/^[-–—:]\s*/, '').replace(/\s*[-–—:]$/, '').trim();

      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60, line: 240 },
        children: [
          new TextRun({
            text: mainTitle,
            bold: true,
            size: 28, // 14pt
            font: 'Times New Roman'
          })
        ]
      }));

      if (attachmentNote) {
        docChildren.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 180, line: 240 },
          children: [
            new TextRun({
              text: attachmentNote,
              italics: true,
              size: 26, // 13pt
              font: 'Times New Roman'
            })
          ]
        }));
      }

      // 4. Bảng biểu duy nhất (Master Table) khổ ngang Landscape
      const totalTableWidthDxa = 14570;
      const tables = ir.level2_details?.tables || [];
      for (const tbl of tables) {
        const headers = tbl.headers || [];
        const rows = tbl.rows || [];
        if (headers.length === 0 && rows.length === 0) continue;

        const colWidths = calculateTableColumnWidths(headers, rows, totalTableWidthDxa);

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

        const tableRows: TableRow[] = [];

        // Header Rows (2 tầng hoặc 1 tầng)
        if (headers.length > 0) {
          if (subHeaders) {
            // Tầng 1
            const tier1Cells: TableCell[] = [];
            let i = 0;
            while (i < headers.length) {
              if (!subHeaders[i]?.trim()) {
                tier1Cells.push(new TableCell({
                  width: { size: colWidths[i] || 1500, type: WidthType.DXA },
                  verticalMerge: VerticalMergeType.RESTART,
                  shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 80, after: 80, line: 240 },
                      children: [new TextRun({ text: headers[i] || '', bold: true, size: 22, font: 'Times New Roman' })]
                    })
                  ]
                }));
                i++;
              } else {
                let j = i + 1;
                while (j < headers.length && subHeaders[j]?.trim() && !headers[j]?.trim()) j++;
                const span = j - i;
                const spanWidth = colWidths.slice(i, j).reduce((a, b) => a + b, 0);
                tier1Cells.push(new TableCell({
                  width: { size: spanWidth, type: WidthType.DXA },
                  columnSpan: span,
                  shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 80, after: 80, line: 240 },
                      children: [new TextRun({ text: headers[i] || '', bold: true, size: 22, font: 'Times New Roman' })]
                    })
                  ]
                }));
                i = j;
              }
            }
            tableRows.push(new TableRow({ tableHeader: true, cantSplit: true, children: tier1Cells }));

            // Tầng 2
            const tier2Cells: TableCell[] = [];
            for (let cIdx = 0; cIdx < headers.length; cIdx++) {
              if (!subHeaders[cIdx]?.trim()) {
                tier2Cells.push(new TableCell({
                  width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
                  verticalMerge: VerticalMergeType.CONTINUE,
                  shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
                  },
                  children: []
                }));
              } else {
                tier2Cells.push(new TableCell({
                  width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
                  shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 80, after: 80, line: 240 },
                      children: [new TextRun({ text: subHeaders[cIdx] || '', bold: true, size: 22, font: 'Times New Roman' })]
                    })
                  ]
                }));
              }
            }
            tableRows.push(new TableRow({ tableHeader: true, cantSplit: true, children: tier2Cells }));
          } else {
            tableRows.push(new TableRow({
              tableHeader: true,
              cantSplit: true,
              children: headers.map((h, cIdx) => new TableCell({
                width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
                shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
                },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 80, after: 80, line: 240 },
                    children: [new TextRun({ text: h, bold: true, size: 22, font: 'Times New Roman' })]
                  })
                ]
              }))
            }));
          }
        }

        // Data Rows
        for (const row of effectiveRows) {
          const firstCell = String(row[0] || '').trim();
          const isSectionHeader = /^[IVXLCDM]+$/i.test(firstCell) || (row[1] && !row[2] && !row[3]);
          const isTotalRow = firstCell.toLowerCase().includes('tổng') || firstCell.toLowerCase().includes('cộng');

          tableRows.push(new TableRow({
            cantSplit: true,
            children: row.map((cell, cIdx) => {
              const cellRaw = String(cell || '').trim();
              const isNumeric = /^[0-9.,%]+$/.test(cellRaw);
              const align = cIdx === 0 ? AlignmentType.CENTER : (isNumeric ? AlignmentType.RIGHT : AlignmentType.LEFT);

              const paras: Paragraph[] = [];
              const lines = cellRaw.split('\n').map(l => l.trim()).filter(Boolean);
              if (lines.length === 0) {
                paras.push(new Paragraph({
                  children: [new TextRun({ text: '', size: 22, font: 'Times New Roman' })]
                }));
              } else {
                lines.forEach((line, lIdx) => {
                  const isBullet = /^[-*•+]/.test(line);
                  paras.push(new Paragraph({
                    alignment: isSectionHeader && cIdx === 1 ? AlignmentType.LEFT : (align === AlignmentType.RIGHT ? AlignmentType.RIGHT : (cIdx === 0 ? AlignmentType.CENTER : AlignmentType.JUSTIFIED)),
                    indent: isBullet ? { left: 240, hanging: 240 } : undefined,
                    spacing: {
                      before: lIdx === 0 ? 40 : 15,
                      after: lIdx === lines.length - 1 ? 40 : 15,
                      line: 230
                    },
                    children: [
                      new TextRun({
                        text: line,
                        bold: isSectionHeader || isTotalRow,
                        size: 22, // 11pt
                        font: 'Times New Roman'
                      })
                    ]
                  }));
                });
              }

              return new TableCell({
                width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
                shading: isSectionHeader ? { fill: 'F8FAFC', type: ShadingType.CLEAR } : (isTotalRow ? { fill: 'F1F5F9', type: ShadingType.CLEAR } : undefined),
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
                },
                children: paras
              });
            })
          }));
        }

        docChildren.push(new Table({
          width: { size: totalTableWidthDxa, type: WidthType.DXA },
          columnWidths: colWidths,
          rows: tableRows
        }));
      }

      // Footnote nếu có ở chân tài liệu
      const rawFootnoteMatches = (rawFullText || '').match(/(?:^|\n)\s*(\d+\s+Thôn\s+Tu\s+Thôn[^\n]+(?:\n[^\n]+)?)/i);
      if (rawFootnoteMatches) {
        docChildren.push(new Paragraph({
          spacing: { before: 180, after: 60, line: 200 },
          indent: { firstLine: 360 },
          children: [
            new TextRun({
              text: '————————',
              size: 16,
              font: 'Times New Roman'
            }),
            new TextRun({ break: 1 }),
            new TextRun({
              text: rawFootnoteMatches[1].trim(),
              size: 16, // 8pt
              font: 'Times New Roman'
            })
          ]
        }));
      }

      const doc = new Document({
        sections: [{
          properties: {
            titlePage: true,
            page: {
              size: {
                orientation: PageOrientation.LANDSCAPE,
                width: 16838,
                height: 11906
              },
              margin: {
                top: 1000,
                bottom: 1000,
                left: 1134,
                right: 1134
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
                      size: 26,
                      font: 'Times New Roman'
                    })
                  ]
                })
              ]
            }),
            first: new Header({ children: [] })
          },
          children: docChildren
        }]
      });

      return await Packer.toBuffer(doc);
    }

    // --- 1. KHỐI TIÊU ĐỀ 2 CỘT (HEADER TABLE) THEO NGHỊ ĐỊNH 30 ---
    const agencyLeftRuns: TextRun[] = [];
    if (struct.header.superiorAgency && struct.header.superiorAgency.trim().toUpperCase() !== struct.header.issuingAgency.trim().toUpperCase()) {
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

    const colLeft = 3600;
    const colRight = 5545;

    const headerTable = new Table({
      width: { size: 9145, type: WidthType.DXA },
      columnWidths: [colLeft, colRight],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: colLeft, type: WidthType.DXA },
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
              width: { size: colRight, type: WidthType.DXA },
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
              // Loại bỏ số hoặc ký hiệu đầu dòng vì Word đã tự động đánh số chú thích dạng chỉ số trên, giữ lại gạch đầu dòng bullet nếu có
              lineText = lineText.replace(/^(\*?\d+|\[\d+\]|\(\*\)|\*)[.:]?\s*/, '');
            }
            fnParagraphs.push(new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              indent: { firstLine: 360 }, // Thụt đầu dòng 0.63cm chuẩn Word và bố cục văn bản gốc
              spacing: { before: 0, after: 15, line: 200 },
              children: [
                new TextRun({
                  text: ExecutiveTextCleaner.clean(lineText),
                  italics: false, // Chữ đứng bình thường theo đúng bản gốc
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
              text: `${idx + 1}. ${m.indicator}: ${[m.actual, m.unit].filter(Boolean).join(' ') || ''} (Trang ${m.page_ref || 1})`.replace(/\s{2,}/g, ' '),
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

        // Kiểm tra sub-header
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

        const tableRows: TableRow[] = [];

        // Header Rows (2 tầng hoặc 1 tầng)
        if (headers.length > 0) {
          if (subHeaders) {
            // Tầng 1
            const tier1Cells: TableCell[] = [];
            let i = 0;
            while (i < headers.length) {
              if (!subHeaders[i]?.trim()) {
                tier1Cells.push(new TableCell({
                  width: { size: colWidths[i] || 1500, type: WidthType.DXA },
                  verticalMerge: VerticalMergeType.RESTART,
                  shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: headers[i] || '', bold: true, size: 22, font: 'Times New Roman' })]
                    })
                  ]
                }));
                i++;
              } else {
                let j = i + 1;
                while (j < headers.length && subHeaders[j]?.trim() && !headers[j]?.trim()) j++;
                const span = j - i;
                const spanWidth = colWidths.slice(i, j).reduce((a, b) => a + b, 0);
                tier1Cells.push(new TableCell({
                  width: { size: spanWidth, type: WidthType.DXA },
                  columnSpan: span,
                  shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: headers[i] || '', bold: true, size: 22, font: 'Times New Roman' })]
                    })
                  ]
                }));
                i = j;
              }
            }
            tableRows.push(new TableRow({ children: tier1Cells }));

            // Tầng 2
            const tier2Cells: TableCell[] = [];
            for (let cIdx = 0; cIdx < headers.length; cIdx++) {
              if (!subHeaders[cIdx]?.trim()) {
                tier2Cells.push(new TableCell({
                  width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
                  verticalMerge: VerticalMergeType.CONTINUE,
                  shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
                  children: []
                }));
              } else {
                tier2Cells.push(new TableCell({
                  width: { size: colWidths[cIdx] || 1500, type: WidthType.DXA },
                  shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: subHeaders[cIdx] || '', bold: true, size: 22, font: 'Times New Roman' })]
                    })
                  ]
                }));
              }
            }
            tableRows.push(new TableRow({ children: tier2Cells }));
          } else {
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
        }

        const docxColCount = Math.max(headers.length, (effectiveRows[0] || []).length);
        const docxColAlignments: ((typeof AlignmentType)[keyof typeof AlignmentType])[] = new Array(docxColCount).fill(AlignmentType.LEFT);

        for (let c = 0; c < docxColCount; c++) {
          const hText = String(headers[c] || '').trim();
          const subText = subHeaders ? String(subHeaders[c] || '').trim() : '';
          const combined = (hText + ' ' + subText).trim().toLowerCase();

          if (c === 0 && (colWidths[0] <= 800 || /^(stt|#|số tt|tt)$/i.test(hText))) {
            docxColAlignments[c] = AlignmentType.CENTER;
            continue;
          }
          if (/^(đơn vị|đvt|đơn vị tính|trang|page|tháng|năm|quý|kỳ)$/i.test(combined)) {
            docxColAlignments[c] = AlignmentType.CENTER;
            continue;
          }
          if (/^(thực hiện|đạt được|số liệu|kết quả|tỷ lệ|kế hoạch|ước thực hiện|chỉ số|chỉ tiêu số|số lượng)/i.test(combined)) {
            docxColAlignments[c] = AlignmentType.CENTER;
            continue;
          }
          if (/^(tên|nội dung|chỉ tiêu|khoản mục|ghi chú|note|diễn giải)/i.test(combined)) {
            docxColAlignments[c] = AlignmentType.LEFT;
            continue;
          }
          const sampleCells = effectiveRows.slice(0, 30).map(r => String(r[c] || '').trim()).filter(Boolean);
          const isMostlyQuantity = sampleCells.length > 0 && sampleCells.every(v => /^[0-9.,% -—/()xX]+$/.test(v) && v.length <= 15);
          docxColAlignments[c] = isMostlyQuantity ? AlignmentType.CENTER : AlignmentType.LEFT;
        }

        // Data Rows
        (effectiveRows || []).slice(0, 100).forEach(row => {
          const firstCell = String(row[0] || '').toLowerCase().trim();
          const isTotalRow = firstCell.includes('tổng') || firstCell.includes('cộng');

          tableRows.push(new TableRow({
            children: row.map((cell, cIdx) => {
              const textVal = String(cell ?? '').trim();
              const align = docxColAlignments[cIdx] || AlignmentType.LEFT;

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
