import type { FontId } from './theme';

/**
 * One entry per font family a template can use:
 *  - pdf:  the family name and virtual-file names registered with pdfmake (fonts are embedded)
 *  - docx: the font Word uses (installed on virtually every machine; ATS parsers ignore fonts)
 *  - css:  the stack the on-screen preview uses
 */
export const FONTS: Record<FontId, { pdf: string; files: { normal: string; bold: string; italics: string; bolditalics: string }; docx: string; css: string }> = {
  carlito: {
    pdf: 'Carlito',
    files: { normal: 'Carlito-Regular.woff', bold: 'Carlito-Bold.woff', italics: 'Carlito-Italic.woff', bolditalics: 'Carlito-BoldItalic.woff' },
    docx: 'Calibri',
    css: 'Carlito, Calibri, Arial, sans-serif',
  },
  inter: {
    pdf: 'Inter',
    files: { normal: 'Inter-Regular.woff', bold: 'Inter-Bold.woff', italics: 'Inter-Italic.woff', bolditalics: 'Inter-BoldItalic.woff' },
    docx: 'Arial',
    css: 'Inter, Arial, sans-serif',
  },
  serif: {
    pdf: 'SourceSerif',
    files: { normal: 'SourceSerif4-Regular.woff', bold: 'SourceSerif4-Bold.woff', italics: 'SourceSerif4-Italic.woff', bolditalics: 'SourceSerif4-BoldItalic.woff' },
    docx: 'Georgia',
    css: "'Source Serif 4', Georgia, serif",
  },
};

/** @fontsource file stems for each family (…-latin-400-normal.woff etc.). */
export const FONT_SOURCES: Record<FontId, string> = {
  carlito: 'carlito/files/carlito',
  inter: 'inter/files/inter',
  serif: 'source-serif-4/files/source-serif-4',
};

export const STYLE_FILES = { normal: '400-normal', bold: '700-normal', italics: '400-italic', bolditalics: '700-italic' } as const;
