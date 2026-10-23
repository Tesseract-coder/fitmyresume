import { describe, expect, it } from 'vitest';
import { heuristicAnalyzeJd } from '../shared/offline/analyze';
import type { JDProfile } from '../shared/schema';
import { javaSdetJdText } from './fixtures/resumes';

const must = (jd: JDProfile) => jd.mustHave.map((t) => t.canonical).sort();
const nice = (jd: JDProfile) => jd.niceToHave.map((t) => t.canonical).sort();
const other = (jd: JDProfile) => jd.keywords.map((t) => t.canonical).sort();

describe('offline JD analysis', () => {
  it('structured, multi-line JD (regression)', () => {
    const jd = heuristicAnalyzeJd(javaSdetJdText);
    expect(jd).toMatchObject({ title: 'Senior SDET', company: 'Globex', domain: 'fintech', seniority: 'senior' });
    expect(must(jd)).toEqual(['java', 'kubernetes', 'selenium', 'test automation']);
    expect(nice(jd)).toEqual(['ci/cd', 'python', 'terraform']);
  });

  it('the whole JD pasted as one paragraph', () => {
    const jd = heuristicAnalyzeJd(
      'Senior SDET at Globex (fintech). Requirements: 5+ years of Java test automation, Playwright, Azure and Selenium. Nice to have: Rust, GraphQL. You will design automation frameworks for our payment platform.',
    );
    expect(jd).toMatchObject({ title: 'Senior SDET', company: 'Globex', domain: 'fintech', seniority: 'senior' });
    expect(must(jd)).toEqual(['azure', 'java', 'playwright', 'selenium', 'test automation']);
    expect(nice(jd)).toEqual(['graphql', 'rust']);
    expect(jd.responsibilities).toEqual(['You will design automation frameworks for our payment platform']);
  });

  it('narrative prose with implicit requirement language', () => {
    const jd = heuristicAnalyzeJd(
      'Globex is hiring a Senior Backend Engineer to build payment APIs. You have 5+ years of experience with Java and Spring Boot. Experience with Kafka is a plus. Familiarity with Terraform is helpful. You will own services end to end on AWS.',
    );
    expect(jd).toMatchObject({ title: 'Senior Backend Engineer', company: 'Globex', seniority: 'senior' });
    expect(must(jd)).toEqual(['java', 'spring boot']);
    expect(nice(jd)).toEqual(['kafka', 'terraform']);
    expect(other(jd)).toEqual(['aws']);
  });

  it('per-clause cues beat the sentence: required vs preferred vs not required', () => {
    const jd = heuristicAnalyzeJd('QA Engineer\nPython (required), Go (preferred); AWS is required but Azure is a plus. Docker is not required.');
    expect(must(jd)).toEqual(['aws', 'python']);
    expect(nice(jd)).toEqual(['azure', 'docker', 'go']);
  });

  it('header-only lines with dash bullets (copied from a job board)', () => {
    const jd = heuristicAnalyzeJd('Job Title: QA Automation Engineer\nCompany: Initech\n\nQualifications\n- Java\n- Docker\nPreferred Qualifications\n- Kotlin\nResponsibilities\n- Build and maintain the regression suite for our mobile apps');
    expect(jd).toMatchObject({ title: 'QA Automation Engineer', company: 'Initech' });
    expect(must(jd)).toEqual(['docker', 'java']);
    expect(nice(jd)).toEqual(['kotlin']);
    expect(jd.responsibilities).toEqual(['Build and maintain the regression suite for our mobile apps']);
  });

  it('inline bullets and inline headers on one line', () => {
    const jd = heuristicAnalyzeJd('Platform Engineer — Hooli. Must have: • Kubernetes • Terraform • Go Bonus: • Rust • Kafka');
    expect(jd).toMatchObject({ title: 'Platform Engineer', company: 'Hooli' });
    expect(must(jd)).toEqual(['go', 'kubernetes', 'terraform']);
    expect(nice(jd)).toEqual(['kafka', 'rust']);
  });

  it('"looking for" / "join" phrasing for title and company', () => {
    const jd = heuristicAnalyzeJd("We're looking for a Lead Data Engineer to join Acme Corp. Strong experience with Spark and Airflow is essential.");
    expect(jd).toMatchObject({ title: 'Lead Data Engineer', company: 'Acme Corp', seniority: 'lead' });
    expect(must(jd)).toEqual(['airflow', 'spark']);
  });

  it('never returns a paragraph as the title, and leaves unknowns empty', () => {
    const jd = heuristicAnalyzeJd('We build tools for small businesses and need someone who loves React and TypeScript and has strong experience with Node.js. Exposure to GraphQL helps.');
    expect(jd.title).toBe('');
    expect(jd.company).toBeUndefined();
    expect(must(jd)).toEqual(['node.js']);
    expect(nice(jd)).toEqual(['graphql']);
  });

  it('"What you\'ll bring" starts the requirements, ending the responsibilities', () => {
    const jd = heuristicAnalyzeJd(
      "We're hiring a QA Automation Engineer II to join Initrode.\n\nWHAT YOU'LL DO\n• Build and maintain automated tests in Playwright\n\nWHAT YOU'LL BRING\n• 3+ years of experience in test automation\n• Familiarity with Docker is a bonus",
    );
    expect(jd).toMatchObject({ title: 'QA Automation Engineer II', company: 'Initrode' });
    expect(jd.responsibilities).toEqual(['Build and maintain automated tests in Playwright']);
    expect(must(jd)).toEqual(['test automation']);
    expect(nice(jd)).toEqual(['docker']);
    expect(other(jd)).toEqual(['playwright']);
  });

  it('splits short multi-sentence lines and stops at "Our client" (no company)', () => {
    const jd = heuristicAnalyzeJd('Data Engineer | Hooli | Remote. You will lead the design of our streaming pipelines. Must have: Python, Spark. Kafka experience preferred.');
    expect(jd).toMatchObject({ title: 'Data Engineer', company: 'Hooli', seniority: 'unspecified' });
    expect(jd.responsibilities).toEqual(['You will lead the design of our streaming pipelines']);
    expect(must(jd)).toEqual(['python', 'spark']);
    expect(nice(jd)).toEqual(['kafka']);
    expect(heuristicAnalyzeJd('Our client, a leading insurer, seeks an experienced Java developer with 7 years of Java.').company).toBeUndefined();
  });

  it('keeps titles with tech names and "in Test"', () => {
    expect(heuristicAnalyzeJd('Hiring: Java Software Engineer in Test at Umbrella.\nRequirements: Java, Selenium.').title).toBe('Java Software Engineer in Test');
    expect(heuristicAnalyzeJd('Acme is seeking a Junior React Developer.\nYou have experience with React.').title).toBe('Junior React Developer');
  });
});
