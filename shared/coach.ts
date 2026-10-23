import type { EvidenceIndex } from './evidence';
import { canonicalize, displayName } from './ontology';
import type { GapAnalysis, GapItem } from './schema';

/**
 * Skills-gap coach (§11.3): for each true gap, what genuinely transfers from the candidate's own
 * evidence, honest learning steps, and phrasing for the cover letter and interviews — never for
 * the resume. Deterministic: no AI, so no invented courses, links or claims.
 */

interface Family {
  /** Plain-language description of the shared skill, used in prose. */
  label: string;
  members: readonly string[];
  /** Concrete bridge exercise from a skill the candidate has to the gap. */
  bridge: (from: string, to: string) => string;
}

const rebuild = (what: string) => (from: string, to: string) => `Rebuild ${what} from your ${from} work in ${to}, so you have something concrete to compare and talk about.`;

/** Close transfers: members share concepts, so experience with one genuinely speeds up learning another. */
export const FAMILIES: readonly Family[] = [
  { label: 'object-oriented programming on the JVM/.NET', members: ['java', 'kotlin', 'scala', 'groovy', 'c#'], bridge: rebuild('a small module or test suite') },
  { label: 'JavaScript/TypeScript development', members: ['javascript', 'typescript', 'node.js'], bridge: rebuild('a small script or service') },
  { label: 'systems programming', members: ['c', 'c++', 'rust', 'go'], bridge: rebuild('a small command-line tool') },
  { label: 'browser test automation', members: ['selenium', 'playwright', 'cypress', 'puppeteer', 'webdriverio'], bridge: (from, to) => `Port a handful of your existing ${from} tests to ${to} and compare locators, waits and reporting.` },
  { label: 'mobile test automation', members: ['appium', 'espresso', 'xcuitest'], bridge: (from, to) => `Automate one real user flow you already cover with ${from} using ${to}.` },
  { label: 'unit-test frameworks', members: ['pytest', 'unittest', 'junit', 'testng', 'jest', 'mocha', 'jasmine', 'vitest'], bridge: (from, to) => `Write the same small test suite in ${to} that you would write in ${from}: fixtures, parametrised tests and mocks.` },
  { label: 'BDD tooling', members: ['cucumber', 'behave', 'specflow', 'gherkin', 'robot framework', 'bdd'], bridge: (from, to) => `Re-express a few of your ${from} scenarios with ${to}.` },
  { label: 'API testing', members: ['postman', 'rest assured', 'soapui', 'api testing', 'contract testing'], bridge: (from, to) => `Recreate a collection of API checks you run with ${from} in ${to}, including auth and schema validation.` },
  { label: 'performance testing', members: ['jmeter', 'gatling', 'locust', 'k6', 'loadrunner', 'performance testing'], bridge: (from, to) => `Script one load scenario you know from ${from} in ${to} and compare the results.` },
  { label: 'cloud platforms', members: ['aws', 'azure', 'gcp'], bridge: (from, to) => `Map the ${from} services you've used to their ${to} equivalents, then deploy one small workload on ${to}.` },
  { label: 'serverless functions', members: ['aws lambda', 'azure functions', 'cloudflare workers'], bridge: rebuild('one small function') },
  { label: 'managed Kubernetes', members: ['eks', 'aks', 'gke', 'openshift', 'kubernetes'], bridge: (from, to) => `Deploy a small app you know from ${from} to ${to}, end to end.` },
  { label: 'containers', members: ['docker', 'kubernetes', 'helm'], bridge: (from, to) => `Take something you already run with ${from} and run it with ${to}.` },
  { label: 'infrastructure as code', members: ['terraform', 'cloudformation', 'ansible', 'puppet', 'chef'], bridge: (from, to) => `Rewrite a small piece of infrastructure you manage with ${from} in ${to}.` },
  { label: 'CI/CD pipelines', members: ['jenkins', 'github actions', 'gitlab ci', 'azure devops', 'circleci', 'travis ci', 'bamboo', 'teamcity', 'argo cd', 'ci/cd'], bridge: (from, to) => `Recreate one of your ${from} pipelines in ${to}: build, test, report.` },
  { label: 'monitoring and observability', members: ['prometheus', 'grafana', 'datadog', 'splunk', 'elk', 'kibana', 'new relic', 'sentry', 'observability'], bridge: (from, to) => `Rebuild a dashboard or alert you know from ${from} in ${to}.` },
  { label: 'frontend frameworks', members: ['react', 'angular', 'vue', 'svelte', 'next.js'], bridge: rebuild('a small UI component') },
  { label: 'web backend frameworks', members: ['spring boot', 'spring framework', 'django', 'flask', 'fastapi', 'express', 'nestjs', '.net', 'asp.net', 'ruby on rails', 'laravel'], bridge: rebuild('a small REST endpoint') },
  { label: 'relational databases', members: ['mysql', 'postgresql', 'sql server', 'oracle database', 'sqlite', 'sql'], bridge: (from, to) => `Run the queries and schema changes you know from ${from} against ${to} and note the differences.` },
  { label: 'NoSQL data stores', members: ['mongodb', 'dynamodb', 'cassandra', 'redis', 'elasticsearch'], bridge: rebuild('a small data model') },
  { label: 'messaging and streaming', members: ['kafka', 'rabbitmq'], bridge: rebuild('a small producer/consumer') },
  { label: 'data warehousing', members: ['snowflake', 'bigquery', 'redshift', 'databricks'], bridge: rebuild('one analytical query') },
  { label: 'cross-platform mobile', members: ['react native', 'flutter'], bridge: rebuild('one screen') },
  { label: 'ML frameworks', members: ['tensorflow', 'pytorch', 'scikit-learn'], bridge: rebuild('one small model') },
];

/** Broad transfers: general-purpose languages share programming fundamentals. */
const GENERAL_LANGUAGES = new Set(['python', 'java', 'javascript', 'typescript', 'c', 'c++', 'c#', 'go', 'rust', 'ruby', 'php', 'kotlin', 'swift', 'scala', 'groovy', 'dart']);

/** Official getting-started material only (stable first-party URLs). */
export const RESOURCES: Readonly<Record<string, { label: string; url: string }>> = {
  java: { label: 'dev.java — Learn Java', url: 'https://dev.java/learn/' },
  kotlin: { label: 'Kotlin — Getting started', url: 'https://kotlinlang.org/docs/getting-started.html' },
  python: { label: 'The Python Tutorial', url: 'https://docs.python.org/3/tutorial/' },
  javascript: { label: 'MDN — JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide' },
  typescript: { label: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook/intro.html' },
  go: { label: 'A Tour of Go', url: 'https://go.dev/tour/' },
  rust: { label: 'The Rust Book', url: 'https://doc.rust-lang.org/book/' },
  'c#': { label: 'Microsoft Learn — C#', url: 'https://learn.microsoft.com/dotnet/csharp/' },
  kubernetes: { label: 'Kubernetes Basics tutorial', url: 'https://kubernetes.io/docs/tutorials/kubernetes-basics/' },
  docker: { label: 'Docker — Get started', url: 'https://docs.docker.com/get-started/' },
  terraform: { label: 'HashiCorp Terraform tutorials', url: 'https://developer.hashicorp.com/terraform/tutorials' },
  ansible: { label: 'Ansible — Getting started', url: 'https://docs.ansible.com/ansible/latest/getting_started/index.html' },
  aws: { label: 'AWS Skill Builder', url: 'https://skillbuilder.aws/' },
  azure: { label: 'Microsoft Learn — Azure training', url: 'https://learn.microsoft.com/training/azure/' },
  gcp: { label: 'Google Cloud training', url: 'https://cloud.google.com/learn/training' },
  playwright: { label: 'Playwright — Getting started', url: 'https://playwright.dev/docs/intro' },
  cypress: { label: 'Cypress documentation', url: 'https://docs.cypress.io/' },
  selenium: { label: 'Selenium documentation', url: 'https://www.selenium.dev/documentation/' },
  appium: { label: 'Appium documentation', url: 'https://appium.io/docs/en/latest/' },
  junit: { label: 'JUnit 5 User Guide', url: 'https://junit.org/junit5/docs/current/user-guide/' },
  testng: { label: 'TestNG documentation', url: 'https://testng.org/' },
  'rest assured': { label: 'REST Assured', url: 'https://rest-assured.io/' },
  jmeter: { label: 'Apache JMeter — Getting started', url: 'https://jmeter.apache.org/usermanual/get-started.html' },
  k6: { label: 'Grafana k6 documentation', url: 'https://grafana.com/docs/k6/latest/' },
  react: { label: 'React — Learn', url: 'https://react.dev/learn' },
  angular: { label: 'Angular tutorials', url: 'https://angular.dev/tutorials' },
  vue: { label: 'Vue.js guide', url: 'https://vuejs.org/guide/introduction.html' },
  'spring boot': { label: 'Spring guides', url: 'https://spring.io/guides' },
  django: { label: 'Django tutorial', url: 'https://docs.djangoproject.com/en/stable/intro/tutorial01/' },
  fastapi: { label: 'FastAPI tutorial', url: 'https://fastapi.tiangolo.com/tutorial/' },
  'node.js': { label: 'Node.js — Learn', url: 'https://nodejs.org/en/learn' },
  kafka: { label: 'Apache Kafka quickstart', url: 'https://kafka.apache.org/quickstart' },
  'github actions': { label: 'GitHub Actions documentation', url: 'https://docs.github.com/actions' },
  jenkins: { label: 'Jenkins tutorials', url: 'https://www.jenkins.io/doc/tutorials/' },
  postgresql: { label: 'PostgreSQL tutorial', url: 'https://www.postgresql.org/docs/current/tutorial.html' },
  mongodb: { label: 'MongoDB University', url: 'https://learn.mongodb.com/' },
  graphql: { label: 'Learn GraphQL', url: 'https://graphql.org/learn/' },
};

/** Optional, well-known certifications (named, not linked). */
export const CERTIFICATIONS: Readonly<Record<string, string>> = {
  kubernetes: 'CNCF Certified Kubernetes Application Developer (CKAD) or Administrator (CKA)',
  aws: 'AWS Certified Cloud Practitioner, then a role-based Associate certification',
  azure: 'Microsoft Certified: Azure Fundamentals (AZ-900)',
  gcp: 'Google Cloud Associate Cloud Engineer',
  terraform: 'HashiCorp Certified: Terraform Associate',
  java: 'Oracle Certified Professional: Java SE Developer',
};

export interface CoachItem {
  canonical: string;
  /** The job's wording. */
  surface: string;
  importance: GapItem['importance'];
  weight: number;
  /** Skills the candidate has (in their own wording) that genuinely transfer, closest first. */
  transfers: string[];
  closeness: 'close' | 'broad' | 'none';
  /** What the transfer has in common, for prose ("browser test automation"). */
  sharedSkill?: string;
  steps: string[];
  resource?: { label: string; url: string };
  certification?: string;
  /** Code-written; the only form in which a gap may appear in a cover letter. */
  coverLetterLine: string;
  /** An honest answer if the gap comes up in an interview. */
  interviewAnswer: string;
}

const list = (items: readonly string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? ''));

function familyOf(canonical: string): Family | undefined {
  return FAMILIES.find((f) => f.members.includes(canonical));
}

/** How the candidate wrote a skill (first surface), else the ontology's display name. */
function asWritten(evidence: EvidenceIndex, canonical: string): string {
  return [...(evidence.surfaces.get(canonical) ?? [])][0] ?? displayName(canonical);
}

/** Evidenced skills that transfer to `canonical`: same family first, then (for languages/clouds) same broad kind. */
export function transfersFor(canonical: string, evidence: EvidenceIndex): Pick<CoachItem, 'transfers' | 'closeness' | 'sharedSkill'> {
  const family = familyOf(canonical);
  const have = [...evidence.techTerms].filter((c) => c !== canonical).sort();
  if (family) {
    const close = have.filter((c) => family.members.includes(c));
    if (close.length) return { transfers: close.slice(0, 3).map((c) => asWritten(evidence, c)), closeness: 'close', sharedSkill: family.label };
  }
  if (GENERAL_LANGUAGES.has(canonical)) {
    const broad = have.filter((c) => GENERAL_LANGUAGES.has(c));
    if (broad.length) return { transfers: broad.slice(0, 3).map((c) => asWritten(evidence, c)), closeness: 'broad', sharedSkill: 'general-purpose programming' };
  }
  return { transfers: [], closeness: 'none' };
}

/** "I bring hands-on experience with Python, and I am actively ramping up on Java." */
export function coverLetterLine(gap: string, transfers: readonly string[]): string {
  return transfers.length ? `I bring hands-on experience with ${list(transfers)}, and I am actively ramping up on ${gap}.` : `I am actively building my skills in ${gap}.`;
}

export function coachItem(item: GapItem, evidence: EvidenceIndex, learning: boolean): CoachItem {
  const t = transfersFor(item.canonical, evidence);
  const name = item.surface;
  const resource = RESOURCES[item.canonical];
  const certification = CERTIFICATIONS[item.canonical];
  const family = familyOf(item.canonical);

  const steps: string[] = [];
  steps.push(resource ? `Work through the official getting-started material: ${resource.label}.` : `Start with the official ${name} documentation and its getting-started guide.`);
  if (t.closeness === 'close' && family) steps.push(family.bridge(t.transfers[0]!, name));
  else if (t.closeness === 'broad') steps.push(`Rebuild something small you've already done in ${t.transfers[0]} using ${name}, so the new syntax maps onto problems you know.`);
  else steps.push(`Build a small, public project that uses ${name} for a realistic task from this job description.`);
  if (certification) steps.push(`Optional: ${certification}.`);
  steps.push(`Once you've used ${name} for real (at work or in a public project), add it to your resume on the Confirm screen — then it counts everywhere.`);

  const kinship = t.closeness === 'close' ? `, which is the same kind of work (${t.sharedSkill})` : `, which shares the fundamentals (${t.sharedSkill})`;
  const closest = t.transfers.length ? `My closest experience is ${list(t.transfers)}${kinship}, so I'd expect to ramp up quickly. ` : '';
  const plan = learning
    ? `I've already started learning it${resource ? ` with ${resource.label}` : ''}.`
    : `My plan would be to start with ${resource ? resource.label : 'the official documentation'} and a small hands-on project.`;
  const interviewAnswer = `"I haven't used ${name} in a professional role yet. ${closest}${plan}"`;

  return {
    canonical: item.canonical,
    surface: name,
    importance: item.importance,
    weight: item.weight,
    ...t,
    steps,
    ...(resource ? { resource } : {}),
    ...(certification ? { certification } : {}),
    coverLetterLine: coverLetterLine(name, t.transfers),
    interviewAnswer,
  };
}

/** All true gaps, must-haves first, then by weight. */
export function coachGaps(gap: GapAnalysis, evidence: EvidenceIndex, learning: readonly string[] = []): CoachItem[] {
  const rank = { must: 0, nice: 1, keyword: 2 } as const;
  return [...gap.gap]
    .sort((a, b) => rank[a.importance] - rank[b.importance] || b.weight - a.weight || a.surface.localeCompare(b.surface))
    .map((i) => coachItem(i, evidence, learning.includes(i.surface)));
}

/** Cover-letter sentences for the gaps the candidate chose to mention (code-written, after validation). */
export function learningLines(terms: readonly string[], evidence: EvidenceIndex): string[] {
  return terms.map((t) => coverLetterLine(t, transfersFor(canonicalize(t), evidence).transfers));
}
