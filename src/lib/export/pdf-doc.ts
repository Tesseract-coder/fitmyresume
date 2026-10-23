import { SECTION_HEADINGS, contactLines, dateRange } from '@shared/resume-text';
import type { ResumeJSON } from '@shared/schema';
import { THEMES, TEMPLATES, type ExportPrefs } from './theme';

/** Pure pdfmake document definition: single column, real text layer, reading order = visual order. */
export type PdfNode = Record<string, unknown> | string;

export const PDF_FONT = 'Carlito';
const PAGE_WIDTH = 612; // US Letter; content width depends on template margins

export function buildPdfDefinition(resume: ResumeJSON, prefs: ExportPrefs): Record<string, unknown> {
  const t = TEMPLATES[prefs.template];
  const c = THEMES[prefs.theme];
  const contentWidth = PAGE_WIDTH - 2 * t.margin;
  const content: PdfNode[] = [];
  const align = t.centeredHeader ? 'center' : 'left';

  content.push({ text: resume.contact.name, fontSize: t.nameSize, bold: true, color: c.heading, alignment: align });
  if (resume.headline) content.push({ text: resume.headline, fontSize: t.bodySize + 1.5, color: c.muted, alignment: align, margin: [0, 1, 0, 0] });
  for (const line of contactLines(resume)) content.push({ text: line, fontSize: t.bodySize - 1, color: c.text, alignment: align, margin: [0, 2, 0, 0] });

  const heading = (title: string): PdfNode => ({
    stack: [
      { text: t.upperHeadings ? title.toUpperCase() : title, fontSize: t.headingSize, bold: true, color: c.heading, characterSpacing: t.upperHeadings ? 0.5 : 0 },
      { canvas: [{ type: 'line', x1: 0, y1: 2, x2: contentWidth, y2: 2, lineWidth: 0.75, lineColor: c.accent }] },
    ],
    margin: [0, t.sectionGap, 0, 4],
  });
  const bullets = (items: string[]): PdfNode => ({ ul: items.map((text) => ({ text, margin: [0, 0.5, 0, 0.5] })), margin: [4, 1, 0, 2], markerColor: c.text });

  if (resume.summary) content.push(heading(SECTION_HEADINGS.summary), { text: resume.summary, lineHeight: 1.15 });
  if (resume.skills.length) {
    content.push(heading(SECTION_HEADINGS.skills));
    for (const g of resume.skills) content.push({ text: [{ text: `${g.group}: `, bold: true, color: c.heading }, g.items.join(', ')], margin: [0, 0.5, 0, 0.5] });
  }
  if (resume.experience.length) {
    content.push(heading(SECTION_HEADINGS.experience));
    resume.experience.forEach((r, i) => {
      content.push({
        columns: [
          {
            width: '*',
            text: [
              { text: r.title, bold: true },
              { text: ' | ' },
              { text: r.company, color: c.accent, bold: true },
              ...(r.location ? [{ text: ` | ${r.location}`, color: c.muted }] : []),
            ],
          },
          { width: 'auto', text: dateRange(r.startDate, r.endDate), alignment: 'right', color: c.muted },
        ],
        columnGap: 8,
        margin: [0, i === 0 ? 0 : t.sectionGap / 2, 0, 1],
      });
      if (r.bullets.length) content.push(bullets(r.bullets.map((b) => b.text)));
      for (const p of r.projects ?? []) {
        const head = [p.name && `Project: ${p.name}`, p.client && `Client: ${p.client}`].filter(Boolean).join(' | ');
        if (head) content.push({ text: head, italics: true, color: c.muted, margin: [0, 2, 0, 0] });
        if (p.bullets.length) content.push(bullets(p.bullets.map((b) => b.text)));
      }
    });
  }
  if (resume.education.length) {
    content.push(heading(SECTION_HEADINGS.education));
    for (const e of resume.education) {
      const left = [e.degree, e.institution, e.location, e.gpa && `GPA: ${e.gpa}`].filter(Boolean).join(' | ');
      content.push({ columns: [{ width: '*', text: left }, { width: 'auto', text: dateRange(e.startDate, e.endDate), alignment: 'right', color: c.muted }], columnGap: 8, margin: [0, 0.5, 0, 0.5] });
    }
  }
  if (resume.certifications.length) {
    content.push(heading(SECTION_HEADINGS.certifications), bullets(resume.certifications.map((x) => [x.name, x.issuer, x.date].filter(Boolean).join(' | '))));
  }
  if (resume.awards.length) {
    content.push(heading(SECTION_HEADINGS.awards), bullets(resume.awards.map((a) => [a.name, a.year, a.detail].filter(Boolean).join(' | '))));
  }
  for (const x of resume.extras ?? []) if (x.items.length) content.push(heading(x.heading), bullets(x.items));

  return {
    pageSize: 'LETTER',
    pageMargins: [t.margin, t.margin, t.margin, t.margin],
    info: { title: `${resume.contact.name} — Resume`, author: resume.contact.name, subject: 'Resume' },
    defaultStyle: { font: PDF_FONT, fontSize: t.bodySize, color: c.text, lineHeight: 1.1 },
    content,
  };
}

export const PDF_FONT_FILES = {
  normal: 'Carlito-Regular.woff',
  bold: 'Carlito-Bold.woff',
  italics: 'Carlito-Italic.woff',
  bolditalics: 'Carlito-BoldItalic.woff',
} as const;
