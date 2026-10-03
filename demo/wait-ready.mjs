import { ready } from './demo-api.mjs';
await ready(process.argv.includes('--once') ? { attempts: 1 } : undefined);
const frontend = await fetch('http://127.0.0.1:3100', { signal: AbortSignal.timeout(10000) });
if (!frontend.ok) throw new Error(`Frontend readiness returned ${frontend.status}`);
console.log('Local frontend and all three API readiness checks passed.');
