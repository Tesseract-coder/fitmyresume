import { ExtractedResumeSchema, type ExtractedResume } from '../schema';
import { collapseSpace } from '../text';

/**
 * Deterministic resume structurer. Used when no AI is available (quota exhausted, offline,
 * dev/E2E mock). It copies text verbatim and marks anything it is unsure of as _uncertain,
 * so the Confirm screen can ask the user to check it.
 */

type Section = 'header' | 'summary' | 'skills' | 'experience' | 'education' | 'certifications' | 'awards' | 'extra';

const HEADINGS: [Section, RegExp][] = [
  ['summary', /^(professional\s+summary|summary|profile|professional\s+profile|about(\s+me)?|career\s+objective|objective|career\s+summary)$/i],
  ['skills', /^(technical\s+skills|skills|core\s+(skills|competencies)|key\s+skills|tech(nical)?\s+stack|tools(\s+&\s+technologies)?|skills\s+&\s+tools|technologies|competencies)$/i],
  ['experience', /^(professional\s+experience|work\s+experience|experience|employment(\s+history)?|work\s+history|career\s+history|relevant\s+experience)$/i],
  ['education', /^(education|academic(s|\s+background)?|education\s+&\s+training|qualifications)$/i],
  ['certifications', /^(certifications?|certificates?|licen[cs]es(\s+&\s+certifications)?|certifications\s+&\s+training)$/i],
  ['awards', /^(awards?|honou?rs(\s+&\s+awards)?|achievements|awards\s+&\s+achievements|recognition)$/i],
  ['extra', /^(projects|personal\s+projects|publications|volunteer(ing)?(\s+experience)?|languages|interests|activities|patents|talks)$/i],
];

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = `(?:${MONTH}\\.?,?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4}[/.-]\\d{1,2}|\\d{4})`;
const END = `(?:${DATE}|present|current|now|till\\s+date|to\\s+date|ongoing)`;
const RANGE_RE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until|till)\\s*(${END})`, 'i');
const SINGLE_YEAR_RE = /\b(19|20)\d{2}\b/;

const ROLE_WORDS = /\b(engineer|developer|manager|analyst|lead|tester|qa|sdet|consultant|architect|designer|intern|specialist|scientist|administrator|director|head|officer|associate|programmer|coordinator|technician|executive|founder|president|owner|vp|cto|ceo|devops|sre|automation)\b/i;
const BULLET_RE = /^\s*[•▪●◦‣∙·*–—-]\s*/;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|[\w-]+\.(?:dev|io|me|com|net|org|app))(?:\/[\w\-./%~#?=&]*)?/gi;
const LOCATION_RE = /^[A-Z][\p{L} .'-]+,\s*[A-Z][\p{L} .'-]+$/u;
const DEGREE_RE = /\b(b\.?\s?e\.?|b\.?\s?tech|m\.?\s?tech|bachelor|master|m\.?\s?s\.?|b\.?\s?s\.?|b\.?\s?sc|m\.?\s?sc|b\.?\s?a\.?|m\.?\s?a\.?|mba|mca|bca|ph\.?\s?d|diploma|associate|high school|hsc|ssc)\b/i;
const SCHOOL_RE = /\b(university|college|institute|school|academy|iit|nit|polytechnic)\b/i;
const GPA_RE = /\b(?:c?gpa|grade|percentage)\s*[:\-]?\s*([\d.]+\s*(?:\/\s*[\d.]+|%)?)/i;

/** Re-join lines that a PDF wrapped: lower-case continuations, trailing commas, split two-cell rows. */
function unwrap(raw: string[]): string[] {
  const out: string[] = [];
  for (const rawLine of raw) {
    const line = rawLine.replace(/[ \u00a0]+/g, ' ').trim();
    if (!line) continue;
    const prev = out.at(-1);
    if (prev === undefined || BULLET_RE.test(line) || headingOf(line) || headingOf(prev)) {
      out.push(line);
      continue;
    }
    const pc = prev.split('\t');
    const lc = line.split('\t');
    if (pc.length === 2 && lc.length === 2 && /[,&|–-]$/.test(pc[0]!.trim())) {
      out[out.length - 1] = `${pc[0]!.trim()} ${lc[0]!.trim()}\t${pc[1]!.trim()} ${lc[1]!.trim()}`;
    } else if (/^[a-z]+[\s,]/.test(line) || (/,$/.test(prev) && !prev.includes('\t'))) {
      out[out.length - 1] = `${prev} ${line}`;
    } else out.push(line);
  }
  return out;
}

function headingOf(line: string): { section: Section; heading: string } | undefined {
  const clean = line.replace(/[:\s]+$/, '').trim();
  if (clean.length > 40) return undefined;
  for (const [section, re] of HEADINGS) if (re.test(clean)) return { section, heading: titleCase(clean) };
  return undefined;
}

function titleCase(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}

function splitSegments(line: string): string[] {
  return line
    .split(/\s+[|•·]\s+|\s{3,}|\t+|\s+[–—]\s+|\s+-\s+|\s+@\s+|\s+at\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function heuristicExtract(rawText: string): ExtractedResume {
  const lines = unwrap(rawText.split(/\r?\n/))
    // Tabs (right-aligned dates) separate fields: keep them as an explicit separator.
    .map((l) => collapseSpace(l.replace(/\t+/g, ' | ')).replace(/^\|\s*|\s*\|$/g, ''))
    .filter(Boolean);

  const buckets: Record<Section, string[]> = { header: [], summary: [], skills: [], experience: [], education: [], certifications: [], awards: [], extra: [] };
  const extras: { heading: string; items: string[] }[] = [];
  let current: Section = 'header';
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      current = h.section;
      if (h.section === 'extra') extras.push({ heading: h.heading, items: [] });
      continue;
    }
    if (current === 'extra') extras.at(-1)!.items.push(line.replace(BULLET_RE, ''));
    else buckets[current].push(line);
  }

  const contact = parseHeader(buckets.header);
  const summary = buckets.summary.map((l) => l.replace(BULLET_RE, '')).join(' ');
  const years = /(\d+(?:\.\d+)?\s*\+?\s*(?:\+\s*)?years?)/i.exec(summary)?.[1] ?? '';

  return ExtractedResumeSchema.parse({
    contact: contact.contact,
    ...(contact.headline ? { headline: contact.headline } : {}),
    summary,
    yearsOfExperience: years.replace(/\s+\+/, '+'),
    skills: parseSkills(buckets.skills),
    experience: parseExperience(buckets.experience),
    education: parseEducation(buckets.education),
    certifications: buckets.certifications.map((l) => parseCert(l.replace(BULLET_RE, ''))),
    awards: buckets.awards.map((l) => parseAward(l.replace(BULLET_RE, ''))),
    ...(extras.length ? { extras: extras.filter((x) => x.items.length) } : {}),
  });
}

function parseHeader(lines: string[]) {
  let name = '';
  let headline: string | undefined;
  let email = '';
  let phone = '';
  let location = '';
  const links: { label: string; url: string }[] = [];

  for (const line of lines) {
    const e = EMAIL_RE.exec(line)?.[0];
    if (e && !email) email = e;
    const withoutEmail = line.replace(EMAIL_RE, ' ');
    for (const m of withoutEmail.matchAll(URL_RE)) {
      const url = m[0].replace(/[.,;]$/, '');
      if (!links.some((l) => l.url === url)) links.push({ label: labelFor(url), url });
    }
    const withoutUrls = withoutEmail.replace(URL_RE, ' ');
    const p = PHONE_RE.exec(withoutUrls)?.[0];
    if (p && !phone) phone = p.trim();

    const segments = withoutUrls
      .replace(PHONE_RE, ' ')
      .split(/\s*[|•·]\s*|\s{3,}/)
      .map((s) => s.replace(/^(phone|mobile|email|e-mail|location|address|linkedin|github|portfolio)\s*:\s*/i, '').trim())
      .filter((s) => s && /\p{L}/u.test(s));
    const contactish = !!(e || p || links.length);
    for (const seg of segments) {
      if (!location && (LOCATION_RE.test(seg) || /^(remote)$/i.test(seg))) {
        location = seg;
        continue;
      }
      if (!name && !contactish && seg.split(' ').length <= 5) {
        name = seg;
        continue;
      }
      if (name && !headline && !contactish && segments.length === 1) headline = seg;
    }
  }
  const uncertain = !name || !email || !phone;
  return {
    contact: { name, email, phone, location, links, ...(uncertain ? { _uncertain: true } : {}) },
    headline,
  };
}

function labelFor(url: string): string {
  if (/linkedin/i.test(url)) return 'LinkedIn';
  if (/github/i.test(url)) return 'GitHub';
  if (/gitlab/i.test(url)) return 'GitLab';
  return 'Portfolio';
}

function parseSkills(lines: string[]) {
  const groups: { group: string; items: string[] }[] = [];
  for (const raw of lines) {
    const line = raw.replace(BULLET_RE, '');
    const m = /^([^:]{2,40}):\s*(.+)$/.exec(line);
    const group = m ? m[1]!.trim() : 'Skills';
    const items = (m ? m[2]! : line)
      .split(/\s*[,|•;·]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const existing = groups.find((g) => g.group === group);
    if (existing) existing.items.push(...items);
    else groups.push({ group, items });
  }
  return groups;
}

interface RoleDraft {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
  projects?: { name?: string; client?: string; bullets: string[] }[];
  _uncertain?: boolean;
}

function parseExperience(lines: string[]): RoleDraft[] {
  const roles: RoleDraft[] = [];
  let pending: string[] = [];
  let lastWasBullet = false;
  const target = () => {
    const role = roles.at(-1)!;
    return role.projects?.at(-1)?.bullets ?? role.bullets;
  };

  for (const line of lines) {
    const range = RANGE_RE.exec(line);
    const isBullet = BULLET_RE.test(line);
    if (range && !isBullet) {
      const rest = collapseSpace(line.replace(range[0], ' ').replace(/[|,–—-]\s*$/, '').replace(/^\s*[|,–—-]/, ''));
      // Full sentences waiting in `pending` are glyph-less bullets of the previous role, not header lines.
      while (roles.length && pending.length && isSentence(pending[0]!)) target().push(pending.shift()!);
      roles.push(buildRole([...pending, rest].filter(Boolean), range[1]!, range[2]!));
      pending = [];
      lastWasBullet = false;
      continue;
    }
    if (!roles.length) {
      pending.push(line);
      continue;
    }
    if (isBullet) {
      flushProject(roles.at(-1)!, pending);
      pending = [];
      target().push(line.replace(BULLET_RE, ''));
      lastWasBullet = true;
      continue;
    }
    const bullets = target();
    const prev = bullets.at(-1);
    // Wrapped bullet: starts lower-case, or the previous bullet hasn't ended its sentence.
    if (lastWasBullet && prev !== undefined && (/^[a-z(]/.test(line) || !/[.!?;:)]$/.test(prev))) {
      bullets[bullets.length - 1] = `${prev} ${line}`;
      continue;
    }
    if (/^(project|client)\s*:/i.test(line)) {
      pending.push(line);
      lastWasBullet = false;
      continue;
    }
    // A long line or a full sentence without a glyph is a bullet (PDFs often drop bullet glyphs).
    if ((line.length > 60 || isSentence(line)) && !pending.length) {
      bullets.push(line);
      lastWasBullet = true;
      continue;
    }
    pending.push(line);
    lastWasBullet = false;
  }
  return roles;
}

function isSentence(line: string): boolean {
  return line.length >= 25 && /[.!?]$/.test(line) && line.split(' ').length >= 4;
}

function flushProject(role: RoleDraft, pending: string[]) {
  if (!pending.length) return;
  const name = pending.find((l) => /^project\s*:/i.test(l))?.replace(/^project\s*:\s*/i, '');
  const client = pending.find((l) => /^client\s*:/i.test(l))?.replace(/^client\s*:\s*/i, '');
  if (name || client) {
    role.projects ??= [];
    role.projects.push({ ...(name ? { name } : {}), ...(client ? { client } : {}), bullets: [] });
  } else {
    // Not a project header: probably bullets without glyphs.
    (role.projects?.at(-1)?.bullets ?? role.bullets).push(...pending);
  }
}

function buildRole(parts: string[], start: string, end: string): RoleDraft {
  const segments = parts.flatMap(splitSegments);
  let title = '';
  let company = '';
  let location = '';
  for (const seg of segments) {
    if (!title && ROLE_WORDS.test(seg)) {
      // "Software Engineer, PayFlow" → title + company
      const [a, ...b] = seg.split(/,\s+/);
      const restPart = b.join(', ');
      if (b.length && !ROLE_WORDS.test(restPart) && !company) {
        title = a!;
        company = restPart;
      } else title = seg;
      continue;
    }
    if (!location && (LOCATION_RE.test(seg) || /^remote$/i.test(seg)) && company) {
      location = seg;
      continue;
    }
    if (!company) {
      const comma = /^(.+?),\s*([A-Z][\p{L} .'-]+(?:,\s*[A-Z][\p{L} .'-]+)?)$/u.exec(seg);
      if (comma && !ROLE_WORDS.test(comma[1]!) && comma[2]!.length <= 30) {
        company = comma[1]!;
        location ||= comma[2]!;
      } else company = seg;
      continue;
    }
    if (!location) location = seg;
  }
  const uncertain = !title || !company;
  return { company, title, location, startDate: start, endDate: end, bullets: [], ...(uncertain ? { _uncertain: true } : {}) };
}

/** Field separators for education/certification lines (no " at " / dash splitting: "University of Texas at Dallas"). */
function splitFields(line: string): string[] {
  return line
    .split(/\s+\|\s+|\t+|\s{3,}|,\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseEducation(lines: string[]) {
  const out: { degree: string; institution: string; location?: string; startDate?: string; endDate?: string; gpa?: string; _uncertain?: boolean }[] = [];
  for (const raw of lines) {
    const line = raw.replace(BULLET_RE, '');
    const segments = splitFields(line);
    const range = RANGE_RE.exec(line);
    const gpa = GPA_RE.exec(line)?.[1]?.trim();
    const isNew = DEGREE_RE.test(line) || !out.length;
    const entry = isNew ? { degree: '', institution: '' } : out.at(-1)!;
    for (const seg of segments) {
      const s = seg.replace(GPA_RE, '').replace(range?.[0] ?? '\u0000', '').replace(/[|,]\s*$/, '').trim();
      if (!s) continue;
      if (!entry.degree && DEGREE_RE.test(s)) entry.degree = s;
      else if (!entry.institution && SCHOOL_RE.test(s)) entry.institution = s;
      else if (!entry.institution && entry.degree) entry.institution = s;
    }
    if (range) {
      (entry as { startDate?: string }).startDate = range[1];
      (entry as { endDate?: string }).endDate = range[2];
    } else {
      const y = SINGLE_YEAR_RE.exec(line)?.[0];
      if (y && !(entry as { endDate?: string }).endDate) (entry as { endDate?: string }).endDate = y;
    }
    if (gpa) (entry as { gpa?: string }).gpa = gpa;
    if (isNew) out.push(entry);
  }
  return out.map((e) => (!e.degree || !e.institution ? { ...e, _uncertain: true } : e));
}

function parseCert(line: string) {
  const segments = splitFields(line);
  const date = segments.find((s) => SINGLE_YEAR_RE.test(s) && s.length <= 14);
  const rest = segments.filter((s) => s !== date);
  return { name: rest[0] ?? line, ...(rest[1] ? { issuer: rest[1] } : {}), ...(date ? { date } : {}) };
}

function parseAward(line: string) {
  const year = SINGLE_YEAR_RE.exec(line)?.[0];
  const segments = splitSegments(line.replace(/\(?\b(19|20)\d{2}\b\)?/, '').trim()).filter(Boolean);
  return { name: segments[0] ?? line, ...(year ? { year } : {}), ...(segments[1] ? { detail: segments.slice(1).join(' | ') } : {}) };
}
