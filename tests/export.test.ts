import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Packer } from 'docx';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { heuristicExtract } from '../shared/offline/extract';
import { SECTION_HEADINGS, renderPlainText } from '../shared/resume-text';
import { DEFAULT_COVER_OPTIONS, composeCoverLetter, type CoverLetterDraft } from '../shared/cover';
import { buildCoverDocx, buildCoverPdfDefinition } from '../src/lib/export/cover-doc';
import { buildDocx } from '../src/lib/export/docx';
import { FONTS, FONT_SOURCES, STYLE_FILES } from '../src/lib/export/fonts';
import { buildPdfDefinition } from '../src/lib/export/pdf-doc';
import { TEMPLATES, THEMES, exportFileName, type FontId, type TemplateId, type ThemeId } from '../src/lib/export/theme';
import { pdfToText, type PdfJsLike } from '../src/lib/parse/pdf-core';
import { SAMPLES } from './fixtures/samples';
import { pythonQa } from './fixtures/resumes';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
// Register every font family a template can use, exactly as the browser loader does.
for (const id of Object.keys(FONTS) as FontId[]) {
  const f = FONTS[id];
  for (const style of Object.keys(f.files) as (keyof typeof f.files)[]) {
    pdfmake.virtualfs.writeFileSync(f.files[style], fs.readFileSync(require.resolve(`@fontsource/${FONT_SOURCES[id]}-latin-${STYLE_FILES[style]}.woff`)));
  }
  pdfmake.addFonts({ [f.pdf]: { ...f.files } });
}
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => false);

async function pdfText(resume = pythonQa, template: TemplateId = 'modern', theme: ThemeId = 'navy') {
  const buf: Buffer = await pdfmake.createPdf(buildPdfDefinition(resume, { template, theme })).getBuffer();
  return { buf, ...(await pdfToText(new Uint8Array(buf), pdfjs as unknown as PdfJsLike)) };
}

describe('PDF export', () => {
  it.each(Object.keys(TEMPLATES) as TemplateId[])('%s: text layer extracts in reading order with every section and parseable contact', async (template) => {
    const { text, multiColumn, pages } = await pdfText(pythonQa, template);
    expect(multiColumn).toBe(false);
    expect(pages).toBe(1);
    const order = [
      pythonQa.contact.name,
      `Email: ${pythonQa.contact.email}`,
      ...Object.values(SECTION_HEADINGS).map((h) => (TEMPLATES[template].upperHeadings ? h.toUpperCase() : h)),
    ];
    let last = -1;
    for (const needle of order) {
      const at = text.indexOf(needle);
      expect(at, needle).toBeGreaterThan(last);
      last = at;
    }
    // Round-trip: our own offline extractor can read the exported PDF back.
    const back = heuristicExtract(text);
    expect(back.contact).toMatchObject({ name: pythonQa.contact.name, email: pythonQa.contact.email, phone: pythonQa.contact.phone, location: pythonQa.contact.location });
    expect(back.experience.map((r) => [r.title, r.company, r.startDate, r.endDate])).toEqual([
      ['Senior QA Automation Engineer', 'Acme Fintech', 'Jan 2021', 'Present'],
      ['QA Engineer', 'Bright Retail', 'Jun 2018', 'Dec 2020'],
    ]);
    expect(back.experience[0]!.bullets).toEqual(pythonQa.experience[0]!.bullets.map((b) => b.text));
  });

  it('embeds the font and every theme renders', async () => {
    for (const theme of Object.keys(THEMES) as ThemeId[]) {
      const { buf } = await pdfText(pythonQa, 'compact', theme);
      expect(buf.toString('latin1')).toMatch(/FontFile2/);
    }
  });

  it('renders projects, extras and headline', async () => {
    const david = SAMPLES.find((s) => s.file.startsWith('david'))!.resume;
    const { text } = await pdfText({ ...david, headline: 'DevOps Consultant', extras: [{ heading: 'Talks', items: ['KubeCon 2023'] }] }, 'classic');
    expect(text).toContain('Project: Bank Migration | Client: Northbank');
    expect(text).toContain('KubeCon 2023');
    expect(text.indexOf('DevOps Consultant')).toBeLessThan(text.indexOf('Phone:'));
  });
});

describe('DOCX export', () => {
  it('uses real list bullets, body contact lines, standard headings and no tables', async () => {
    const buf = await Packer.toBuffer(buildDocx(pythonQa, { template: 'modern', theme: 'navy' }));
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    expect(html).not.toMatch(/<table/);
    expect(html).toContain(`<li>${pythonQa.experience[0]!.bullets[0]!.text.replace(/&/g, '&amp;')}</li>`);
    expect(html).not.toMatch(/<li>\s*•/);
    for (const h of Object.values(SECTION_HEADINGS)) expect(html).toContain(h);
    expect(html).toContain(`Email: ${pythonQa.contact.email}`);

    const xml = buf.toString('latin1');
    expect(xml).toContain('word/numbering.xml');
  });

  it('classic template uses uppercase headings', async () => {
    const { value } = await mammoth.extractRawText({ buffer: await Packer.toBuffer(buildDocx(pythonQa, { template: 'classic', theme: 'black' })) });
    expect(value).toContain('PROFESSIONAL EXPERIENCE');
  });
});

describe('templates and themes', () => {
  it.each(Object.keys(TEMPLATES) as TemplateId[])('%s DOCX: real bullets, body contact, standard headings, no tables', async (template) => {
    const buf = await Packer.toBuffer(buildDocx(pythonQa, { template, theme: 'navy' }));
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    expect(html).not.toMatch(/<table|<img/);
    expect(html).toContain(`<li>${pythonQa.experience[0]!.bullets[0]!.text.replace(/&/g, '&amp;')}</li>`);
    expect(html).toContain(`Email: ${pythonQa.contact.email}`);
    for (const h of Object.values(SECTION_HEADINGS)) expect(html.toLowerCase()).toContain(h.toLowerCase());
    // Re-importing our own DOCX works for every layout.
    const { value: text } = await mammoth.extractRawText({ buffer: buf });
    expect(heuristicExtract(text).experience.map((r) => [r.title, r.company])).toEqual(pythonQa.experience.map((r) => [r.title, r.company]));
  });

  it('heading letter-spacing stays ≤ 1pt (wider spacing extracts as "P R O F I L E")', () => {
    for (const t of Object.values(TEMPLATES)) expect(t.tracking, t.id).toBeLessThanOrEqual(1);
  });

  it('every theme colour used for text has WCAG AA contrast on white', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (hex: string) => 1.05 / (lum(hex) + 0.05);
    for (const t of Object.values(THEMES)) for (const k of ['heading', 'accent', 'text', 'muted'] as const) expect(contrast(t[k]), `${t.id}.${k}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('TXT export and file names', () => {
  it('plain text keeps labelled contact and standard headings', () => {
    const txt = renderPlainText(pythonQa);
    expect(txt.split('\n').slice(0, 3)).toEqual([
      'Priya Sharma',
      'Phone: +91 98765 43210 | Email: priya.sharma@example.com | Location: Pune, India',
      'LinkedIn: https://linkedin.com/in/priyasharma | GitHub: https://github.com/priyasharma',
    ]);
    expect(txt).toContain('PROFESSIONAL EXPERIENCE');
  });

  it('builds Firstname_Lastname_Resume_<Company> names', () => {
    expect(exportFileName('Priya Sharma', 'Globex Corp.', 'pdf')).toBe('Priya_Sharma_Resume_Globex_Corp.pdf');
    expect(exportFileName('José María López', undefined, 'docx')).toBe('Jose_Lopez_Resume.docx');
    expect(exportFileName('', '', 'txt')).toBe('My_Resume.txt');
    expect(exportFileName('Priya Sharma', 'Globex', 'pdf', 'Cover_Letter')).toBe('Priya_Sharma_Cover_Letter_Globex.pdf');
  });
});

describe('cover letter export', () => {
  const draft: CoverLetterDraft = {
    options: { ...DEFAULT_COVER_OPTIONS, hiringManager: 'Ms. Rivera', learning: ['Java'] },
    paragraphs: ['I am applying for the Senior SDET role at Globex.', 'At Acme Fintech, I built a Pytest automation framework for 1,200 API test cases.', 'Thank you for your time and consideration.'],
    violations: [],
    notes: [],
    engine: 'offline',
    edited: false,
    generatedAt: 0,
  };
  const letter = composeCoverLetter(pythonQa, draft, new Date('2026-10-23T12:00:00Z'));

  it.each(Object.keys(TEMPLATES) as TemplateId[])('%s: PDF has a text layer in reading order on one page', async (template) => {
    const buf: Buffer = await pdfmake.createPdf(buildCoverPdfDefinition(letter, { template, theme: 'navy' })).getBuffer();
    const { text: raw, pages, multiColumn } = await pdfToText(new Uint8Array(buf), pdfjs as unknown as PdfJsLike);
    const text = raw.replace(/\s+/g, ' '); // body paragraphs wrap across lines
    expect(pages).toBe(1);
    expect(multiColumn).toBe(false);
    let last = -1;
    for (const needle of ['Priya Sharma', 'Email: priya.sharma@example.com', 'October 23, 2026', 'Dear Ms. Rivera,', 'Senior SDET role at Globex', '1,200 API test cases', 'ramping up on Java', 'Thank you', 'Sincerely,']) {
      const at = text.indexOf(needle);
      expect(at, needle).toBeGreaterThan(last);
      last = at;
    }
  });

  it('DOCX keeps the same content as plain paragraphs, contact in the body', async () => {
    const buf = await Packer.toBuffer(buildCoverDocx(letter, { template: 'classic', theme: 'forest' }));
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain('Phone: +91 98765 43210 | Email: priya.sharma@example.com');
    expect(value).toContain('Dear Ms. Rivera,');
    expect(value).toContain('At Acme Fintech, I built a Pytest automation framework for 1,200 API test cases. I bring hands-on experience with Python, and I am actively ramping up on Java.');
    expect(value.trimEnd().endsWith('Priya Sharma')).toBe(true);
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    expect(html).not.toMatch(/<table|<li/);
  });
});
