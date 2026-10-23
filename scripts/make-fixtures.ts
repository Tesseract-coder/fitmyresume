/**
 * Renders tests/fixtures/samples.ts into real PDF/DOCX files (1- and 2-column layouts) that the
 * parsing tests read back. Run with `npm run fixtures`; outputs are committed.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TabStopType, TextRun } from 'docx';
import { SAMPLES, type Sample } from '../tests/fixtures/samples';
import type { ResumeJSON } from '../shared/schema';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake');
const OUT = path.resolve('tests/fixtures/files');
fs.mkdirSync(OUT, { recursive: true });

const font = (n: string) => fs.readFileSync(require.resolve(`@fontsource/carlito/files/carlito-latin-${n}.woff`));
pdfmake.virtualfs.writeFileSync('r.woff', font('400-normal'));
pdfmake.virtualfs.writeFileSync('b.woff', font('700-normal'));
pdfmake.addFonts({ Carlito: { normal: 'r.woff', bold: 'b.woff', italics: 'r.woff', bolditalics: 'b.woff' } });
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => false);

type Node = Record<string, unknown> | string;
const heading = (t: string): Node => ({ text: t.toUpperCase(), bold: true, fontSize: 12, margin: [0, 10, 0, 4] });
const dates = (a: string, b: string) => `${a} – ${b}`;

function contactNodes(r: ResumeJSON): Node[] {
  const c = r.contact;
  return [
    { text: c.name, fontSize: 22, bold: true },
    ...(r.headline ? [{ text: r.headline, fontSize: 12 }] : []),
    { text: `Phone: ${c.phone} | Email: ${c.email} | Location: ${c.location}`, fontSize: 9.5 },
    { text: c.links.map((l) => `${l.label}: ${l.url}`).join(' | '), fontSize: 9.5 },
  ];
}

function experienceNodes(r: ResumeJSON, glyphs: boolean, style: 'pipe' | 'two-line'): Node[] {
  const out: Node[] = [heading('Professional Experience')];
  const list = (items: string[]): Node =>
    glyphs ? { stack: items.map((t) => ({ text: `• ${t}`, margin: [6, 1, 0, 1] })) } : { ul: items, margin: [6, 1, 0, 1] };
  for (const role of r.experience) {
    if (style === 'pipe') {
      out.push({ columns: [{ text: `${role.title} | ${role.company} | ${role.location}`, bold: true }, { text: dates(role.startDate, role.endDate), alignment: 'right', width: 'auto' }], margin: [0, 6, 0, 2] });
    } else {
      out.push({ text: `${role.company}, ${role.location}`, bold: true, margin: [0, 6, 0, 0] });
      out.push({ columns: [{ text: role.title, italics: true }, { text: dates(role.startDate, role.endDate), alignment: 'right', width: 'auto' }] });
    }
    out.push(list(role.bullets.map((b) => b.text)));
    for (const p of role.projects ?? []) {
      out.push({ text: `Project: ${p.name}`, margin: [0, 2, 0, 0] }, { text: `Client: ${p.client}` }, list(p.bullets.map((b) => b.text)));
    }
  }
  return out;
}

function sideNodes(r: ResumeJSON): Node[] {
  const out: Node[] = [heading('Skills'), ...r.skills.map((g) => ({ text: `${g.group}: ${g.items.join(', ')}`, margin: [0, 1, 0, 1] }))];
  out.push(heading('Education'), ...r.education.map((e) => ({ text: `${e.degree} | ${e.institution} | ${e.endDate}` })));
  if (r.certifications.length) out.push(heading('Certifications'), ...r.certifications.map((c) => ({ text: `${c.name} | ${c.issuer} | ${c.date}` })));
  if (r.awards.length) out.push(heading('Awards'), ...r.awards.map((a) => ({ text: `${a.name} (${a.year})` })));
  return out;
}

async function pdf(sample: Sample): Promise<Buffer> {
  const r = sample.resume;
  let content: Node[];
  if (sample.layout === 'pdf-2col') {
    content = [
      ...contactNodes(r),
      {
        columns: [
          { width: '32%', stack: sideNodes(r) },
          { width: '*', stack: [heading('Summary'), { text: r.summary }, ...experienceNodes(r, true, 'pipe')] },
        ],
        columnGap: 24,
      },
    ];
  } else if (sample.layout === 'pdf-1col-plain') {
    const c = r.contact;
    content = [
      { text: c.name, fontSize: 20, bold: true },
      { text: c.email },
      { text: c.phone },
      { text: c.location },
      { text: c.links.map((l) => l.url).join('  ') },
      heading('Profile'),
      { text: r.summary },
      heading('Skills'),
      ...r.skills.map((g) => ({ text: `${g.group}: ${g.items.join(', ')}` })),
      ...experienceNodes(r, false, 'two-line'),
      heading('Education'),
      ...r.education.map((e) => ({ text: `${e.degree}, ${e.institution}, ${e.endDate}` })),
    ];
  } else {
    content = [
      ...contactNodes(r),
      heading('Professional Summary'),
      { text: r.summary },
      heading('Technical Skills'),
      ...r.skills.map((g) => ({ text: `${g.group}: ${g.items.join(', ')}` })),
      ...experienceNodes(r, true, 'pipe'),
      ...sideNodes(r).slice(r.skills.length + 1),
    ];
  }
  const doc = pdfmake.createPdf({ content, defaultStyle: { font: 'Carlito', fontSize: 10.5 }, pageMargins: [40, 40, 40, 40] });
  return Buffer.from(await doc.getBuffer());
}

async function docx(sample: Sample): Promise<Buffer> {
  const r = sample.resume;
  const p = (text: string, opts: { bold?: boolean; size?: number } = {}) => new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: opts.size })] });
  const h = (text: string) => new Paragraph({ children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 24 })], spacing: { before: 200, after: 80 } });
  const bullet = (text: string) => new Paragraph({ text, numbering: { reference: 'bullets', level: 0 } });
  const children: Paragraph[] = [
    p(r.contact.name, { bold: true, size: 44 }),
    ...(r.headline ? [p(r.headline)] : []),
    p(`${r.contact.phone} | ${r.contact.email} | ${r.contact.location}`),
    p(r.contact.links.map((l) => l.url).join(' | ')),
    h('Summary'),
    p(r.summary),
    h('Skills'),
    ...r.skills.map((g) => p(`${g.group}: ${g.items.join(', ')}`)),
    h('Work Experience'),
  ];
  for (const role of r.experience) {
    children.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
        children: [new TextRun({ text: `${role.title}, ${role.company} — ${role.location}`, bold: true }), new TextRun({ text: `\t${role.startDate} - ${role.endDate}` })],
      }),
      ...role.bullets.map((b) => bullet(b.text)),
    );
    for (const pr of role.projects ?? []) {
      children.push(p(`Project: ${pr.name}`), p(`Client: ${pr.client}`), ...pr.bullets.map((b) => bullet(b.text)));
    }
  }
  children.push(h('Education'), ...r.education.map((e) => p(`${e.degree} | ${e.institution} | ${e.endDate}`)));
  if (r.certifications.length) children.push(h('Certifications'), ...r.certifications.map((c) => p(`${c.name}, ${c.issuer}, ${c.date}`)));
  if (r.awards.length) children.push(h('Awards'), ...r.awards.map((a) => p(`${a.name} ${a.year}`)));
  const doc = new Document({
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT }] }] },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

for (const s of SAMPLES) {
  const buf = s.layout === 'docx' ? await docx(s) : await pdf(s);
  fs.writeFileSync(path.join(OUT, s.file), buf);
  console.log('wrote', s.file, buf.length);
}
