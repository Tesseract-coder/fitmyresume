import '@fontsource/carlito/latin-400.css';
import '@fontsource/carlito/latin-700.css';
import '@fontsource/carlito/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-700.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import type { CSSProperties, ReactNode } from 'react';
import { SECTION_HEADINGS, contactLines, dateRange } from '@shared/resume-text';
import type { ResumeJSON } from '@shared/schema';
import { FONTS } from '@/lib/export/fonts';
import { THEMES, TEMPLATES, type ExportPrefs } from '@/lib/export/theme';

/** HTML mirror of the PDF/DOCX layout for the live preview (always light, like paper). */
export function ResumePreview({ resume, prefs }: { resume: ResumeJSON; prefs: ExportPrefs }) {
  const t = TEMPLATES[prefs.template];
  const c = THEMES[prefs.theme];
  const scale = 1.333; // pt → px
  const px = (n: number) => n * scale;
  const headingFont = FONTS[t.headingFont].css;

  const H = ({ title }: { title: string }) => {
    const style: CSSProperties = {
      color: t.headingStyle === 'plain' ? c.accent : c.heading,
      fontFamily: headingFont,
      fontSize: px(t.headingSize),
      letterSpacing: px(t.tracking),
      marginTop: px(t.sectionGap),
      marginBottom: px(3),
      ...(t.headingStyle === 'rule' ? { borderBottom: `1px solid ${c.accent}`, paddingBottom: 2 } : {}),
      ...(t.headingStyle === 'overline' ? { borderTop: `1px solid ${c.accent}`, paddingTop: 4 } : {}),
      ...(t.headingStyle === 'bar' ? { borderLeft: `${px(3.5)}px solid ${c.accent}`, paddingLeft: px(6) } : {}),
    };
    return (
      <h3 style={style} className="font-bold">
        {t.upperHeadings ? title.toUpperCase() : title}
      </h3>
    );
  };
  const TwoSide = ({ left, right }: { left: ReactNode; right: string }) => (
    <div className="flex flex-wrap justify-between gap-x-3">
      <span>{left}</span>
      <span style={{ color: c.muted }}>{right}</span>
    </div>
  );

  return (
    <article
      aria-label="Resume preview"
      className="mx-auto w-full max-w-[816px] bg-white text-left shadow-lg ring-1 ring-black/5"
      style={{ padding: px(t.margin) * 0.8, fontFamily: FONTS[t.bodyFont].css, fontSize: px(t.bodySize), color: c.text, lineHeight: t.lineHeight + 0.2 }}
    >
      <header style={{ textAlign: t.centeredHeader ? 'center' : 'left', ...(t.headerRule !== 'none' ? { borderBottom: `${t.headerRule === 'thick' ? 3 : 1}px solid ${c.accent}`, paddingBottom: px(5) } : {}) }}>
        <div style={{ color: t.nameAccent ? c.accent : c.heading, fontSize: px(t.nameSize), fontFamily: headingFont, letterSpacing: px(t.tracking / 2) }} className="font-bold leading-tight">
          {resume.contact.name}
        </div>
        {resume.headline && <div style={{ color: c.muted, fontSize: px(t.bodySize + 1.5) }}>{resume.headline}</div>}
        {contactLines(resume).map((l) => (
          <div key={l} style={{ fontSize: px(t.bodySize - 1) }} className="break-words">
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
              {g.items.join(t.skillSeparator)}
            </p>
          ))}
        </section>
      )}
      {resume.experience.length > 0 && (
        <section>
          <H title={SECTION_HEADINGS.experience} />
          {resume.experience.map((r) => {
            const company = <b style={{ color: c.accent }}>{r.company}</b>;
            const location = r.location && <span style={{ color: c.muted }}> | {r.location}</span>;
            return (
              <div key={r.id} className="mb-1.5">
                {t.roleLayout === 'stacked' ? (
                  <>
                    <TwoSide left={<b>{r.title}</b>} right={dateRange(r.startDate, r.endDate)} />
                    <div>
                      {company}
                      {location}
                    </div>
                  </>
                ) : (
                  <TwoSide
                    left={
                      <>
                        <b>{r.title}</b> | {company}
                        {location}
                      </>
                    }
                    right={dateRange(r.startDate, r.endDate)}
                  />
                )}
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
            );
          })}
        </section>
      )}
      {resume.education.length > 0 && (
        <section>
          <H title={SECTION_HEADINGS.education} />
          {resume.education.map((e, i) => (
            <TwoSide key={i} left={[e.degree, e.institution, e.location, e.gpa && `GPA: ${e.gpa}`].filter(Boolean).join(' | ')} right={dateRange(e.startDate, e.endDate)} />
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
