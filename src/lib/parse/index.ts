import type { ParsedDocument, PdfJsLike } from './pdf-core';

export { ScannedPdfError, type ParsedDocument } from './pdf-core';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export class UnsupportedFileError extends Error {}

/** Parse an uploaded resume entirely in the browser. Heavy libraries are loaded on demand. */
export async function parseResumeFile(file: File): Promise<ParsedDocument> {
  if (file.size > MAX_FILE_BYTES) throw new UnsupportedFileError('That file is larger than 8 MB. Please upload a smaller PDF or DOCX.');
  const name = file.name.toLowerCase();
  const data = await file.arrayBuffer();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const [{ pdfToText }, pdfjs, worker] = await Promise.all([
      import('./pdf-core'),
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfToText(data, pdfjs as unknown as PdfJsLike);
  }
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    const [{ docxToText }, mammoth] = await Promise.all([import('./docx-core'), import('mammoth')]);
    return docxToText({ arrayBuffer: data }, mammoth.default ?? mammoth);
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    return { text: new TextDecoder().decode(data), pages: 1, multiColumn: false };
  }
  if (name.endsWith('.doc')) throw new UnsupportedFileError('Old .doc files are not supported. Save it as .docx or PDF and try again.');
  throw new UnsupportedFileError('Please upload a PDF, DOCX or TXT file.');
}
