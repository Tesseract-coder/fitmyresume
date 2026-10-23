import regular from '@fontsource/carlito/files/carlito-latin-400-normal.woff?url';
import bold from '@fontsource/carlito/files/carlito-latin-700-normal.woff?url';
import italic from '@fontsource/carlito/files/carlito-latin-400-italic.woff?url';
import boldItalic from '@fontsource/carlito/files/carlito-latin-700-italic.woff?url';
import type { ResumeJSON } from '@shared/schema';
import { PDF_FONT, PDF_FONT_FILES, buildPdfDefinition } from './pdf-doc';
import type { ExportPrefs } from './theme';

interface PdfMakeBrowser {
  addVirtualFileSystem(vfs: Record<string, string>): void;
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  createPdf(def: Record<string, unknown>): { getBlob(): Promise<Blob> };
}

let ready: Promise<PdfMakeBrowser> | undefined;

async function toBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** pdfmake + embedded Carlito (metric-compatible with Calibri), loaded on demand and cached offline by the PWA. */
function pdfmake(): Promise<PdfMakeBrowser> {
  ready ??= (async () => {
    const mod = (await import('pdfmake/build/pdfmake')) as unknown as { default: PdfMakeBrowser };
    const pm = mod.default;
    const urls = { normal: regular, bold, italics: italic, bolditalics: boldItalic };
    const vfs: Record<string, string> = {};
    await Promise.all(
      (Object.keys(urls) as (keyof typeof urls)[]).map(async (k) => {
        vfs[PDF_FONT_FILES[k]] = await toBase64(urls[k]);
      }),
    );
    pm.addVirtualFileSystem(vfs);
    pm.addFonts({ [PDF_FONT]: { ...PDF_FONT_FILES } });
    pm.setUrlAccessPolicy(() => false);
    return pm;
  })();
  return ready;
}

export async function exportPdf(resume: ResumeJSON, prefs: ExportPrefs): Promise<Blob> {
  const pm = await pdfmake();
  return pm.createPdf(buildPdfDefinition(resume, prefs)).getBlob();
}
