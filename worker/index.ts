import { app } from './app';

// Static assets are served by Workers Static Assets; only /api/* reaches this code (run_worker_first).
export default app;
