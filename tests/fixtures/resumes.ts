import type { JDProfile, ResumeJSON } from '../../shared/schema';

/** Python-only QA automation engineer: the canonical "never add Java" candidate. */
export const pythonQa: ResumeJSON = {
  contact: {
    name: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    phone: '+91 98765 43210',
    location: 'Pune, India',
    links: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/priyasharma' },
      { label: 'GitHub', url: 'https://github.com/priyasharma' },
    ],
  },
  summary:
    'QA Automation Engineer with 6+ years of experience building Pytest automation for web and API testing. Reduced regression time by 40% through parallel execution.',
  yearsOfExperience: '6+ years',
  skills: [
    { group: 'Languages', items: ['Python', 'SQL'] },
    { group: 'Testing', items: ['Pytest', 'Selenium', 'Postman'] },
    { group: 'DevOps', items: ['Jenkins', 'Docker', 'K8s'] },
  ],
  experience: [
    {
      id: 'r1',
      company: 'Acme Fintech',
      title: 'Senior QA Automation Engineer',
      location: 'Pune, India',
      startDate: 'Jan 2021',
      endDate: 'Present',
      bullets: [
        { id: 'r1b1', text: 'Built a Pytest automation framework for 1,200 API test cases across 14 microservices.' },
        { id: 'r1b2', text: 'Reduced regression time by 40% by parallelising Selenium suites on Docker containers.' },
        { id: 'r1b3', text: 'Integrated automated tests into Jenkins pipelines and deployed test runners with Terraform.' },
        { id: 'r1b4', text: 'Contributed to the migration of test environments to K8s.' },
      ],
    },
    {
      id: 'r2',
      company: 'Bright Retail',
      title: 'QA Engineer',
      location: 'Mumbai, India',
      startDate: 'Jun 2018',
      endDate: 'Dec 2020',
      bullets: [
        { id: 'r2b1', text: 'Tested REST APIs with Postman and wrote SQL queries to validate data.' },
        { id: 'r2b2', text: 'Wrote Selenium tests in Python for the checkout flow.' },
        { id: 'r2b3', text: 'Reported and triaged defects in Jira.' },
      ],
    },
  ],
  education: [{ degree: 'B.E. Computer Engineering', institution: 'University of Pune', endDate: '2018', gpa: '8.1' }],
  certifications: [{ name: 'ISTQB Foundation Level', issuer: 'ISTQB', date: '2019' }],
  awards: [{ name: 'Quality Champion', year: '2022' }],
};

/** JD that wants Java + Kubernetes + Terraform (Java is a true gap). */
export const javaSdetJd: JDProfile = {
  title: 'Senior SDET',
  seniority: 'senior',
  domain: 'fintech',
  company: 'Globex',
  mustHave: [
    { canonical: 'java', surface: 'Java', weight: 3 },
    { canonical: 'kubernetes', surface: 'Kubernetes', weight: 3 },
    { canonical: 'selenium', surface: 'Selenium', weight: 2 },
    { canonical: 'test automation', surface: 'test automation', weight: 3 },
  ],
  niceToHave: [
    { canonical: 'terraform', surface: 'Terraform', weight: 2 },
    { canonical: 'python', surface: 'Python', weight: 1 },
  ],
  responsibilities: ['Design and maintain automation frameworks'],
  softSkills: ['communication'],
  keywords: [{ canonical: 'ci/cd', surface: 'CI/CD', weight: 2 }],
};

export const javaSdetJdText = `Senior SDET — Globex (fintech)
Requirements: 5+ years of Java test automation, Kubernetes, Selenium.
Nice to have: Terraform, Python. Experience with CI/CD pipelines.
You will design and maintain automation frameworks that keep our payment platform reliable at scale every single day.`;
