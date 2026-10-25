import carlito400 from '@fontsource/carlito/files/carlito-latin-400-normal.woff?url';
import carlito700 from '@fontsource/carlito/files/carlito-latin-700-normal.woff?url';
import carlito400i from '@fontsource/carlito/files/carlito-latin-400-italic.woff?url';
import carlito700i from '@fontsource/carlito/files/carlito-latin-700-italic.woff?url';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import inter400i from '@fontsource/inter/files/inter-latin-400-italic.woff?url';
import inter700i from '@fontsource/inter/files/inter-latin-700-italic.woff?url';
import serif400 from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff?url';
import serif700 from '@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff?url';
import serif400i from '@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff?url';
import serif700i from '@fontsource/source-serif-4/files/source-serif-4-latin-700-italic.woff?url';
import type { ComposedLetter } from '@shared/cover';
import type { ResumeJSON } from '@shared/schema';
import { buildCoverPdfDefinition } from './cover-doc';
import { FONTS } from './fonts';
import { buildPdfDefinition } from './pdf-doc';
import { TEMPLATES, type ExportPrefs, type FontId } from './theme';

interface PdfMakeBrowser {
  addVirtualFileSystem(vfs: Record<string, string>): void;
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  createPdf(def: Record<string, unknown>): { getBlob(): Promise<Blob> };
}

const URLS: Record<FontId, { normal: string; bold: string; italics: string; bolditalics: string }> = {
  carlito: { normal: carlito400, bold: carlito700, italics: carlito400i, bolditalics: carlito700i },
  inter: { normal: inter400, bold: inter700, italics: inter400i, bolditalics: inter700i },
  serif: { normal: serif400, bold: serif700, italics: serif400i, bolditalics: serif700i },
};

let ready: Promise<PdfMakeBrowser> | undefined;
const loaded = new Map<FontId, Promise<void>>();

async function toBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** pdfmake, loaded on demand and cached offline by the PWA. */
function pdfmake(): Promise<PdfMakeBrowser> {
  ready ??= (async () => {
    const pm = ((await import('pdfmake/build/pdfmake')) as unknown as { default: PdfMakeBrowser }).default;
    pm.setUrlAccessPolicy(() => false);
    return pm;
  })();
  return ready;
}

/** Embed only the families a template uses (each is ~100 KB across its four styles). */
async function withFonts(families: Iterable<FontId>): Promise<PdfMakeBrowser> {
  const pm = await pdfmake();
  await Promise.all(
    [...new Set(families)].map((id) => {
      let p = loaded.get(id);
      if (!p) {
        p = (async () => {
          const font = FONTS[id];
          const vfs: Record<string, string> = {};
          await Promise.all((Object.keys(font.files) as (keyof typeof font.files)[]).map(async (style) => (vfs[font.files[style]] = await toBase64(URLS[id][style]))));
          pm.addVirtualFileSystem(vfs);
          pm.addFonts({ [font.pdf]: { ...font.files } });
        })();
        loaded.set(id, p);
      }
      return p;
    }),
  );
  return pm;
}

const familiesOf = (prefs: ExportPrefs): FontId[] => [TEMPLATES[prefs.template].bodyFont, TEMPLATES[prefs.template].headingFont];

export async function exportPdf(resume: ResumeJSON, prefs: ExportPrefs): Promise<Blob> {
  return (await withFonts(familiesOf(prefs))).createPdf(buildPdfDefinition(resume, prefs)).getBlob();
}

export async function exportCoverPdf(letter: ComposedLetter, prefs: ExportPrefs): Promise<Blob> {
  return (await withFonts(familiesOf(prefs))).createPdf(buildCoverPdfDefinition(letter, prefs)).getBlob();
}
