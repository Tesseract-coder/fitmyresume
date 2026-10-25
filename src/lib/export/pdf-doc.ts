import { SECTION_HEADINGS, contactLines, dateRange } from '@shared/resume-text';
import type { ResumeJSON } from '@shared/schema';
import { FONTS } from './fonts';
import { THEMES, TEMPLATES, type ExportPrefs, type Template, type Theme } from './theme';

/** Pure pdfmake document definition: single column, real text layer, reading order = visual order. */
export type PdfNode = Record<string, unknown> | string;

/** Kept for callers that only need the default family. */
export const PDF_FONT = FONTS.carlito.pdf;
export const PDF_FONT_FILES = FONTS.carlito.files;
const PAGE_WIDTH = 612; // US Letter; content width depends on template margins

/** A section heading in the template's style. Decorations are canvas lines, never text, so extraction order is unchanged. */
export function pdfHeading(title: string, t: Template, c: Theme, contentWidth: number): PdfNode {
  const text = { text: t.upperHeadings ? title.toUpperCase() : title, font: FONTS[t.headingFont].pdf, fontSize: t.headingSize, bold: true, color: t.headingStyle === 'plain' ? c.accent : c.heading, characterSpacing: t.tracking };
  const line = (y: number, width = 0.75) => ({ canvas: [{ type: 'line', x1: 0, y1: y, x2: contentWidth, y2: y, lineWidth: width, lineColor: c.accent }] });
  switch (t.headingStyle) {
    case 'rule':
      return { stack: [text, line(2)], margin: [0, t.sectionGap, 0, 4] };
    case 'overline':
      return { stack: [line(0, 0.6), { ...text, margin: [0, 3, 0, 0] }], margin: [0, t.sectionGap, 0, 3] };
    case 'bar':
      return {
        stack: [{ canvas: [{ type: 'rect', x: 0, y: 0, w: 3.5, h: t.headingSize + 2, color: c.accent }] }, { ...text, margin: [9, -(t.headingSize + 2), 0, 0] }],
        margin: [0, t.sectionGap, 0, 4],
      };
    case 'plain':
      return { ...text, margin: [0, t.sectionGap, 0, 3] };
  }
}

export function buildPdfDefinition(resume: ResumeJSON, prefs: ExportPrefs): Record<string, unknown> {
  const t = TEMPLATES[prefs.template];
  const c = THEMES[prefs.theme];
  const contentWidth = PAGE_WIDTH - 2 * t.margin;
  const content: PdfNode[] = [];
  const align = t.centeredHeader ? 'center' : 'left';
  const headingFont = FONTS[t.headingFont].pdf;

  content.push({ text: resume.contact.name, font: headingFont, fontSize: t.nameSize, bold: true, color: t.nameAccent ? c.accent : c.heading, alignment: align, characterSpacing: t.tracking / 2 });
  if (resume.headline) content.push({ text: resume.headline, fontSize: t.bodySize + 1.5, color: c.muted, alignment: align, margin: [0, 1, 0, 0] });
  for (const line of contactLines(resume)) content.push({ text: line, fontSize: t.bodySize - 1, color: c.text, alignment: align, margin: [0, 2, 0, 0] });
  if (t.headerRule !== 'none') {
    const w = t.headerRule === 'thick' ? 2.5 : 0.6;
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: w, lineColor: c.accent }], margin: [0, 6, 0, 0] });
  }

  const heading = (title: string) => pdfHeading(title, t, c, contentWidth);
  const bullets = (items: string[]): PdfNode => ({ ul: items.map((text) => ({ text, margin: [0, 0.5, 0, 0.5] })), margin: [4, 1, 0, 2], markerColor: c.text });
  const twoSide = (left: PdfNode | PdfNode[], right: string, margin: number[]): PdfNode => ({
    columns: [{ width: '*', text: left }, { width: 'auto', text: right, alignment: 'right', color: c.muted }],
    columnGap: 8,
    margin,
  });

  if (resume.summary) content.push(heading(SECTION_HEADINGS.summary), { text: resume.summary, lineHeight: t.lineHeight + 0.05 });
  if (resume.skills.length) {
    content.push(heading(SECTION_HEADINGS.skills));
    for (const g of resume.skills) content.push({ text: [{ text: `${g.group}: `, bold: true, color: c.heading }, g.items.join(t.skillSeparator)], margin: [0, 0.5, 0, 0.5] });
  }
  if (resume.experience.length) {
    content.push(heading(SECTION_HEADINGS.experience));
    resume.experience.forEach((r, i) => {
      const gap = i === 0 ? 0 : t.sectionGap / 2;
      const dates = dateRange(r.startDate, r.endDate);
      if (t.roleLayout === 'stacked') {
        content.push(twoSide([{ text: r.title, bold: true }], dates, [0, gap, 0, 0]));
        content.push({ text: [{ text: r.company, color: c.accent, bold: true }, ...(r.location ? [{ text: ` | ${r.location}`, color: c.muted }] : [])], margin: [0, 0, 0, 1] });
      } else {
        content.push(
          twoSide(
            [{ text: r.title, bold: true }, { text: ' | ' }, { text: r.company, color: c.accent, bold: true }, ...(r.location ? [{ text: ` | ${r.location}`, color: c.muted }] : [])],
            dates,
            [0, gap, 0, 1],
          ),
        );
      }
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
      content.push(twoSide(left, dateRange(e.startDate, e.endDate), [0, 0.5, 0, 0.5]));
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
    defaultStyle: { font: FONTS[t.bodyFont].pdf, fontSize: t.bodySize, color: c.text, lineHeight: t.lineHeight },
    content,
  };
}
