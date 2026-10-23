import type { ParsedDocument } from './pdf-core';

type Mammoth = typeof import('mammoth');
/** `{ arrayBuffer }` in the browser, `{ buffer }` in Node. */
export type MammothInput = Parameters<Mammoth['convertToHtml']>[0];
export type MammothLike = Pick<Mammoth, 'convertToHtml'>;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/**
 * DOCX → text via mammoth's HTML (raw-text mode drops list bullets, which the extractor needs).
 * Tables are flagged as multi-column layout.
 */
export async function docxToText(input: MammothInput, mammoth: MammothLike): Promise<ParsedDocument> {
  const { value: html } = await mammoth.convertToHtml(input);
  const multiColumn = /<table[\s>]/i.test(html);
  const text = html
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<(br)\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|tr|ul|ol|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
    .split('\n')
    .map((l) => l.replace(/[  ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { text, pages: 1, multiColumn };
}
