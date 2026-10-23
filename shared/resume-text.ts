import type { Bullet, Experience, ResumeJSON } from './schema';

/** All bullets of a role, including project bullets, in document order. */
export function roleBullets(role: Experience): Bullet[] {
  return [...role.bullets, ...(role.projects ?? []).flatMap((p) => p.bullets)];
}

export function allBullets(resume: ResumeJSON): Bullet[] {
  return resume.experience.flatMap(roleBullets);
}

/** Skills section as plain text. */
export function skillsText(resume: ResumeJSON): string {
  return resume.skills.map((g) => `${g.group}: ${g.items.join(', ')}`).join('\n');
}

/**
 * Everything the candidate claims to have done or know, excluding identity fields
 * (name, contact, employer and school names), so a surname like "Jasmine" or an employer
 * like "Oracle" never becomes technology evidence.
 */
export function claimsText(resume: ResumeJSON): string {
  const lines: string[] = [];
  if (resume.headline) lines.push(resume.headline);
  lines.push(resume.summary, resume.yearsOfExperience);
  lines.push(skillsText(resume));
  lines.push(...bodyClaims(resume));
  return lines.filter(Boolean).join('\n');
}

/** Claims outside the Skills section (where "hidden evidence" lives). */
export function bodyClaims(resume: ResumeJSON): string[] {
  const lines: string[] = [];
  for (const role of resume.experience) {
    lines.push(role.title);
    for (const p of role.projects ?? []) if (p.name) lines.push(p.name);
    for (const b of roleBullets(role)) lines.push(b.text);
  }
  for (const e of resume.education) lines.push(e.degree);
  for (const c of resume.certifications) lines.push(c.name);
  for (const a of resume.awards) lines.push([a.name, a.detail].filter(Boolean).join(' '));
  for (const x of resume.extras ?? []) lines.push(...x.items);
  return lines.filter(Boolean);
}

export const SECTION_HEADINGS = {
  summary: 'Professional Summary',
  skills: 'Technical Skills',
  experience: 'Professional Experience',
  education: 'Education',
  certifications: 'Certifications',
  awards: 'Awards',
} as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Best-effort "MMM YYYY" for display; unknown formats are returned unchanged (dates are LOCKED). */
export function formatDate(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^(present|current|now|till date|to date|ongoing)$/i.test(s)) return 'Present';
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/.exec(s);
  if (m) return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return `${MONTHS[Number(m[1]) - 1] ?? m[1]} ${m[2]}`;
  m = /^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (m) {
    const idx = MONTHS.findIndex((mm) => m![1]!.toLowerCase().startsWith(mm.toLowerCase()));
    if (idx >= 0) return `${MONTHS[idx]} ${m[2]}`;
  }
  return s;
}

export function dateRange(start?: string, end?: string): string {
  const a = formatDate(start ?? '');
  const b = formatDate(end ?? '');
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

export function contactLines(resume: ResumeJSON): string[] {
  const c = resume.contact;
  const line1 = [
    c.phone && `Phone: ${c.phone}`,
    c.email && `Email: ${c.email}`,
    c.location && `Location: ${c.location}`,
  ].filter(Boolean);
  const line2 = c.links.filter((l) => l.url).map((l) => `${l.label || linkLabel(l.url)}: ${l.url}`);
  return [line1.join(' | '), line2.join(' | ')].filter(Boolean);
}

export function linkLabel(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('linkedin')) return 'LinkedIn';
  if (u.includes('github')) return 'GitHub';
  if (u.includes('gitlab')) return 'GitLab';
  return 'Portfolio';
}

/** Canonical plain-text rendering: used for TXT export, "Copy as text", length scoring. */
export function renderPlainText(resume: ResumeJSON): string {
  const out: string[] = [];
  out.push(resume.contact.name);
  if (resume.headline) out.push(resume.headline);
  out.push(...contactLines(resume), '');

  if (resume.summary) out.push(SECTION_HEADINGS.summary.toUpperCase(), resume.summary, '');
  if (resume.skills.length) {
    out.push(SECTION_HEADINGS.skills.toUpperCase());
    for (const g of resume.skills) out.push(`${g.group}: ${g.items.join(', ')}`);
    out.push('');
  }
  if (resume.experience.length) {
    out.push(SECTION_HEADINGS.experience.toUpperCase());
    for (const r of resume.experience) {
      out.push(`${r.title} | ${r.company}${r.location ? ` | ${r.location}` : ''}    ${dateRange(r.startDate, r.endDate)}`);
      for (const b of r.bullets) out.push(`- ${b.text}`);
      for (const p of r.projects ?? []) {
        const head = [p.name, p.client && `Client: ${p.client}`].filter(Boolean).join(' | ');
        if (head) out.push(head);
        for (const b of p.bullets) out.push(`- ${b.text}`);
      }
      out.push('');
    }
  }
  if (resume.education.length) {
    out.push(SECTION_HEADINGS.education.toUpperCase());
    for (const e of resume.education) {
      const right = dateRange(e.startDate, e.endDate);
      out.push([`${e.degree} | ${e.institution}`, e.location, e.gpa && `GPA: ${e.gpa}`].filter(Boolean).join(' | ') + (right ? `    ${right}` : ''));
    }
    out.push('');
  }
  if (resume.certifications.length) {
    out.push(SECTION_HEADINGS.certifications.toUpperCase());
    for (const c of resume.certifications) out.push(`- ${[c.name, c.issuer, c.date].filter(Boolean).join(' | ')}`);
    out.push('');
  }
  if (resume.awards.length) {
    out.push(SECTION_HEADINGS.awards.toUpperCase());
    for (const a of resume.awards) out.push(`- ${[a.name, a.year, a.detail].filter(Boolean).join(' | ')}`);
    out.push('');
  }
  for (const x of resume.extras ?? []) {
    if (!x.items.length) continue;
    out.push(x.heading.toUpperCase(), ...x.items.map((i) => `- ${i}`), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
