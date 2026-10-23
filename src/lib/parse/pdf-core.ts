/**
 * PDF → reading-order text. Runtime-agnostic: the caller passes a pdf.js module, so the same code
 * runs in the browser (with a worker) and in Node tests (legacy build).
 */

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        view: number[];
        getTextContent(): Promise<{ items: unknown[] }>;
      }>;
      destroy?(): Promise<void>;
    }>;
  };
}

export interface ParsedDocument {
  text: string;
  pages: number;
  /** Source layout used columns or tables (penalised in the "before" formatting score). */
  multiColumn: boolean;
}

export class ScannedPdfError extends Error {
  constructor() {
    super('This PDF has no selectable text — it looks like a scan or an image. Please upload the original PDF/DOCX or paste the text.');
    this.name = 'ScannedPdfError';
  }
}

interface Item {
  str: string;
  x0: number;
  x1: number;
  y: number;
  h: number;
}

export async function pdfToText(data: ArrayBuffer | Uint8Array, pdfjs: PdfJsLike): Promise<ParsedDocument> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false }).promise;
  const pages: string[] = [];
  let multiColumn = false;
  let chars = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      const it = raw as PdfTextItem;
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const [a = 1, , , d = 1, x = 0, y = 0] = it.transform;
      items.push({ str: it.str, x0: x, x1: x + it.width, y, h: Math.abs(it.height || d || a) });
      chars += it.str.trim().length;
    }
    const width = (page.view[2] ?? 612) - (page.view[0] ?? 0);
    const { text, columns } = layoutPage(items, width);
    if (columns) multiColumn = true;
    pages.push(text);
  }
  await doc.destroy?.();
  if (chars < 40 * Math.max(1, Math.min(doc.numPages, 2))) throw new ScannedPdfError();
  return { text: pages.join('\n\n'), pages: doc.numPages, multiColumn };
}

/** Group items into lines, detecting a two-column body so columns are read one after another. */
export function layoutPage(items: Item[], pageWidth: number): { text: string; columns: boolean } {
  if (!items.length) return { text: '', columns: false };
  const gutter = findGutter(items, pageWidth);
  if (gutter === undefined) return { text: linesOf(items).join('\n'), columns: false };

  const { top, bottom } = bodyRange(
    items.filter((i) => i.x1 <= gutter),
    items.filter((i) => i.x0 >= gutter),
  );
  // Full-width header/footer bands are read first/last; the body is read column by column.
  const inBody = (i: Item) => i.y <= top + 1 && i.y >= bottom - 1;
  const header = items.filter((i) => !inBody(i) && i.y > top);
  const footer = items.filter((i) => !inBody(i) && i.y < bottom);
  const left = items.filter((i) => inBody(i) && i.x1 <= gutter);
  const right = items.filter((i) => inBody(i) && i.x0 >= gutter);
  const text = [...linesOf(header), ...linesOf(left), ...linesOf(right), ...linesOf(footer)].join('\n');
  return { text, columns: true };
}

/** The vertical band where both columns have text. */
function bodyRange(left: Item[], right: Item[]): { top: number; bottom: number } {
  const ys = (l: Item[]) => l.map((i) => i.y);
  return {
    top: Math.min(Math.max(...ys(left)), Math.max(...ys(right))),
    bottom: Math.max(Math.min(...ys(left)), Math.min(...ys(right))),
  };
}

function findGutter(items: Item[], pageWidth: number): number | undefined {
  const total = items.reduce((s, i) => s + i.str.length, 0);
  const runs: number[][] = [];
  let run: number[] = [];
  for (let x = pageWidth * 0.2; x <= pageWidth * 0.75; x += 2) {
    if (isGutter(items, x, total)) run.push(x);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  if (!runs.length) return undefined;
  const widest = runs.reduce((a, b) => (b.length > a.length ? b : a));
  return widest[Math.floor(widest.length / 2)];
}

/**
 * x is a gutter when nothing in the body crosses it (only full-width header/footer lines may),
 * and both sides hold a real column of text — a right-aligned date column does not count.
 */
function isGutter(items: Item[], x: number, total: number): boolean {
  const left: Item[] = [];
  const right: Item[] = [];
  const crossing: Item[] = [];
  for (const i of items) {
    if (i.x0 < x && i.x1 > x) crossing.push(i);
    else if (i.x1 <= x) left.push(i);
    else right.push(i);
  }
  if (!left.length || !right.length) return false;
  const { top, bottom } = bodyRange(left, right);
  if (crossing.some((i) => i.y <= top + 1 && i.y >= bottom - 1)) return false;
  const chars = (list: Item[]) => list.reduce((s, i) => s + i.str.length, 0);
  if (chars(left) < total * 0.12 || chars(right) < total * 0.12) return false;
  const lines = (list: Item[]) => new Set(list.map((i) => Math.round(i.y))).size;
  return lines(left) >= 6 && lines(right) >= 6 && chars(left) / lines(left) >= 12 && chars(right) / lines(right) >= 12;
}

function linesOf(items: Item[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines.at(-1);
    const ref = line?.[0];
    if (ref && Math.abs(ref.y - it.y) <= Math.max(2, Math.min(ref.h, it.h) * 0.5)) line.push(it);
    else lines.push([it]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x0 - b.x0);
    let out = '';
    let prev: Item | undefined;
    for (const it of line) {
      if (prev) {
        const gap = it.x0 - prev.x1;
        // A wide gap is a tab stop (e.g. right-aligned dates): keep it as a tab.
        if (gap > Math.max(18, it.h * 1.5)) out += '\t';
        else if (gap > it.h * 0.15 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
      }
      out += it.str;
      prev = it;
    }
    return out.replace(/[ ]{2,}/g, ' ').trim();
  });
}
