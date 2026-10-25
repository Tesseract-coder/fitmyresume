/** Export templates and colour themes (§8). All variants obey the same ATS rules. */

export type TemplateId = 'modern' | 'classic' | 'compact';
export type ThemeId = 'navy' | 'slate' | 'forest' | 'burgundy' | 'black';

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

export const THEMES: Record<ThemeId, Theme> = {
  navy: { id: 'navy', label: 'Navy & teal', heading: '#1F3A5F', accent: '#0E7C86', text: '#222222', muted: '#4A4A4A' },
  slate: { id: 'slate', label: 'Slate', heading: '#1E293B', accent: '#475569', text: '#222222', muted: '#4A4A4A' },
  forest: { id: 'forest', label: 'Forest', heading: '#1B4332', accent: '#2D6A4F', text: '#222222', muted: '#4A4A4A' },
  burgundy: { id: 'burgundy', label: 'Burgundy', heading: '#5C1A26', accent: '#8C2B3C', text: '#222222', muted: '#4A4A4A' },
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
}

export const TEMPLATES: Record<TemplateId, Template> = {
  modern: { id: 'modern', label: 'Modern', description: 'Accent colour, clean rules', margin: 43, nameSize: 22, bodySize: 10.5, headingSize: 11.5, sectionGap: 10, centeredHeader: false, upperHeadings: false },
  classic: { id: 'classic', label: 'Classic', description: 'Centred header, uppercase headings', margin: 54, nameSize: 21, bodySize: 10.5, headingSize: 11, sectionGap: 10, centeredHeader: true, upperHeadings: true },
  compact: { id: 'compact', label: 'Compact', description: 'Tighter spacing to fit one page', margin: 36, nameSize: 20, bodySize: 10, headingSize: 11, sectionGap: 6, centeredHeader: false, upperHeadings: false },
};

export interface ExportPrefs {
  template: TemplateId;
  theme: ThemeId;
}

/** Firstname_Lastname_Resume_<Company>.<ext> (or _Cover_Letter_) */
export function exportFileName(name: string, company: string | undefined, ext: string, kind: 'Resume' | 'Cover_Letter' | 'Interview_Prep' = 'Resume'): string {
  const clean = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const person = parts.length > 1 ? `${clean(parts[0]!)}_${clean(parts.at(-1)!)}` : clean(parts[0] ?? 'My');
  const co = company ? clean(company) : '';
  return `${person || 'My'}_${kind}${co ? `_${co}` : ''}.${ext}`;
}
