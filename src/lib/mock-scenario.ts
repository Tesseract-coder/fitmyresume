/** E2E only: `?mock=<scenario>` on the dev server selects a mock-AI scenario for the whole tab. */
export const mockScenario: string | undefined = (() => {
  if (!import.meta.env.DEV) return undefined;
  try {
    const q = new URLSearchParams(location.search).get('mock');
    if (q) sessionStorage.setItem('fmr.mock', q);
    return sessionStorage.getItem('fmr.mock') ?? undefined;
  } catch {
    return undefined;
  }
})();
