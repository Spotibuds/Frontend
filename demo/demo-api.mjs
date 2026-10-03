import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export const urls = Object.freeze({ identity: 'http://127.0.0.1:5101', music: 'http://127.0.0.1:5102', user: 'http://127.0.0.1:5103', mail: 'http://127.0.0.1:8025' });
export async function accounts() { return JSON.parse((await readFile(new URL('./accounts.local.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, '')); }
export async function api(service, path, { method = 'GET', body, token, cookie, headers = {}, expected } = {}) {
  if (!Object.hasOwn(urls, service) || !path.startsWith('/') || path.startsWith('//')) throw new Error('Only fixed isolated local services are permitted');
  const requestHeaders = { 'X-Spotibuds-Request': '1', Origin: 'http://127.0.0.1:3100', ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (cookie) requestHeaders.Cookie = cookie;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData) && !(body instanceof Blob)) { requestHeaders['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const response = await fetch(urls[service] + path, { method, headers: requestHeaders, body: payload, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (expected !== undefined ? ![].concat(expected).includes(response.status) : !response.ok)
    throw new Error(`${service} ${method} ${path.split('?')[0]} returned ${response.status}`);
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}
export async function login(account) {
  const result = await api('identity', '/api/auth/login', { method: 'POST', body: { username: account.username, password: account.password } });
  if (!result.data?.token || !result.cookie || !result.data?.user?.id) throw new Error('Login response violates session contract');
  return { ...result.data, cookie: result.cookie };
}
export async function ready({ attempts = 60 } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) throw new Error('Readiness attempts must be an integer from 1 to 60');
  for (const service of ['identity', 'music', 'user']) {
    let ok = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try { if ((await api(service, '/health/ready', { expected: [200, 503] })).status === 200) { ok = true; break; } } catch { }
      if (attempt + 1 < attempts) await delay(1000);
    }
    if (!ok) throw new Error(`${service} did not become ready within ${attempts} bounded attempts`);
  }
}
