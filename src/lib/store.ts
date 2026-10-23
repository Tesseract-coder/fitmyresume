import { del, get, set } from 'idb-keyval';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Change } from '@shared/changes';
import type { CoverLetterDraft } from '@shared/cover';
import type { TailorOutcome } from '@shared/pipeline';
import type { JDProfile, ResumeJSON } from '@shared/schema';
import type { TemplateId, ThemeId } from './export/theme';

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  resumeText: string;
  fileName?: string;
  /** Source file used columns/tables (affects the "before" formatting score only). */
  multiColumn: boolean;
  jdText: string;
  /** Extractor output awaiting confirmation, plus fields to double-check. */
  extracted?: ResumeJSON;
  flags: Record<string, string>;
  /** The user-confirmed resume: the LOCKED baseline and the evidence source. */
  baseline?: ResumeJSON;
  jd?: JDProfile;
  /** Numbers/facts the user typed in answer to metric questions. */
  userFacts: string[];
  outcome?: TailorOutcome;
  accepted: string[];
  userEdits: Record<string, string>;
  /** How the last step ran: AI or deterministic offline rules. */
  engine: 'ai' | 'offline';
  /** Cover letter for this resume + job (cleared when either changes). */
  coverLetter?: CoverLetterDraft;
  /** Gap skills the user says they're learning (skills-gap coach ↔ cover letter). */
  learningSkills?: string[];
  exportPrefs: { template: TemplateId; theme: ThemeId };
}

interface Store {
  session: Session;
  hydrated: boolean;
  update(patch: Partial<Session>): void;
  setOutcome(outcome: TailorOutcome, engine: Session['engine']): void;
  toggle(changeId: string, on?: boolean): void;
  acceptSafe(): void;
  setUserEdit(bulletId: string, text: string, facts: string[]): void;
  newSession(): void;
  load(session: Session): void;
}

export function blankSession(): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    resumeText: '',
    multiColumn: false,
    jdText: '',
    flags: {},
    userFacts: [],
    accepted: [],
    userEdits: {},
    engine: 'ai',
    exportPrefs: { template: 'modern', theme: 'navy' },
  };
}

const idbStorage = createJSONStorage(() => ({
  getItem: async (name: string) => (await get<string>(name)) ?? null,
  setItem: (name: string, value: string) => set(name, value),
  removeItem: (name: string) => del(name),
}));

export const useStore = create<Store>()(
  persist(
    (setState, getState) => ({
      session: blankSession(),
      hydrated: false,
      update: (patch) => setState((s) => ({ session: { ...s.session, ...patch, updatedAt: Date.now() } })),
      setOutcome: (outcome, engine) =>
        setState((s) => ({ session: { ...s.session, outcome, engine, accepted: [], userEdits: {}, updatedAt: Date.now() } })),
      toggle: (id, on) =>
        setState((s) => {
          const acc = new Set(s.session.accepted);
          const next = on ?? !acc.has(id);
          if (next) acc.add(id);
          else acc.delete(id);
          return { session: { ...s.session, accepted: [...acc], updatedAt: Date.now() } };
        }),
      acceptSafe: () => {
        const changes: Change[] = getState().session.outcome?.changes ?? [];
        setState((s) => ({
          session: { ...s.session, accepted: [...new Set([...s.session.accepted, ...changes.filter((c) => c.safe).map((c) => c.id)])], updatedAt: Date.now() },
        }));
      },
      setUserEdit: (bulletId, text, facts) =>
        setState((s) => ({
          session: {
            ...s.session,
            userEdits: { ...s.session.userEdits, [bulletId]: text },
            userFacts: [...new Set([...s.session.userFacts, ...facts])],
            updatedAt: Date.now(),
          },
        })),
      newSession: () => setState({ session: blankSession() }),
      load: (session) => setState({ session }),
    }),
    {
      name: 'fmr.session',
      storage: idbStorage,
      partialize: (s) => ({ session: s.session }),
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
    },
  ),
);
