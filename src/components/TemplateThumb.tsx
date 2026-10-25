import type { ReactNode } from 'react';
import { FONTS } from '@/lib/export/fonts';
import type { Template, Theme } from '@/lib/export/theme';

/** A miniature page drawn from a template's settings, in the chosen colours (decorative). */
export function TemplateThumb({ t, c }: { t: Template; c: Theme }) {
  const W = 80;
  const pad = 8;
  const inner = W - 2 * pad;
  const x = (w: number) => (t.centeredHeader ? (W - w) / 2 : pad);
  const grey = '#cbd5e1';
  let y = pad;
  const parts: ReactNode[] = [];

  parts.push(<rect key="name" x={x(40)} y={y} width={40} height={t.nameSize > 24 ? 6 : 5} rx={1} fill={t.nameAccent ? c.accent : c.heading} />);
  y += 9;
  parts.push(<rect key="c1" x={x(52)} y={y} width={52} height={1.6} rx={0.8} fill={grey} />, <rect key="c2" x={x(36)} y={y + 3.5} width={36} height={1.6} rx={0.8} fill={grey} />);
  y += 8;
  if (t.headerRule !== 'none') {
    parts.push(<rect key="hr" x={pad} y={y} width={inner} height={t.headerRule === 'thick' ? 1.6 : 0.6} fill={c.accent} />);
    y += 4;
  }

  for (let s = 0; s < 3; s++) {
    y += t.sectionGap > 11 ? 4 : 3;
    const hx = t.headingStyle === 'bar' ? pad + 3.5 : pad;
    if (t.headingStyle === 'overline') parts.push(<rect key={`o${s}`} x={pad} y={y - 1.5} width={inner} height={0.5} fill={c.accent} />);
    if (t.headingStyle === 'bar') parts.push(<rect key={`b${s}`} x={pad} y={y} width={1.6} height={3} fill={c.accent} />);
    parts.push(<rect key={`h${s}`} x={hx} y={y} width={t.upperHeadings ? 26 : 22} height={2.6} rx={0.5} fill={t.headingStyle === 'plain' ? c.accent : c.heading} />);
    y += 4;
    if (t.headingStyle === 'rule') {
      parts.push(<rect key={`r${s}`} x={pad} y={y} width={inner} height={0.5} fill={c.accent} />);
      y += 2;
    }
    const lines = s === 1 ? 4 : 2;
    for (let l = 0; l < lines; l++) {
      const w = l === 0 && s === 1 ? 34 : inner - (l % 2) * 10;
      parts.push(<rect key={`l${s}${l}`} x={pad + (s === 1 && l > 0 ? 2 : 0)} y={y + l * 3.4} width={w} height={1.5} rx={0.75} fill={l === 0 && s === 1 ? c.accent : grey} />);
    }
    y += lines * 3.4;
  }

  return (
    <svg viewBox={`0 0 ${W} 104`} className="h-auto w-full rounded border border-slate-200 bg-white" aria-hidden="true">
      {parts}
      <text x={W - pad} y={100} textAnchor="end" fontSize="9" fontFamily={FONTS[t.headingFont].css} fontWeight="700" fill={c.heading}>
        Aa
      </text>
    </svg>
  );
}
