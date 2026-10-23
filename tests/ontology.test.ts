import { describe, expect, it } from 'vitest';
import { DISTINCT_PAIRS, TERMS, canonicalize, extractTerms, extractCanonicals, impliedBy, lookupCanonical, sameTechnology, freeExtras, displayName } from '../shared/ontology';

const canon = (s: string) => [...extractCanonicals(s)].sort();

describe('ontology normalisation', () => {
  it.each([
    ['k8s', 'kubernetes'],
    ['K8s', 'kubernetes'],
    ['js', 'javascript'],
    ['gh actions', 'github actions'],
    ['AKS', 'aks'],
    ['Azure Kubernetes Service', 'aks'],
    ['Postgres', 'postgresql'],
    ['Kubernetes (K8s)', 'kubernetes'],
  ])('%s → %s', (alias, expected) => {
    expect(lookupCanonical(alias)).toBe(expected);
  });

  it('AKS implies Azure and Kubernetes; Pytest implies Python', () => {
    expect(impliedBy('aks').sort()).toEqual(['azure', 'kubernetes']);
    expect(impliedBy('pytest')).toContain('python');
  });

  it('unknown phrases fall back to a stemmed phrase key', () => {
    expect(lookupCanonical('Test Strategies')).toBeUndefined();
    expect(canonicalize('Test Strategies')).toBe('test strategy');
    expect(displayName('kubernetes')).toBe('Kubernetes');
    expect(displayName('not-a-term')).toBe('not-a-term');
  });
});

describe('forbidden aliases never match', () => {
  it.each(DISTINCT_PAIRS.map(([a, b]) => [a, b]))('%s ≠ %s', (a, b) => {
    expect(sameTechnology(a, b)).toBe(false);
    expect(lookupCanonical(a)).not.toBe(lookupCanonical(b));
  });

  it('no alias of one term resolves to a distinct partner', () => {
    for (const t of TERMS) {
      for (const alias of t.aliases) expect(lookupCanonical(alias)).toBe(t.canonical);
    }
  });

  it('Java is never found inside JavaScript', () => {
    expect(canon('Built UIs in JavaScript and TypeScript')).toEqual(['javascript', 'typescript']);
    expect(canon('Strong Java and JavaScript')).toEqual(['java', 'javascript']);
  });

  it('React Native does not also count as React', () => {
    expect(canon('Shipped apps with React Native')).toEqual(['react native']);
    expect(canon('React and React Native')).toEqual(['react', 'react native']);
  });

  it('C, C++ and C# are distinct', () => {
    expect(canon('Wrote C, C++ and C# services')).toEqual(['c', 'c#', 'c++']);
    expect(canon('Embedded C/C++')).toEqual(['c', 'c++']);
  });

  it('SQL Server ≠ MySQL, AWS ≠ Azure, Selenium ≠ Playwright', () => {
    expect(canon('Migrated SQL Server to MySQL')).toEqual(['mysql', 'sql server']);
    expect(canon('AWS and Azure')).toEqual(['aws', 'azure']);
    expect(canon('Selenium and Playwright')).toEqual(['playwright', 'selenium']);
  });
});

describe('matcher precision', () => {
  it('ignores English words that collide with case-sensitive tech names', () => {
    expect(canon('We react quickly to go-live issues and the rest of the team')).toEqual([]);
    expect(canon('C-level stakeholders and R&D')).toEqual([]);
    expect(canon('Go and React')).toEqual(['go', 'react']);
  });

  it('does not match inside URLs or longer identifiers', () => {
    expect(canon('see github.com/priya')).toEqual([]);
    expect(canon('Node.js, Next.js and ASP.NET')).toEqual(['asp.net', 'next.js', 'node.js']);
  });

  it('handles plurals, hyphens and spacing variants', () => {
    expect(canon('Built microservice and end to end tests')).toEqual(['end-to-end testing', 'microservices']);
    expect(canon('ci/cd pipelines')).toEqual(['ci/cd']);
  });

  it('matches free JD phrases supplied as extras', () => {
    const extras = freeExtras([{ canonical: 'test strategy', surface: 'Test Strategy' }, { canonical: 'kubernetes', surface: 'Kubernetes' }]);
    expect(extras).toEqual([{ canonical: 'test strategy', surface: 'Test Strategy' }]);
    const m = extractTerms('Defined test strategies for Kubernetes', extras);
    expect(m.map((x) => [x.canonical, !!x.free])).toEqual([['test strategy', true], ['kubernetes', false]]);
  });
});
