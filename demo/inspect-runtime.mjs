import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const compose = ['compose', '--project-name', 'spotibuds-local-demo', '--env-file', fileURLToPath(new URL('./.env.localdemo', import.meta.url)), '-f', fileURLToPath(new URL('./compose.yml', import.meta.url))];
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  assert(result.status === 0 && !result.error && !result.signal, 'Named local runtime inspection failed');
  return result.stdout.trim();
}
const ports = { frontend: ['3000/tcp', '3100'], identity: ['8080/tcp', '5101'], music: ['8080/tcp', '5102'], user: ['8080/tcp', '5103'], postgres: ['5432/tcp', '55432'], mongo: ['27017/tcp', '57017'], redis: ['6379/tcp', '56379'], azurite: ['10000/tcp', '10000'], mailpit: ['8025/tcp', '8025'] };
const report = { date: new Date().toISOString(), bindings: [], applicationUids: {}, generatedCredentialFilesExcludedFromFrontendImage: false };
for (const [service, [expectedPort, expectedHostPort]] of Object.entries(ports)) {
  const container = docker([...compose, 'ps', '--quiet', service]);
  assert(/^[a-f0-9]{64}$/.test(container), `Expected one running named ${service} container`);
  const exposed = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]));
  const published = Object.entries(exposed).flatMap(([containerPort, bindings]) => (bindings || []).map(binding => ({ container: `spotibuds-local-demo-${service}-1`, containerPort, hostIp: binding.HostIp, hostPort: binding.HostPort })));
  assert(published.length === 1 && published[0].containerPort === expectedPort && published[0].hostPort === expectedHostPort && published[0].hostIp === '127.0.0.1', `${service} must publish only its documented loopback binding`);
  report.bindings.push(...published);
  if (['frontend', 'identity', 'music', 'user'].includes(service)) {
    const uid = docker(['exec', container, 'id', '-u']);
    assert(/^\d+$/.test(uid) && Number(uid) > 0, `${service} must run as a nonroot application user`);
    report.applicationUids[service] = uid;
  }
  if (service === 'frontend') {
    docker(['exec', container, 'sh', '-c', 'test ! -e /app/demo && test ! -e /app/.git && test ! -e /app/.env.localdemo && test ! -e /app/accounts.local.json && test ! -e /app/assets']);
    report.generatedCredentialFilesExcludedFromFrontendImage = true;
  }
}
assert.equal(report.bindings.length, 9);
await writeFile(new URL('./results-container-inspection.local.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('Runtime isolation passed: nine exact loopback bindings, four nonroot applications, no demo credentials or fixture directory in the frontend image.');
