import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { reviewExtraction } from '../shared/extraction';
import { heuristicExtract } from '../shared/offline/extract';
import { docxToText } from '../src/lib/parse/docx-core';
import { pdfToText, ScannedPdfError, type PdfJsLike } from '../src/lib/parse/pdf-core';
import { SAMPLES } from './fixtures/samples';

const dir = path.resolve('tests/fixtures/files');

async function parse(file: string) {
  const buf = fs.readFileSync(path.join(dir, file));
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return file.endsWith('.pdf') ? pdfToText(data, pdfjs as unknown as PdfJsLike) : docxToText({ buffer: buf }, mammoth);
}

describe.each(SAMPLES)('parse + offline extraction: $file ($layout)', ({ file, layout, resume }) => {
  it('extracts text in reading order and structures it verbatim', async () => {
    const doc = await parse(file);
    expect(doc.multiColumn).toBe(layout === 'pdf-2col');
    const text = doc.text;
    // Reading order: summary/skills come before the first role; roles in order.
    const firstRole = text.indexOf(resume.experience[0]!.bullets[0]!.text.slice(0, 30));
    const secondRole = text.indexOf(resume.experience[1]!.bullets[0]!.text.slice(0, 30));
    expect(firstRole).toBeGreaterThan(-1);
    expect(secondRole).toBeGreaterThan(firstRole);

    const { resume: got, flags } = reviewExtraction(text, heuristicExtract(text));
    expect(got.contact.name).toBe(resume.contact.name);
    expect(got.contact.email).toBe(resume.contact.email);
    expect(got.contact.phone).toBe(resume.contact.phone);
    expect(got.contact.location).toBe(resume.contact.location);
    expect(got.summary).toBe(resume.summary);
    expect(got.yearsOfExperience).toBe(resume.yearsOfExperience);
    expect(got.skills).toEqual(resume.skills);
    expect(got.experience.map((r) => [r.title, r.company, r.location, r.startDate, r.endDate])).toEqual(
      resume.experience.map((r) => [r.title, r.company, r.location, r.startDate, r.endDate]),
    );
    expect(got.experience.map((r) => [...r.bullets, ...(r.projects ?? []).flatMap((p) => p.bullets)].map((b) => b.text))).toEqual(
      resume.experience.map((r) => [...r.bullets, ...(r.projects ?? []).flatMap((p) => p.bullets)].map((b) => b.text)),
    );
    expect(got.education.map((e) => [e.degree, e.institution, e.endDate])).toEqual(resume.education.map((e) => [e.degree, e.institution, e.endDate]));
    expect(got.certifications.map((c) => c.name)).toEqual(resume.certifications.map((c) => c.name));
    expect(got.awards.map((a) => a.name)).toEqual(resume.awards.map((a) => a.name));
    expect(Object.keys(flags).filter((k) => !k.startsWith('contact'))).toEqual([]);
  });
});

describe('extraction review', () => {
  it('flags text that is not in the source and tech the source never mentions', () => {
    const raw = 'Jane Doe\njane@example.com\nSUMMARY\nQA engineer using Python.';
    const x = heuristicExtract(raw);
    x.summary = 'QA engineer using Python and Java.';
    const { flags } = reviewExtraction(raw, x);
    expect(flags.summary).toMatch(/Java/);
  });

  it('rejects image-only PDFs', async () => {
    const fake: PdfJsLike = {
      getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ view: [0, 0, 612, 792], getTextContent: async () => ({ items: [] }) }) }) }),
    };
    await expect(pdfToText(new Uint8Array([1]), fake)).rejects.toBeInstanceOf(ScannedPdfError);
  });
});
