import { Loader2 } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { useStore } from './lib/store';
import { Home } from './screens/Home';

const Confirm = lazy(() => import('./screens/Confirm'));
const Analysis = lazy(() => import('./screens/Analysis'));
const Review = lazy(() => import('./screens/Review'));
const Export = lazy(() => import('./screens/Export'));
const HistoryScreen = lazy(() => import('./screens/History'));
const CoverLetter = lazy(() => import('./screens/CoverLetter'));
const GapCoach = lazy(() => import('./screens/GapCoach'));
const LinkedIn = lazy(() => import('./screens/LinkedIn'));
const Strengthen = lazy(() => import('./screens/Strengthen'));

function Spinner() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-teal-600" />
    </div>
  );
}

/** Redirect to the start when a step's prerequisites are missing (e.g. after clearing data). */
function Need({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? children : <Navigate to="/" replace />;
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const s = useStore((st) => st.session);
  return (
    <BrowserRouter>
      <Layout>
        {!hydrated ? (
          <Spinner />
        ) : (
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/confirm" element={<Need when={!!(s.extracted || s.baseline)}><Confirm /></Need>} />
              <Route path="/analysis" element={<Need when={!!(s.baseline && s.jd)}><Analysis /></Need>} />
              <Route path="/review" element={<Need when={!!(s.baseline && s.jd && s.outcome)}><Review /></Need>} />
              <Route path="/export" element={<Need when={!!s.baseline}><Export /></Need>} />
              <Route path="/cover-letter" element={<Need when={!!(s.baseline && s.jd)}><CoverLetter /></Need>} />
              <Route path="/gap-coach" element={<Need when={!!(s.baseline && s.jd)}><GapCoach /></Need>} />
              <Route path="/linkedin" element={<Need when={!!(s.baseline && s.jd)}><LinkedIn /></Need>} />
              <Route path="/strengthen" element={<Need when={!!(s.baseline && s.jd)}><Strengthen /></Need>} />
              <Route path="/history" element={<HistoryScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        )}
      </Layout>
    </BrowserRouter>
  );
}
