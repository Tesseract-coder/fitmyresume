import { extractTerms } from './ontology';
import type { ExtractedResume, ResumeJSON } from './schema';
import { collapseSpace, normalizeSpace } from './text';

export interface ExtractionReview {
  resume: ResumeJSON;
  /** Paths the extractor flagged as uncertain, or whose text isn't verbatim in the source. */
  flags: Record<string, string>;
}

const squash = (s: string) => normalizeSpace(s).toLowerCase().replace(/[^\p{L}\p{N}+#%]+/gu, '');

/**
 * Turn extractor output into a ResumeJSON with stable ids, and cross-check it against the raw
 * text. The confirmed resume becomes the evidence baseline, so anything the extractor may have
 * invented (text not present in the source, tech terms not in the source) is flagged for review.
 */
export function reviewExtraction(raw: string, x: ExtractedResume): ExtractionReview {
  const flags: Record<string, string> = {};
  const source = squash(raw);
  const sourceTerms = new Set(extractTerms(raw).map((m) => m.canonical));
  const check = (path: string, text: string | undefined) => {
    if (!text?.trim()) return;
    const key = squash(text);
    if (key && !source.includes(key)) flags[path] = 'Not found word-for-word in your file — please check.';
    const invented = extractTerms(text).filter((m) => !sourceTerms.has(m.canonical));
    if (invented.length) flags[path] = `Mentions ${invented.map((m) => m.surface).join(', ')}, which isn't in your file.`;
  };

  if (x.contact._uncertain) flags['contact'] = 'Please check your contact details.';
  check('contact.name', x.contact.name);
  check('contact.email', x.contact.email);
  check('summary', x.summary);
  check('headline', x.headline);

  const resume: ResumeJSON = {
    contact: {
      name: x.contact.name.trim(),
      email: x.contact.email.trim(),
      phone: x.contact.phone.trim(),
      location: x.contact.location.trim(),
      links: x.contact.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    },
    ...(x.headline ? { headline: x.headline.trim() } : {}),
    summary: collapseSpace(x.summary),
    yearsOfExperience: x.yearsOfExperience.trim(),
    skills: x.skills
      .map((g, gi) => {
        const items = g.items.map((i) => i.trim()).filter(Boolean);
        items.forEach((item, ii) => check(`skills.${gi}.${ii}`, item));
        return { group: g.group.trim() || 'Skills', items };
      })
      .filter((g) => g.items.length),
    experience: x.experience.map((r, ri) => {
      const id = `r${ri + 1}`;
      if (r._uncertain) flags[`experience.${id}`] = 'Please check the title, company and dates.';
      for (const f of ['company', 'title', 'startDate'] as const) check(`experience.${id}.${f}`, r[f]);
      let n = 0;
      const bullet = (text: string) => {
        const b = { id: `${id}b${++n}`, text: collapseSpace(text) };
        check(`bullet:${b.id}`, text);
        return b;
      };
      const projects = r.projects?.map((p) => ({
        ...(p.name ? { name: p.name.trim() } : {}),
        ...(p.client ? { client: p.client.trim() } : {}),
        bullets: p.bullets.filter((t) => t.trim()).map(bullet),
      }));
      return {
        id,
        company: r.company.trim(),
        title: r.title.trim(),
        location: r.location.trim(),
        startDate: r.startDate.trim(),
        endDate: r.endDate.trim(),
        bullets: r.bullets.filter((t) => t.trim()).map(bullet),
        ...(projects?.length ? { projects } : {}),
      };
    }),
    education: x.education.map((e, i) => {
      if (e._uncertain) flags[`education.${i}`] = 'Please check this education entry.';
      check(`education.${i}.degree`, e.degree);
      return strip({ degree: e.degree.trim(), institution: e.institution.trim(), location: e.location, startDate: e.startDate, endDate: e.endDate, gpa: e.gpa });
    }),
    certifications: x.certifications.filter((c) => c.name.trim()).map((c, i) => {
      if (c._uncertain) flags[`certifications.${i}`] = 'Please check this certification.';
      return strip({ name: c.name.trim(), issuer: c.issuer, date: c.date });
    }),
    awards: x.awards.filter((a) => a.name.trim()).map((a, i) => {
      if (a._uncertain) flags[`awards.${i}`] = 'Please check this award.';
      return strip({ name: a.name.trim(), year: a.year, detail: a.detail });
    }),
    ...(x.extras?.length ? { extras: x.extras.filter((e) => e.items.length).map((e) => ({ heading: e.heading.trim(), items: e.items.map((i) => i.trim()) })) } : {}),
  };
  if (!resume.contact.name) flags['contact.name'] = 'Name is missing.';
  if (!resume.experience.length) flags['experience'] = 'No work experience was found — please check your file.';
  return { resume, flags };
}

function strip<T extends Record<string, string | undefined>>(o: T): { [K in keyof T]: T[K] } {
  const out = {} as Record<string, string>;
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v.trim() !== '') out[k] = v.trim();
  return out as { [K in keyof T]: T[K] };
}
