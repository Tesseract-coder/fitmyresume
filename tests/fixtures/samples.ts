import type { ResumeJSON } from '../../shared/schema';
import { pythonQa } from './resumes';

/**
 * Source data for the five parser fixtures (tests/fixtures/files). `scripts/make-fixtures.ts`
 * renders each into a real PDF/DOCX with the given layout; the parsing tests read the files back
 * and compare against this data.
 */
export interface Sample {
  file: string;
  layout: 'pdf-1col' | 'pdf-2col' | 'docx' | 'pdf-1col-plain';
  resume: ResumeJSON;
}

const arjun: ResumeJSON = {
  contact: {
    name: 'Arjun Mehta',
    email: 'arjun.mehta@example.com',
    phone: '+91 99887 76655',
    location: 'Bengaluru, India',
    links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/arjunmehta' }],
  },
  headline: 'Backend Engineer',
  summary: 'Backend Engineer with 5 years of experience building Java and Spring Boot microservices for payments.',
  yearsOfExperience: '5 years',
  skills: [
    { group: 'Languages', items: ['Java', 'SQL', 'Kotlin'] },
    { group: 'Frameworks', items: ['Spring Boot', 'Hibernate', 'JUnit'] },
    { group: 'Cloud', items: ['AWS', 'Docker', 'Kafka'] },
  ],
  experience: [
    {
      id: 'r1',
      company: 'PayFlow',
      title: 'Software Engineer',
      location: 'Bengaluru, India',
      startDate: 'Mar 2021',
      endDate: 'Present',
      bullets: [
        { id: 'r1b1', text: 'Designed Spring Boot payment services handling 2 million transactions per day.' },
        { id: 'r1b2', text: 'Introduced Kafka event streaming between ledger and settlement services.' },
        { id: 'r1b3', text: 'Wrote JUnit and Mockito tests raising coverage to 85%.' },
      ],
    },
    {
      id: 'r2',
      company: 'Infosys',
      title: 'Associate Engineer',
      location: 'Mysuru, India',
      startDate: 'Jul 2019',
      endDate: 'Feb 2021',
      bullets: [
        { id: 'r2b1', text: 'Maintained Hibernate data access layers for a banking client.' },
        { id: 'r2b2', text: 'Fixed production defects within agreed SLAs.' },
      ],
    },
  ],
  education: [{ degree: 'B.Tech Information Technology', institution: 'VIT University', endDate: '2019' }],
  certifications: [{ name: 'AWS Certified Developer – Associate', issuer: 'Amazon', date: '2022' }],
  awards: [],
};

const maria: ResumeJSON = {
  contact: {
    name: 'Maria Lopez',
    email: 'maria.lopez@example.com',
    phone: '+1 415 555 0134',
    location: 'Austin, TX',
    links: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/marialopez' },
      { label: 'GitHub', url: 'https://github.com/marialopez' },
    ],
  },
  summary: 'Frontend Developer with 4+ years of experience shipping React and TypeScript applications.',
  yearsOfExperience: '4+ years',
  skills: [
    { group: 'Frontend', items: ['React', 'TypeScript', 'Redux', 'CSS'] },
    { group: 'Testing', items: ['Jest', 'Cypress'] },
  ],
  experience: [
    {
      id: 'r1',
      company: 'Shoply',
      title: 'Frontend Developer',
      location: 'Austin, TX',
      startDate: 'Feb 2022',
      endDate: 'Present',
      bullets: [
        { id: 'r1b1', text: 'Rebuilt the checkout UI in React and TypeScript, cutting bundle size by 30%.' },
        { id: 'r1b2', text: 'Added Cypress end-to-end tests for 12 critical user journeys.' },
      ],
    },
    {
      id: 'r2',
      company: 'Webcraft Studio',
      title: 'Junior Web Developer',
      location: 'Dallas, TX',
      startDate: 'Jun 2020',
      endDate: 'Jan 2022',
      bullets: [
        { id: 'r2b1', text: 'Built responsive marketing pages with React and CSS modules.' },
        { id: 'r2b2', text: 'Wrote Jest unit tests for shared UI components.' },
      ],
    },
  ],
  education: [{ degree: 'B.S. Computer Science', institution: 'University of Texas at Dallas', endDate: '2020' }],
  certifications: [],
  awards: [{ name: 'Hackathon Winner', year: '2021' }],
};

const david: ResumeJSON = {
  contact: {
    name: 'David Chen',
    email: 'david.chen@example.com',
    phone: '+44 20 7946 0958',
    location: 'London, UK',
    links: [{ label: 'GitHub', url: 'https://github.com/davidchen' }],
  },
  summary: 'DevOps Engineer with 7 years of experience automating cloud infrastructure with Terraform and Kubernetes.',
  yearsOfExperience: '7 years',
  skills: [
    { group: 'Cloud', items: ['AWS', 'Azure', 'Terraform'] },
    { group: 'Containers', items: ['Docker', 'Kubernetes', 'Helm'] },
    { group: 'CI/CD', items: ['Jenkins', 'GitHub Actions'] },
  ],
  experience: [
    {
      id: 'r1',
      company: 'CloudOps Consulting',
      title: 'DevOps Consultant',
      location: 'London, UK',
      startDate: 'Jan 2020',
      endDate: 'Present',
      bullets: [{ id: 'r1b1', text: 'Delivered cloud migrations for enterprise clients across finance and retail.' }],
      projects: [
        {
          name: 'Bank Migration',
          client: 'Northbank',
          bullets: [
            { id: 'r1b2', text: 'Migrated 40 services to Azure Kubernetes Service using Helm charts.' },
            { id: 'r1b3', text: 'Built Terraform modules for network and identity resources.' },
          ],
        },
      ],
    },
    {
      id: 'r2',
      company: 'Telco Ltd',
      title: 'Systems Engineer',
      location: 'Manchester, UK',
      startDate: 'Sep 2017',
      endDate: 'Dec 2019',
      bullets: [
        { id: 'r2b1', text: 'Automated server provisioning with Ansible and Jenkins.' },
        { id: 'r2b2', text: 'Reduced deployment time from 3 hours to 20 minutes.' },
      ],
    },
  ],
  education: [{ degree: 'M.Sc. Computer Networks', institution: 'University of Manchester', endDate: '2017' }],
  certifications: [{ name: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2021' }],
  awards: [],
};

const lena: ResumeJSON = {
  contact: {
    name: 'Lena Fischer',
    email: 'lena.fischer@example.com',
    phone: '+49 30 1234 5678',
    location: 'Berlin, Germany',
    links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/lenafischer' }],
  },
  summary: 'Data Analyst with 3 years of experience turning SQL and Python analysis into Tableau dashboards.',
  yearsOfExperience: '3 years',
  skills: [
    { group: 'Analysis', items: ['SQL', 'Python', 'pandas'] },
    { group: 'BI', items: ['Tableau', 'Power BI', 'Microsoft Excel'] },
  ],
  experience: [
    {
      id: 'r1',
      company: 'Mobility GmbH',
      title: 'Data Analyst',
      location: 'Berlin, Germany',
      startDate: 'Apr 2022',
      endDate: 'Present',
      bullets: [
        { id: 'r1b1', text: 'Built Tableau dashboards used by 6 regional operations teams.' },
        { id: 'r1b2', text: 'Automated weekly SQL reporting with Python and Airflow.' },
      ],
    },
    {
      id: 'r2',
      company: 'Retail Insights',
      title: 'Junior Analyst',
      location: 'Hamburg, Germany',
      startDate: 'Oct 2021',
      endDate: 'Mar 2022',
      bullets: [
        { id: 'r2b1', text: 'Cleaned sales data with pandas for monthly forecasting.' },
        { id: 'r2b2', text: 'Presented findings to category managers.' },
      ],
    },
  ],
  education: [{ degree: 'B.Sc. Economics', institution: 'Humboldt University of Berlin', endDate: '2021' }],
  certifications: [],
  awards: [],
};

export const SAMPLES: Sample[] = [
  { file: 'priya-1col.pdf', layout: 'pdf-1col', resume: pythonQa },
  { file: 'arjun.docx', layout: 'docx', resume: arjun },
  { file: 'maria-2col.pdf', layout: 'pdf-2col', resume: maria },
  { file: 'david-projects.docx', layout: 'docx', resume: david },
  { file: 'lena-plain.pdf', layout: 'pdf-1col-plain', resume: lena },
];
