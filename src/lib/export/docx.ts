import { AlignmentType, BorderStyle, Document, LevelFormat, Packer, Paragraph, TabStopType, TextRun } from 'docx';
import { SECTION_HEADINGS, contactLines, dateRange } from '@shared/resume-text';
import type { ResumeJSON } from '@shared/schema';
import { THEMES, TEMPLATES, type ExportPrefs } from './theme';

const PAGE_WIDTH_TWIPS = 12240; // US Letter
const hex = (c: string) => c.replace('#', '');
const pt = (n: number) => Math.round(n * 2); // docx sizes are half-points
const twips = (points: number) => Math.round(points * 20);

/**
 * Single-column DOCX: contact in the body (not the header), standard headings, real list bullets
 * (LevelFormat.BULLET, never a typed "•"), right tab stop for dates. Calibri (Word's default).
 */
export function buildDocx(resume: ResumeJSON, prefs: ExportPrefs): Document {
  const t = TEMPLATES[prefs.template];
  const c = THEMES[prefs.theme];
  const margin = twips(t.margin);
  const rightTab = PAGE_WIDTH_TWIPS - 2 * margin;
  const align = t.centeredHeader ? AlignmentType.CENTER : AlignmentType.LEFT;
  const children: Paragraph[] = [];

  children.push(new Paragraph({ alignment: align, children: [new TextRun({ text: resume.contact.name, bold: true, size: pt(t.nameSize), color: hex(c.heading) })] }));
  if (resume.headline) children.push(new Paragraph({ alignment: align, children: [new TextRun({ text: resume.headline, size: pt(t.bodySize + 1.5), color: hex(c.muted) })] }));
  for (const line of contactLines(resume)) children.push(new Paragraph({ alignment: align, children: [new TextRun({ text: line, size: pt(t.bodySize - 1) })] }));

  const heading = (title: string) =>
    new Paragraph({
      spacing: { before: twips(t.sectionGap), after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(c.accent), space: 1 } },
      children: [new TextRun({ text: t.upperHeadings ? title.toUpperCase() : title, bold: true, size: pt(t.headingSize), color: hex(c.heading) })],
    });
  const bullet = (text: string) => new Paragraph({ numbering: { reference: 'fmr-bullets', level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text })] });
  const twoSide = (left: TextRun[], right: string, before = 0) =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
      spacing: { before, after: 20 },
      children: [...left, ...(right ? [new TextRun({ text: `\t${right}`, color: hex(c.muted) })] : [])],
    });

  if (resume.summary) children.push(heading(SECTION_HEADINGS.summary), new Paragraph({ children: [new TextRun(resume.summary)] }));
  if (resume.skills.length) {
    children.push(heading(SECTION_HEADINGS.skills));
    for (const g of resume.skills) {
      children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${g.group}: `, bold: true, color: hex(c.heading) }), new TextRun(g.items.join(', '))] }));
    }
  }
  if (resume.experience.length) {
    children.push(heading(SECTION_HEADINGS.experience));
    resume.experience.forEach((r, i) => {
      children.push(
        twoSide(
          [
            new TextRun({ text: r.title, bold: true }),
            new TextRun(' | '),
            new TextRun({ text: r.company, bold: true, color: hex(c.accent) }),
            ...(r.location ? [new TextRun({ text: ` | ${r.location}`, color: hex(c.muted) })] : []),
          ],
          dateRange(r.startDate, r.endDate),
          i === 0 ? 0 : twips(t.sectionGap / 2),
        ),
      );
      for (const b of r.bullets) children.push(bullet(b.text));
      for (const p of r.projects ?? []) {
        const head = [p.name && `Project: ${p.name}`, p.client && `Client: ${p.client}`].filter(Boolean).join(' | ');
        if (head) children.push(new Paragraph({ children: [new TextRun({ text: head, italics: true, color: hex(c.muted) })] }));
        for (const b of p.bullets) children.push(bullet(b.text));
      }
    });
  }
  if (resume.education.length) {
    children.push(heading(SECTION_HEADINGS.education));
    for (const e of resume.education) {
      children.push(twoSide([new TextRun([e.degree, e.institution, e.location, e.gpa && `GPA: ${e.gpa}`].filter(Boolean).join(' | '))], dateRange(e.startDate, e.endDate)));
    }
  }
  if (resume.certifications.length) {
    children.push(heading(SECTION_HEADINGS.certifications), ...resume.certifications.map((x) => bullet([x.name, x.issuer, x.date].filter(Boolean).join(' | '))));
  }
  if (resume.awards.length) {
    children.push(heading(SECTION_HEADINGS.awards), ...resume.awards.map((a) => bullet([a.name, a.year, a.detail].filter(Boolean).join(' | '))));
  }
  for (const x of resume.extras ?? []) if (x.items.length) children.push(heading(x.heading), ...x.items.map(bullet));

  return new Document({
    creator: resume.contact.name,
    title: `${resume.contact.name} — Resume`,
    styles: { default: { document: { run: { font: 'Calibri', size: pt(t.bodySize), color: hex(c.text) } } } },
    numbering: {
      config: [
        {
          reference: 'fmr-bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { size: { width: PAGE_WIDTH_TWIPS, height: 15840 }, margin: { top: margin, bottom: margin, left: margin, right: margin } } }, children }],
  });
}

export async function exportDocx(resume: ResumeJSON, prefs: ExportPrefs): Promise<Blob> {
  return Packer.toBlob(buildDocx(resume, prefs));
}
