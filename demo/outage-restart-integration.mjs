import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { accounts, api, login, ready, urls } from './demo-api.mjs';

const baseArgs = ['compose', '-p', 'spotibuds-local-demo', '--env-file', fileURLToPath(new URL('./.env.localdemo', import.meta.url)), '-f', fileURLToPath(new URL('./compose.yml', import.meta.url))];
const report = { date: new Date().toISOString(), scope: 'Only named isolated spotibuds-local-demo containers; persistent volumes preserved', completed: false, dependenciesRestored: false, checks: [], statusCommandChecks: [] };
const stopped = new Set();
function compose(args) { const result = spawnSync('docker', [...baseArgs, ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }); if (result.status !== 0) throw new Error('Isolated Compose control failed'); return result.stdout.trim(); }
function check(condition, name, target = report.checks) { if (!condition) throw new Error(name); target.push({ name, passed: true }); }
function statusCode() {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', fileURLToPath(new URL('./Demo.ps1', import.meta.url)), '-Action', 'status'], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  if (result.error || result.signal || !Number.isInteger(result.status)) throw new Error('Isolated demo status command did not complete');
  return result.status;
}
async function stop(name) { stopped.add(name); compose(['stop', '--timeout', '5', name]); }
async function start(name) { compose(['start', name]); stopped.delete(name); }
async function awaitStatus(service, status) { for (let attempt = 0; attempt < 30; attempt++) { try { if ((await api(service, '/health/ready', { expected: [200, 503] })).status === status) return; } catch { } await delay(500); } throw new Error(`${service} readiness did not reach ${status}`); }
function containers() { return Object.fromEntries(['identity', 'music', 'user'].map(name => [name, compose(['ps', '-q', name])])); }
function sameContainers(before) { const after = containers(); return Object.keys(before).every(name => before[name] === after[name]); }
async function bytes(url, range) { const target = new URL(url); if (target.origin !== urls.music) throw new Error('Fixture audio must use the stable local Music proxy'); const response = await fetch(target, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(15000) }); return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) }; }
function sha(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function form(file) { const result = new FormData(); result.set('file', new Blob([file], { type: 'image/png' }), 'replacement.png'); return result; }

await ready();
const fixtures = JSON.parse(await readFile(new URL('./fixtures.local.json', import.meta.url), 'utf8'));
const configured = await accounts();
let alice = await login(configured.find(account => account.username === 'alice'));
const owner = alice.user.id;
let admin = await login(configured.find(account => account.role === 'Admin'));
const song = (await api('music', '/api/songs/' + fixtures.songIds[0])).data;
const playlist = (await api('music', '/api/playlists/user/' + owner, { token: alice.token })).data.find(p => p.name === 'Demo Favorites');
const profileBefore = (await api('user', '/api/users/' + owner, { token: alice.token })).data;
const historyBefore = (await api('user', '/api/users/' + owner + '/listening-history?limit=100', { token: alice.token })).data;
const messagesBefore = (await api('user', '/api/chats/' + fixtures.chatId + '/messages', { token: alice.token })).data;
const mediaBefore = await bytes(song.fileUrl);
const deniedPlaylistName = 'Outage denied ' + randomUUID();
let failure;
check(mediaBefore.status === 200 && mediaBefore.bytes.length > 44, 'Baseline audio is playable PCM with complete bytes');
try {
  await stop('redis'); compose(['restart', '--timeout', '5', 'music']); await awaitStatus('music', 200);
  const cold = await bytes(song.fileUrl);
  check(cold.status === 200 && sha(cold.bytes) === sha(mediaBefore.bytes), 'Cold Music start with stopped Redis preserves byte-exact audio');
  for (const [range, startOffset, endOffset] of [['bytes=0-0', 0, 0], ['bytes=-7', mediaBefore.bytes.length - 7, mediaBefore.bytes.length - 1], ['bytes=44-', 44, mediaBefore.bytes.length - 1]]) {
    const part = await bytes(song.fileUrl, range);
    check(part.status === 206 && part.bytes.equals(mediaBefore.bytes.subarray(startOffset, endOffset + 1)) && part.headers.get('content-range') === `bytes ${startOffset}-${endOffset}/${mediaBefore.bytes.length}` && Number(part.headers.get('content-length')) === part.bytes.length, `Streaming ${range} is byte-accurate with matching length/range`);
  }
  const invalid = await bytes(song.fileUrl, 'bytes=' + mediaBefore.bytes.length + '-');
  check(invalid.status === 416 && invalid.headers.get('content-range') === `bytes */${mediaBefore.bytes.length}`, 'Unsatisfiable range returns 416 and actual total length');
  await start('redis');
  console.log('Redis recovery and exact byte-range checks passed; checking storage outage.');
  await stop('azurite'); await awaitStatus('music', 503); await awaitStatus('user', 503);
  check((await api('music', '/health/live')).status === 200 && (await api('user', '/health/live')).status === 200, 'Storage outage affects readiness while liveness remains available');
  check(statusCode() !== 0, 'Demo.ps1 status exits nonzero with stopped Blob dependency', report.statusCommandChecks);
  const replacement = await api('music', '/api/playlists/' + playlist.id + '/cover', { method: 'POST', token: alice.token, body: form(await readFile(new URL('./assets/cover.png', import.meta.url))), expected: 503 });
  check(replacement.status === 503, 'Interrupted cover replacement reports actual storage failure');
  const unchanged = (await api('music', '/api/playlists/' + playlist.id, { token: alice.token })).data;
  check(unchanged.coverUrl === playlist.coverUrl && unchanged.songs.map(s => s.id).join() === playlist.songs.map(s => s.id).join(), 'Failed cover replacement preserves working metadata and song ordering');
  await start('azurite'); await awaitStatus('music', 200); await awaitStatus('user', 200);
  check(sha((await bytes(song.fileUrl)).bytes) === sha(mediaBefore.bytes), 'Storage recovery preserves complete audio bytes');
  console.log('Storage outage preserves metadata and audio; checking Mongo reconnect.');
  const containerSnapshot = containers();
  await stop('mongo'); await awaitStatus('identity', 503); await awaitStatus('music', 503); await awaitStatus('user', 503);
  check((await api('music', '/api/songs', { expected: 503 })).status === 503 && (await api('user', '/api/users/' + owner, { expected: 503 })).status === 503, 'Mongo outage returns controlled 503 for catalogue/profile reads');
  check((await api('identity', '/health/live')).status === 200 && (await api('user', '/health/live')).status === 200, 'Database outage does not falsely change process liveness');
  await start('mongo'); await ready();
  check(sameContainers(containerSnapshot), 'Mongo recovery reconnects without recreating API containers');
  check((await api('user', '/api/users/' + owner, { token: alice.token })).data.id === profileBefore.id, 'Mongo recovery retains profile identity');
  await stop('postgres'); await awaitStatus('identity', 503);
  check((await api('identity', '/api/auth/me', { token: alice.token, expected: 503 })).status === 503, 'PostgreSQL outage fails session authentication with controlled 503');
  check((await api('user', '/api/users/check/' + owner, { token: alice.token, expected: 503 })).status === 503 && (await api('music', '/api/playlists/user/' + owner, { method: 'POST', token: alice.token, body: { name: deniedPlaylistName, isPublic: false }, expected: 503 })).status === 503, 'Downstream protected APIs fail closed during session-store outage');
  check((await api('music', '/api/playlists/user/' + owner, { token: alice.token, expected: 503 })).status === 503, 'Supplied bearer on public playlist reads reports session-store failure explicitly');
  await start('postgres'); await ready();
  check((await api('identity', '/api/auth/me', { token: alice.token })).data.id === owner, 'PostgreSQL recovery preserves the existing valid session');
  check(!(await api('music', '/api/playlists/user/' + owner, { token: alice.token })).data.some(item => item.name === deniedPlaylistName), 'Session-store outage rejects playlist creation without persisting a mutation');
  console.log('Mongo reconnect and PostgreSQL recovery passed; checking full API restart persistence.');
  await api('identity', '/api/auth/logout', { method: 'POST', cookie: alice.cookie }); await api('identity', '/api/auth/logout', { method: 'POST', cookie: admin.cookie });
  alice = await login(configured.find(account => account.username === 'alice'));
  const restartOperation = randomUUID(); const restartHeaders = { 'X-Spotibuds-Refresh-Request': restartOperation };
  const restartPreparation = await api('identity', '/api/auth/refresh/prepare', { method: 'POST', cookie: alice.cookie, headers: restartHeaders, expected: 204 });
  alice.cookie = restartPreparation.cookie;
  compose(['restart', '--timeout', '5', 'identity', 'music', 'user']); await ready();
  const restartCompletion = await api('identity', '/api/auth/refresh/complete', { method: 'POST', cookie: alice.cookie, headers: restartHeaders });
  check(restartCompletion.data.user.id === owner && !restartCompletion.cookie, 'Pending refresh survives API restart and activates its previously installed successor');
  alice = { ...restartCompletion.data, cookie: alice.cookie }; admin = await login(configured.find(account => account.role === 'Admin'));
  const profileAfter = (await api('user', '/api/users/' + owner, { token: alice.token })).data;
  const playlistAfter = (await api('music', '/api/playlists/' + playlist.id, { token: alice.token })).data;
  const historyAfter = (await api('user', '/api/users/' + owner + '/listening-history?limit=100', { token: alice.token })).data;
  const messagesAfter = (await api('user', '/api/chats/' + fixtures.chatId + '/messages', { token: alice.token })).data;
  check(profileAfter.id === profileBefore.id && profileAfter.displayName === profileBefore.displayName && profileAfter.bio === profileBefore.bio && profileAfter.isPrivate === profileBefore.isPrivate && profileAfter.avatarUrl === profileBefore.avatarUrl, 'Full API restart preserves profile, privacy and avatar identity');
  check(playlistAfter.id === playlist.id && playlistAfter.coverUrl === playlist.coverUrl && playlistAfter.songs.map(s => s.id).join() === playlist.songs.map(s => s.id).join(), 'Full API restart preserves playlist ownership, ordering and cover');
  check(historyBefore.every(item => historyAfter.some(after => after.songId === item.songId && after.playedAt === item.playedAt)), 'Full API restart preserves listening event data');
  check(messagesBefore.every(item => messagesAfter.some(after => (after.id ?? after.messageId) === (item.id ?? item.messageId) && after.content === item.content)), 'Full API restart preserves canonical chat messages');
  check(sha((await bytes(song.fileUrl)).bytes) === sha(mediaBefore.bytes), 'Full API restart preserves exact generated media bytes');
  check(alice.user.roles.length === 1 && alice.user.roles[0] === 'User' && admin.user.roles.includes('Admin'), 'Full API restart preserves ordinary/admin privilege separation');
  check(statusCode() === 0, 'Demo.ps1 status succeeds after dependency and API recovery', report.statusCommandChecks);
} catch (error) {
  failure = error; report.failure = error.message;
} finally {
  const recoveryFailures = [];
  for (const name of [...stopped]) {
    try { await start(name); } catch { recoveryFailures.push('Could not restore isolated dependency: ' + name); }
  }
  try { await ready(); report.dependenciesRestored = stopped.size === 0; } catch { recoveryFailures.push('API readiness did not recover'); }
  for (const session of [alice, admin]) {
    try { await api('identity', '/api/auth/logout', { method: 'POST', cookie: session.cookie, expected: 204 }); } catch { recoveryFailures.push('Session cleanup failed'); }
  }
  if (recoveryFailures.length) { report.recoveryFailures = recoveryFailures; failure ??= new Error(recoveryFailures.join('; ')); }
  report.completed = !failure;
  await writeFile(new URL('./outage-verification.local.json', import.meta.url), JSON.stringify(report, null, 2));
}
if (failure) throw failure;
console.log(`Outage, byte range and restart checks passed: ${report.checks.length}; CLI status checks: ${report.statusCommandChecks.length}. All isolated dependencies restored; volumes preserved.`);
