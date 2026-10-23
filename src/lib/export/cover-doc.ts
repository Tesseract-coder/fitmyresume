import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun } from 'docx';
import type { ComposedLetter } from '@shared/cover';
import { PDF_FONT, type PdfNode } from './pdf-doc';
import { THEMES, TEMPLATES, type ExportPrefs } from './theme';

/**
 * Cover letter in the same template and colours as the resume: identical header (name + labelled
 * contact lines + accent rule), then date, greeting, body and sign-off. Single column, real text.
 */
const PAGE_WIDTH = 612;
const LETTER_BODY_SIZE = 11;

export function buildCoverPdfDefinition(letter: ComposedLetter, prefs: ExportPrefs): Record<string, unknown> {
  const t = TEMPLATES[prefs.template];
  const c = THEMES[prefs.theme];
  const align = t.centeredHeader ? 'center' : 'left';
  const content: PdfNode[] = [
    { text: letter.name, fontSize: t.nameSize, bold: true, color: c.heading, alignment: align },
    ...letter.contact.map((line): PdfNode => ({ text: line, fontSize: LETTER_BODY_SIZE - 1.5, alignment: align, margin: [0, 2, 0, 0] })),
    { canvas: [{ type: 'line', x1: 0, y1: 6, x2: PAGE_WIDTH - 2 * t.margin, y2: 6, lineWidth: 0.75, lineColor: c.accent }], margin: [0, 0, 0, 18] },
    { text: letter.date, margin: [0, 0, 0, 14] },
    { text: letter.greeting, margin: [0, 0, 0, 10] },
    ...letter.paragraphs.map((p): PdfNode => ({ text: p, lineHeight: 1.25, margin: [0, 0, 0, 10] })),
    { text: letter.signoff, margin: [0, 6, 0, 0] },
    { text: letter.name, bold: true, color: c.heading, margin: [0, 18, 0, 0] },
  ];
  return {
    pageSize: 'LETTER',
    pageMargins: [Math.max(t.margin, 54), Math.max(t.margin, 54), Math.max(t.margin, 54), Math.max(t.margin, 54)],
    info: { title: `${letter.name} — Cover Letter`, author: letter.name, subject: 'Cover Letter' },
    defaultStyle: { font: PDF_FONT, fontSize: LETTER_BODY_SIZE, color: c.text, lineHeight: 1.15 },
    content,
  };
}

export function buildCoverDocx(letter: ComposedLetter, prefs: ExportPrefs): Document {
  const t = TEMPLATES[prefs.template];
  const c = THEMES[prefs.theme];
  const hex = (s: string) => s.replace('#', '');
  const align = t.centeredHeader ? AlignmentType.CENTER : AlignmentType.LEFT;
  const margin = Math.round(Math.max(t.margin, 54) * 20);
  const para = (text: string, after = 200, run: Partial<{ bold: boolean; color: string }> = {}) => new Paragraph({ spacing: { after, line: 300 }, children: [new TextRun({ text, ...run })] });

  const children = [
    new Paragraph({ alignment: align, children: [new TextRun({ text: letter.name, bold: true, size: t.nameSize * 2, color: hex(c.heading) })] }),
    ...letter.contact.map((line, i) =>
      new Paragraph({
        alignment: align,
        ...(i === letter.contact.length - 1 ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(c.accent), space: 6 } } } : {}),
        children: [new TextRun({ text: line, size: (LETTER_BODY_SIZE - 1.5) * 2 })],
      }),
    ),
    new Paragraph({ spacing: { before: 360, after: 280 }, children: [new TextRun(letter.date)] }),
    para(letter.greeting),
    ...letter.paragraphs.map((p) => para(p)),
    para(letter.signoff, 480),
    para(letter.name, 0, { bold: true, color: hex(c.heading) }),
  ];
  return new Document({
    creator: letter.name,
    title: `${letter.name} — Cover Letter`,
    styles: { default: { document: { run: { font: 'Calibri', size: LETTER_BODY_SIZE * 2, color: hex(c.text) } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: margin, bottom: margin, left: margin, right: margin } } }, children }],
  });
}

export async function exportCoverDocx(letter: ComposedLetter, prefs: ExportPrefs): Promise<Blob> {
  return Packer.toBlob(buildCoverDocx(letter, prefs));
}
