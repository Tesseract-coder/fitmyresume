import { SECTION_HEADINGS, contactLines, dateRange } from '@shared/resume-text';
import type { ResumeJSON } from '@shared/schema';
import { THEMES, TEMPLATES, type ExportPrefs } from '@/lib/export/theme';

/** HTML mirror of the PDF/DOCX layout for the live preview (always light, like paper). */
export function ResumePreview({ resume, prefs }: { resume: ResumeJSON; prefs: ExportPrefs }) {
  const t = TEMPLATES[prefs.template];
  const c = THEMES[prefs.theme];
  const scale = 1.333; // pt → px
  const H = ({ title }: { title: string }) => (
    <h3 style={{ color: c.heading, fontSize: t.headingSize * scale, marginTop: t.sectionGap * scale, borderBottom: `1px solid ${c.accent}`, letterSpacing: t.upperHeadings ? 0.5 : 0 }} className="mb-1 pb-0.5 font-bold">
      {t.upperHeadings ? title.toUpperCase() : title}
    </h3>
  );
  return (
    <article
      aria-label="Resume preview"
      className="mx-auto w-full max-w-[816px] bg-white text-left shadow-lg ring-1 ring-black/5"
      style={{ padding: t.margin * scale * 0.8, fontFamily: 'Carlito, Calibri, Arial, sans-serif', fontSize: t.bodySize * scale, color: c.text, lineHeight: 1.3 }}
    >
      <header style={{ textAlign: t.centeredHeader ? 'center' : 'left' }}>
        <div style={{ color: c.heading, fontSize: t.nameSize * scale }} className="font-bold leading-tight">
          {resume.contact.name}
        </div>
        {resume.headline && <div style={{ color: c.muted, fontSize: (t.bodySize + 1.5) * scale }}>{resume.headline}</div>}
        {contactLines(resume).map((l) => (
          <div key={l} style={{ fontSize: (t.bodySize - 1) * scale }} className="break-words">
            {l}
          </div>
        ))}
      </header>
      {resume.summary && (
        <section>
          <H title={SECTION_HEADINGS.summary} />
          <p>{resume.summary}</p>
        </section>
      )}
      {resume.skills.length > 0 && (
        <section>
          <H title={SECTION_HEADINGS.skills} />
          {resume.skills.map((g) => (
            <p key={g.group}>
              <b style={{ color: c.heading }}>{g.group}: </b>
              {g.items.join(', ')}
            </p>
          ))}
        </section>
      )}
      {resume.experience.length > 0 && (
        <section>
          <H title={SECTION_HEADINGS.experience} />
          {resume.experience.map((r) => (
            <div key={r.id} className="mb-1.5">
              <div className="flex flex-wrap justify-between gap-x-3">
                <span>
                  <b>{r.title}</b> | <b style={{ color: c.accent }}>{r.company}</b>
                  {r.location && <span style={{ color: c.muted }}> | {r.location}</span>}
                </span>
                <span style={{ color: c.muted }}>{dateRange(r.startDate, r.endDate)}</span>
              </div>
              <ul className="list-disc pl-5">
                {r.bullets.map((b) => (
                  <li key={b.id}>{b.text}</li>
                ))}
              </ul>
              {r.projects?.map((p, i) => (
                <div key={i}>
                  <i style={{ color: c.muted }}>{[p.name && `Project: ${p.name}`, p.client && `Client: ${p.client}`].filter(Boolean).join(' | ')}</i>
                  <ul className="list-disc pl-5">
                    {p.bullets.map((b) => (
                      <li key={b.id}>{b.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
      {resume.education.length > 0 && (
        <section>
          <H title={SECTION_HEADINGS.education} />
          {resume.education.map((e, i) => (
            <div key={i} className="flex flex-wrap justify-between gap-x-3">
              <span>{[e.degree, e.institution, e.location, e.gpa && `GPA: ${e.gpa}`].filter(Boolean).join(' | ')}</span>
              <span style={{ color: c.muted }}>{dateRange(e.startDate, e.endDate)}</span>
            </div>
          ))}
        </section>
      )}
      {resume.certifications.length > 0 && (
        <section>
          <H title={SECTION_HEADINGS.certifications} />
          <ul className="list-disc pl-5">
            {resume.certifications.map((x, i) => (
              <li key={i}>{[x.name, x.issuer, x.date].filter(Boolean).join(' | ')}</li>
            ))}
          </ul>
        </section>
      )}
      {resume.awards.length > 0 && (
        <section>
          <H title={SECTION_HEADINGS.awards} />
          <ul className="list-disc pl-5">
            {resume.awards.map((a, i) => (
              <li key={i}>{[a.name, a.year, a.detail].filter(Boolean).join(' | ')}</li>
            ))}
          </ul>
        </section>
      )}
      {resume.extras?.map((x) => (
        <section key={x.heading}>
          <H title={x.heading} />
          <ul className="list-disc pl-5">
            {x.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
