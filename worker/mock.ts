import { analyzeGap } from '../shared/gap';
import { heuristicCoverLetter } from '../shared/offline/cover';
import { heuristicAnalyzeJd } from '../shared/offline/analyze';
import { heuristicExtract } from '../shared/offline/extract';
import { heuristicTailor } from '../shared/offline/tailor';
import type { CoverTone, JDProfile, ResumeJSON } from '../shared/schema';
import { ProviderError } from './providers';

/**
 * Deterministic stand-in for the LLM (MOCK_AI=1: local dev and E2E). It speaks the Workers AI
 * SSE format so the real client decoding, validation and retry paths are exercised.
 * The `x-fmr-mock` header selects adversarial scenarios for tests.
 */
export type MockInput =
  | { task: 'extract'; resumeText: string }
  | { task: 'analyze'; jdText: string }
  | { task: 'tailor'; resume: ResumeJSON; jd: JDProfile }
  | { task: 'cover'; resume: ResumeJSON; jd: JDProfile; tone: CoverTone; motivation?: string };

export function mockResponse(input: MockInput, mode: 'stream' | 'json', scenario: string | null): Response {
  if (scenario === 'quota') throw new ProviderError('The free daily AI allowance is used up.', 429, 'AI_QUOTA');
  let value: unknown;
  if (input.task === 'extract') value = heuristicExtract(input.resumeText);
  else if (input.task === 'analyze') value = heuristicAnalyzeJd(input.jdText);
  else if (input.task === 'cover') {
    const res = heuristicCoverLetter(input.resume, input.jd, analyzeGap(input.resume, input.jd), { tone: input.tone, ...(input.motivation ? { motivation: input.motivation } : {}) });
    if (scenario === 'inject') {
      const fake = gapTermFor(input.resume, input.jd);
      res.paragraphs.splice(1, 0, `I have 9 years of hands-on ${fake} experience and led a team that improved deployment speed by 73%.`);
    }
    value = res;
  } else {
    const res = heuristicTailor(input.resume, input.jd, analyzeGap(input.resume, input.jd));
    if (scenario === 'inject') inject(res, input.resume, input.jd);
    value = res;
  }
  let text = JSON.stringify(value);
  // "broken-json": the stream is malformed so the client must use its one automatic JSON-mode retry.
  if (scenario === 'broken-json' && mode === 'stream') text = `Here is your JSON: ${text.slice(0, -5)}`;
  if (mode === 'json') return Response.json({ text });

  const enc = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,40}/g) ?? [];
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      for (const c of chunks) {
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ response: c })}\n\n`));
        await new Promise((r) => setTimeout(r, 2));
      }
      ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
      ctrl.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

/** Simulate a misbehaving model: fabricated skills, a fake metric, a title change and inflation. */
function gapTermFor(resume: ResumeJSON, jd: JDProfile): string {
  return [...jd.mustHave, ...jd.niceToHave].find((t) => !JSON.stringify(resume).toLowerCase().includes(t.surface.toLowerCase()))?.surface ?? 'Rust';
}

function inject(res: ReturnType<typeof heuristicTailor>, resume: ResumeJSON, jd: JDProfile) {
  const fake = gapTermFor(resume, jd);
  res.skills = [{ group: 'Core', items: [fake, ...(res.skills[0]?.items ?? [])] }, ...res.skills.slice(1)];
  const first = resume.experience[0]?.bullets[0];
  if (first) res.bulletEdits.push({ bulletId: first.id, newText: `${first.text.replace(/\.$/, '')}, improving release velocity by 73%.`, reason: 'impact', jdTermsUsed: [] });
  const second = resume.experience[0]?.bullets[1];
  if (second) res.bulletEdits.push({ bulletId: second.id, newText: `Led ${second.text.charAt(0).toLowerCase()}${second.text.slice(1)}`, reason: 'ownership', jdTermsUsed: [] });
  res.summary = `${res.summary} Expert in ${fake}.`;
}
