/** Export templates and colour themes (§8). All variants obey the same ATS rules. */

export type TemplateId = 'modern' | 'classic' | 'compact' | 'elegant' | 'minimal' | 'bold' | 'executive';
export type ThemeId = 'navy' | 'slate' | 'forest' | 'burgundy' | 'plum' | 'ocean' | 'black';
export type FontId = 'carlito' | 'inter' | 'serif';

export interface Theme {
  id: ThemeId;
  label: string;
  /** Headings and name. */
  heading: string;
  /** Section rules and company names. */
  accent: string;
  text: string;
  muted: string;
}

/** Every colour used for text keeps WCAG AA contrast (≥ 4.5:1) on white; see tests/export.test.ts. */
export const THEMES: Record<ThemeId, Theme> = {
  navy: { id: 'navy', label: 'Navy & teal', heading: '#1F3A5F', accent: '#0E7C86', text: '#222222', muted: '#4A4A4A' },
  slate: { id: 'slate', label: 'Slate', heading: '#1E293B', accent: '#475569', text: '#222222', muted: '#4A4A4A' },
  forest: { id: 'forest', label: 'Forest', heading: '#1B4332', accent: '#2D6A4F', text: '#222222', muted: '#4A4A4A' },
  burgundy: { id: 'burgundy', label: 'Burgundy', heading: '#5C1A26', accent: '#8C2B3C', text: '#222222', muted: '#4A4A4A' },
  plum: { id: 'plum', label: 'Plum', heading: '#3F1D4E', accent: '#7A3E8E', text: '#222222', muted: '#4A4A4A' },
  ocean: { id: 'ocean', label: 'Ocean', heading: '#0C3B5E', accent: '#0369A1', text: '#222222', muted: '#4A4A4A' },
  black: { id: 'black', label: 'Plain black', heading: '#111111', accent: '#111111', text: '#111111', muted: '#333333' },
};

export interface Template {
  id: TemplateId;
  label: string;
  description: string;
  /** Points. */
  margin: number;
  nameSize: number;
  bodySize: number;
  headingSize: number;
  /** Space before section headings (pt). */
  sectionGap: number;
  centeredHeader: boolean;
  upperHeadings: boolean;
  /** Letter spacing for headings and the name (pt). */
  tracking: number;
  bodyFont: FontId;
  /** Name and section headings. */
  headingFont: FontId;
  /** How section headings are set off: a rule below, a rule above, an accent bar on the left, or nothing. */
  headingStyle: 'rule' | 'overline' | 'bar' | 'plain';
  /** Accent rule under the contact block. */
  headerRule: 'none' | 'thin' | 'thick';
  /** inline: "Title | Company     dates"; stacked: "Title     dates" then "Company | Location". */
  roleLayout: 'inline' | 'stacked';
  /** The name in the accent colour instead of the heading colour. */
  nameAccent: boolean;
  skillSeparator: ', ' | ' · ';
  lineHeight: number;
}

const BASE = { tracking: 0, bodyFont: 'carlito', headingFont: 'carlito', headingStyle: 'rule', headerRule: 'none', roleLayout: 'inline', nameAccent: false, skillSeparator: ', ', lineHeight: 1.1 } as const;

export const TEMPLATES: Record<TemplateId, Template> = {
  modern: { ...BASE, id: 'modern', label: 'Modern', description: 'Accent colour, clean rules', margin: 43, nameSize: 22, bodySize: 10.5, headingSize: 11.5, sectionGap: 10, centeredHeader: false, upperHeadings: false },
  classic: { ...BASE, id: 'classic', label: 'Classic', description: 'Centred header, uppercase headings', margin: 54, nameSize: 21, bodySize: 10.5, headingSize: 11, sectionGap: 10, centeredHeader: true, upperHeadings: true, tracking: 0.5 },
  compact: { ...BASE, id: 'compact', label: 'Compact', description: 'Tighter spacing to fit one page', margin: 36, nameSize: 20, bodySize: 10, headingSize: 11, sectionGap: 6, centeredHeader: false, upperHeadings: false },
  elegant: {
    ...BASE,
    id: 'elegant',
    label: 'Elegant',
    description: 'Serif type, centred, spacious',
    margin: 54,
    nameSize: 25,
    bodySize: 10.5,
    headingSize: 10.5,
    sectionGap: 12,
    centeredHeader: true,
    upperHeadings: true,
    // ≤ 1pt: wider letter-spacing makes text extraction (and ATS parsers) read "P R O F I L E".
    tracking: 0.9,
    bodyFont: 'serif',
    headingFont: 'serif',
    headerRule: 'thin',
    roleLayout: 'stacked',
    skillSeparator: ' · ',
    lineHeight: 1.2,
  },
  minimal: {
    ...BASE,
    id: 'minimal',
    label: 'Minimal',
    description: 'Inter, airy, no rules',
    margin: 50,
    nameSize: 24,
    bodySize: 9.5,
    headingSize: 9.5,
    sectionGap: 13,
    centeredHeader: false,
    upperHeadings: true,
    tracking: 0.9,
    bodyFont: 'inter',
    headingFont: 'inter',
    headingStyle: 'plain',
    roleLayout: 'stacked',
    nameAccent: true,
    skillSeparator: ' · ',
    lineHeight: 1.25,
  },
  bold: {
    ...BASE,
    id: 'bold',
    label: 'Bold',
    description: 'Large name, accent bars',
    margin: 40,
    nameSize: 27,
    bodySize: 10.5,
    headingSize: 12,
    sectionGap: 11,
    centeredHeader: false,
    upperHeadings: false,
    headingStyle: 'bar',
    headerRule: 'thick',
    nameAccent: true,
    lineHeight: 1.12,
  },
  executive: {
    ...BASE,
    id: 'executive',
    label: 'Executive',
    description: 'Serif headings, refined lines',
    margin: 50,
    nameSize: 23,
    bodySize: 10.5,
    headingSize: 11,
    sectionGap: 11,
    centeredHeader: true,
    upperHeadings: true,
    tracking: 0.9,
    headingFont: 'serif',
    // The first heading's overline already separates the header; a header rule would double it.
    headingStyle: 'overline',
    roleLayout: 'stacked',
    lineHeight: 1.15,
  },
};

export interface ExportPrefs {
  template: TemplateId;
  theme: ThemeId;
}

/** Saved preferences from older versions may name a template or theme that no longer exists. */
export function safePrefs(p: Partial<ExportPrefs> | undefined): ExportPrefs {
  return { template: p?.template && p.template in TEMPLATES ? p.template : 'modern', theme: p?.theme && p.theme in THEMES ? p.theme : 'navy' };
}

/** Firstname_Lastname_Resume_<Company>.<ext> (or _Cover_Letter_) */
export function exportFileName(name: string, company: string | undefined, ext: string, kind: 'Resume' | 'Cover_Letter' | 'Interview_Prep' = 'Resume'): string {
  const clean = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const person = parts.length > 1 ? `${clean(parts[0]!)}_${clean(parts.at(-1)!)}` : clean(parts[0] ?? 'My');
  const co = company ? clean(company) : '';
  return `${person || 'My'}_${kind}${co ? `_${co}` : ''}.${ext}`;
}
