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
import { PDF_FONT, PDF_FONT_FILES, buildPdfDefinition } from '../src/lib/export/pdf-doc';
import { TEMPLATES, THEMES, exportFileName, type TemplateId, type ThemeId } from '../src/lib/export/theme';
import { pdfToText, type PdfJsLike } from '../src/lib/parse/pdf-core';
import { SAMPLES } from './fixtures/samples';
import { pythonQa } from './fixtures/resumes';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
const font = (f: string) => fs.readFileSync(require.resolve(`@fontsource/carlito/files/carlito-latin-${f}.woff`));
pdfmake.virtualfs.writeFileSync(PDF_FONT_FILES.normal, font('400-normal'));
pdfmake.virtualfs.writeFileSync(PDF_FONT_FILES.bold, font('700-normal'));
pdfmake.virtualfs.writeFileSync(PDF_FONT_FILES.italics, font('400-italic'));
pdfmake.virtualfs.writeFileSync(PDF_FONT_FILES.bolditalics, font('700-italic'));
pdfmake.addFonts({ [PDF_FONT]: { ...PDF_FONT_FILES } });
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
    for (const needle of ['Priya Sharma', 'Email: priya.sharma@example.com', 'October 23, 2026', 'Dear Ms. Rivera,', 'Senior SDET role at Globex', '1,200 API test cases', 'building my skills in Java', 'Thank you', 'Sincerely,']) {
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
    expect(value).toContain('At Acme Fintech, I built a Pytest automation framework for 1,200 API test cases. I am also actively building my skills in Java.');
    expect(value.trimEnd().endsWith('Priya Sharma')).toBe(true);
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    expect(html).not.toMatch(/<table|<li/);
  });
});
