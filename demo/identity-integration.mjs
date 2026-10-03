import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { accounts, api, login, ready } from './demo-api.mjs';

if (process.argv.length > 2) {
  const help = process.argv.length === 3 && process.argv[2] === '--help';
  (help ? console.log : console.error)('Usage: node demo/identity-integration.mjs (writes disposable regression fixtures in the isolated demo).');
  process.exit(help ? 0 : 2);
}
const composeFile = fileURLToPath(new URL('./compose.yml', import.meta.url));
const envFile = fileURLToPath(new URL('./.env.localdemo', import.meta.url));
const evidence = { date: new Date().toISOString(), scope: 'Isolated spotibuds-local-demo fixtures; no credentials logged', checks: [] };
function assert(condition, name) { if (!condition) throw new Error(name); evidence.checks.push({ name, passed: true }); }
function compose(args) {
  const result = spawnSync('docker', ['compose', '-p', 'spotibuds-local-demo', '--env-file', envFile, '-f', composeFile, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error('Disposable database inspection command failed');
  return result.stdout.trim();
}
function postgres(sql) { return JSON.parse(compose(['exec', '-T', 'postgres', 'psql', '-U', 'demo', '-d', 'spotibuds_identity_demo', '-t', '-A', '-c', sql])); }
function mongo(script) { return JSON.parse(compose(['exec', '-T', 'mongo', 'sh', '-c', 'exec mongosh --quiet -u demo -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "$1"', 'sh', script])); }
const configuration = Object.fromEntries((await readFile(envFile, 'utf8')).split(/\r?\n/).filter(line => line.includes('=')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
await ready();
const adminAccount = (await accounts()).find(account => account.role === 'Admin');
const admin = await login(adminAccount);
const test = { username: 'regression_' + randomUUID().replaceAll('-', '').slice(0, 14), email: 'identity-' + randomUUID() + '@spotibuds.local', password: 'Aa1!' + randomBytes(24).toString('base64url') };
let id;
try {
  const registered = await api('identity', '/api/auth/register', { method: 'POST', body: test }); id = registered.data.userId;
  assert(/^[0-9a-f-]{36}$/i.test(id), 'Registration has a GUID Identity ID');
  const session = await login(test);
  assert(session.user.roles.length === 1 && session.user.roles[0] === 'User', 'Ordinary registration has ordinary privilege');
  const stored = postgres(`SELECT json_build_object('users',(SELECT count(*) FROM "Users" WHERE "Id"='${id}'),'sessions',(SELECT count(*) FROM "SessionFamilies" WHERE "UserId"='${id}' AND NOT "IsRevoked"),'hashes',(SELECT bool_and(length("Token")=64) FROM "RefreshTokens" WHERE "UserId"='${id}'));`);
  assert(Number(stored.users) === 1 && Number(stored.sessions) === 1 && stored.hashes, 'PostgreSQL stores one account/session and hashed credentials');
  mongo(`const d=db.getSiblingDB('spotibuds_demo'); d.users.deleteOne({IdentityUserId:'${id}'}); print(JSON.stringify({removed:true}));`);
  await api('user', `/api/users/sync-user/${id}`, { method: 'POST', token: session.token });
  await api('user', `/api/users/sync-user/${id}`, { method: 'POST', token: session.token });
  const mongoRows = mongo(`const d=db.getSiblingDB('spotibuds_demo'); const u=d.users.findOne({IdentityUserId:'${id}'}); print(JSON.stringify({count:d.users.countDocuments({IdentityUserId:'${id}'}),name:u.UserName,roles:u.Roles,privacy:u.IsPrivate}));`);
  assert(mongoRows.count === 1 && mongoRows.name === test.username && mongoRows.roles?.length === 1 && mongoRows.roles[0] === 'User' && !mongoRows.privacy, 'Missing-profile recovery restores canonical fields and repeated reconciliation retains unique IdentityUserId');
  const anonymous = await api('identity', `/api/auth/users/${id}/roles/Admin`, { method: 'POST', expected: 401 });
  const ordinary = await api('identity', `/api/auth/users/${id}/roles/Admin`, { method: 'POST', token: session.token, expected: 403 });
  assert(anonymous.status === 401 && ordinary.status === 403, 'Anonymous and ordinary role changes denied');
  const handoff = await login(test);
  const operation = randomUUID(); const phaseHeaders = { 'X-Spotibuds-Refresh-Request': operation };
  const prepared = await api('identity', '/api/auth/refresh/prepare', { method: 'POST', cookie: handoff.cookie, headers: phaseHeaders, expected: 204 });
  assert(prepared.status === 204 && prepared.cookie && prepared.data === null, 'Refresh preparation installs a pending cookie without issuing access');
  const family = JSON.parse(Buffer.from(handoff.token.split('.')[1], 'base64url').toString()).sid;
  const stageState = () => postgres(`SELECT json_build_object('count',count(*),'pending',count(*) FILTER(WHERE "IsPending"),'unconsumed',count(*) FILTER(WHERE NOT "IsRevoked"),'hashes',bool_and(length("Token")=64)) FROM "RefreshTokens" WHERE "FamilyId"='${family}';`);
  const staged = stageState();
  assert(Number(staged.count) === 2 && Number(staged.pending) === 1 && Number(staged.unconsumed) === 2 && staged.hashes, 'PostgreSQL pending preparation preserves its unconsumed hashed predecessor');
  // Discard the first response cookie as a destroyed document would, then retry the same intent.
  const repeated = await api('identity', '/api/auth/refresh/prepare', { method: 'POST', cookie: handoff.cookie, headers: phaseHeaders, expected: 204 });
  assert(repeated.cookie === prepared.cookie && Number(stageState().count) === 2, 'Lost prepare cookie retries recover exactly one pending successor');
  const wrong = await api('identity', '/api/auth/refresh/complete', { method: 'POST', cookie: prepared.cookie, headers: { 'X-Spotibuds-Refresh-Request': randomUUID() }, expected: 401 });
  const missing = await api('identity', '/api/auth/refresh/complete', { method: 'POST', cookie: prepared.cookie, expected: 401 });
  assert(wrong.status === 401 && missing.status === 401 && Number(stageState().unconsumed) === 2, 'Missing or different completion intent cannot consume either credential');
  const completed = await api('identity', '/api/auth/refresh/complete', { method: 'POST', cookie: prepared.cookie, headers: phaseHeaders });
  const recoveredResponses = await Promise.all(Array.from({ length: 4 }, () => api('identity', '/api/auth/refresh/complete', { method: 'POST', cookie: prepared.cookie, headers: phaseHeaders })));
  const recovered = recoveredResponses[0];
  assert(completed.data.token && !completed.cookie && recoveredResponses.every(response => response.data.token && !response.cookie), 'Lost completion body and four same-intent retries recover without another cookie mutation');
  const activated = stageState();
  assert(Number(activated.count) === 2 && Number(activated.pending) === 0 && Number(activated.unconsumed) === 1 && (await api('identity', '/api/auth/me', { token: recovered.data.token })).data.id === id, 'Repeated completion leaves exactly one active unconsumed successor');
  await api('identity', '/api/auth/refresh/prepare', { method: 'POST', cookie: handoff.cookie, headers: phaseHeaders, expected: 401 });
  assert((await api('identity', '/api/auth/me', { token: recovered.data.token, expected: 401 })).status === 401 && Number(stageState().unconsumed) === 0, 'Consumed predecessor reuse remains strict replay even for matching preparation intent');
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => api('identity', '/api/auth/refresh', { method: 'POST', cookie: session.cookie, expected: [200, 401] })));
  assert(concurrent.filter(r => r.status === 200).length === 1, 'Concurrent PostgreSQL refresh credential consumption has exactly one winner');
  const winner = concurrent.find(r => r.status === 200);
  assert((await api('identity', '/api/auth/me', { token: winner.data.token, expected: 401 })).status === 401, 'Strict replay policy revokes the winning successor');
  const afterReplay = postgres(`SELECT json_build_object('active',(SELECT count(*) FROM "SessionFamilies" WHERE "UserId"='${id}' AND NOT "IsRevoked"));`);
  assert(Number(afterReplay.active) === 0, 'Replay leaves no active family in persisted state');
  const logoutSession = await login(test);
  await api('identity', '/api/auth/logout', { method: 'POST', cookie: logoutSession.cookie, expected: 204 });
  assert((await api('identity', '/api/auth/me', { token: logoutSession.token, expected: 401 })).status === 401, 'Logout rejects former access token immediately');
  assert((await api('user', `/api/users/check/${id}`, { token: logoutSession.token, expected: 401 })).status === 401, 'User validates revoked sid across service boundaries');
  assert((await api('music', '/api/playlists', { method: 'POST', token: logoutSession.token, body: { name: 'Must not exist', isPublic: true }, expected: 401 })).status === 401, 'Music validates revoked sid before mutation');
  const recoverySession = await login(test);
  const known = await api('identity', '/api/auth/forgot-password', { method: 'POST', body: { email: test.email } });
  const unknown = await api('identity', '/api/auth/forgot-password', { method: 'POST', body: { email: 'missing-' + randomUUID() + '@spotibuds.local' } });
  assert(known.status === 200 && JSON.stringify(known.data) === JSON.stringify(unknown.data), 'Recovery responses do not enumerate known accounts');
  await Promise.all(Array.from({ length: 4 }, () => api('identity', '/api/auth/forgot-password', { method: 'POST', body: { email: test.email } })));
  const pendingRecovery = postgres(`SELECT json_build_object('pending',count(*) FILTER(WHERE NOT "Used"),'total',count(*),'hash',max("TokenHash") FILTER(WHERE NOT "Used")) FROM "PasswordResets" WHERE "UserId"='${id}';`);
  assert(Number(pendingRecovery.pending) === 1 && Number(pendingRecovery.total) === 5, 'Four concurrent PostgreSQL recovery requests leave exactly one current single-use link');
  let captured;
  for (let attempt = 0; attempt < 20; attempt++) {
    const inbox = (await api('mail', '/api/v1/messages')).data;
    for (const found of inbox.messages?.filter(message => message.To?.some(recipient => recipient.Address === test.email)) ?? []) {
      const message = (await api('mail', '/api/v1/message/' + found.ID)).data;
      const link = message?.Text?.match(/http:\/\/127\.0\.0\.1:3100\/reset-password\?[^\s]+/)?.[0];
      const credential = link ? new URL(link).searchParams.get('token') : null;
      if (credential && createHash('sha256').update(credential).digest('hex').toUpperCase() === pendingRecovery.hash) { captured = message; break; }
    }
    if (captured) break;
    await delay(250);
  }
  const resetLink = captured?.Text?.match(/http:\/\/127\.0\.0\.1:3100\/reset-password\?[^\s]+/)?.[0];
  assert(!!resetLink, 'Real Mailpit message contains the guest reset link');
  const resetCredential = new URL(resetLink).searchParams.get('token');
  const legacyRecoveryCredential = randomBytes(48).toString('base64url');
  const legacyRecoveryHash = createHash('sha256').update(legacyRecoveryCredential).digest('hex').toUpperCase();
  compose(['exec', '-T', 'postgres', 'psql', '-U', 'demo', '-d', 'spotibuds_identity_demo', '-t', '-A', '-c', `INSERT INTO "PasswordResets" ("Id","UserId","TokenHash","ExpiresAt","Used","CreatedAt") VALUES ('${randomUUID()}','${id}','${legacyRecoveryHash}',NOW()+INTERVAL '20 minutes',false,NOW());`]);
  let nextPassword = 'Aa1!' + randomBytes(24).toString('base64url');
  await api('identity', '/api/auth/reset-password', { method: 'POST', body: { email: test.email, token: 'invalid', password: nextPassword }, expected: 400 });
  await api('identity', '/api/auth/reset-password', { method: 'POST', body: { email: test.email, token: resetCredential, password: nextPassword } });
  assert((await api('identity', '/api/auth/reset-password', { method: 'POST', body: { email: test.email, token: legacyRecoveryCredential, password: nextPassword }, expected: 400 })).status === 400, 'Successful PostgreSQL reset invalidates an additional outstanding legacy recovery link');
  assert((await api('identity', '/api/auth/reset-password', { method: 'POST', body: { email: test.email, token: resetCredential, password: nextPassword }, expected: 400 })).status === 400, 'Reset credential is single-use');
  assert((await api('identity', '/api/auth/refresh', { method: 'POST', cookie: recoverySession.cookie, expected: 401 })).status === 401, 'Password reset revokes the prior refresh family');
  await api('identity', '/api/auth/login', { method: 'POST', body: { username: test.username, password: test.password }, expected: 401 });
  const resetLogin = await login({ ...test, password: nextPassword });
  assert(!!resetLogin.user.id, 'New password authenticates after actual captured email reset');
  const resetState = postgres(`SELECT json_build_object('resets',(SELECT count(*) FROM "PasswordResets" WHERE "UserId"='${id}' AND "Used" AND length("TokenHash")=64));`);
  assert(Number(resetState.resets) === 6, 'Reset consumption and all six hashed recovery credentials are persisted as invalidated');
  // Verify an expired credential against the real database without waiting twenty minutes.
  await api('identity', '/api/auth/forgot-password', { method: 'POST', body: { email: test.email } });
  compose(['exec', '-T', 'postgres', 'psql', '-U', 'demo', '-d', 'spotibuds_identity_demo', '-t', '-A', '-c', `UPDATE "PasswordResets" SET "ExpiresAt"=NOW()-INTERVAL '1 second' WHERE "UserId"='${id}' AND NOT "Used";`]);
  const newInbox = (await api('mail', '/api/v1/messages')).data;
  const newMessage = newInbox.messages.find(message => message.To?.some(recipient => recipient.Address === test.email));
  const newBody = (await api('mail', '/api/v1/message/' + newMessage.ID)).data;
  const expired = new URL(newBody.Text.match(/http:\/\/127\.0\.0\.1:3100\/reset-password\?[^\s]+/)[0]).searchParams.get('token');
  assert((await api('identity', '/api/auth/reset-password', { method: 'POST', body: { email: test.email, token: expired, password: nextPassword }, expected: 400 })).status === 400, 'Expired Mailpit reset credential is rejected');
  const privacyRace = await Promise.all([true, false, true, false].map(isPrivate => api('identity', '/api/auth/me', { method: 'PUT', token: resetLogin.token, body: { isPrivate } })));
  assert(privacyRace.every(result => result.status === 200), 'Concurrent profile authority updates acknowledge only completed synchronization');
  const authorityAfterRace = (await api('identity', '/api/auth/me', { token: resetLogin.token })).data;
  const mongoAfterRace = mongo(`const d=db.getSiblingDB('spotibuds_demo'); print(JSON.stringify({isPrivate:d.users.findOne({IdentityUserId:'${id}'}).IsPrivate}));`);
  assert(authorityAfterRace.isPrivate === mongoAfterRace.isPrivate, 'Concurrent profile synchronization leaves Mongo equal to the latest PostgreSQL authority');
  const racePassword = 'Aa1!' + randomBytes(24).toString('base64url');
  const race = await Promise.all([
    api('identity', '/api/auth/change-password', { method: 'POST', token: resetLogin.token, body: { currentPassword: nextPassword, newPassword: racePassword } }),
    ...Array.from({ length: 4 }, () => api('identity', '/api/auth/login', { method: 'POST', body: { username: test.username, password: nextPassword }, expected: [200, 401] }))
  ]);
  assert(race[0].status === 200, 'Password mutation completes while four old-password logins race');
  for (const [index, result] of race.slice(1).entries()) {
    const revoked = result.status === 401 || (await api('identity', '/api/auth/me', { token: result.data.token, expected: 401 })).status === 401;
    assert(revoked, `Racing old-password request ${index + 1} cannot leave an authenticated session after password change`);
  }
  const racedState = postgres(`SELECT json_build_object('active',(SELECT count(*) FROM "SessionFamilies" WHERE "UserId"='${id}' AND NOT "IsRevoked"));`);
  assert(Number(racedState.active) === 0, 'Password/login race leaves no active family authenticated by the old password');
  nextPassword = racePassword;
  const internal = await api('identity', '/api/auth/internal/users/' + id, { headers: { 'X-Spotibuds-Service': configuration.SERVICE_SECRET } });
  assert(internal.data.id === id && internal.data.username === test.username, 'Restricted internal recovery contract carries canonical fields');
  await api('identity', `/api/auth/users/${id}/promote-to-admin`, { method: 'POST', token: admin.token });
  const promoted = await login({ ...test, password: nextPassword });
  const promotedState = mongo(`const d=db.getSiblingDB('spotibuds_demo'); print(JSON.stringify({roles:d.users.findOne({IdentityUserId:'${id}'}).Roles}));`);
  assert(promoted.user.roles.length === 1 && promoted.user.roles[0] === 'Admin' && promotedState.roles.length === 1 && promotedState.roles[0] === 'Admin', 'Administrator role transition synchronizes PostgreSQL claims and Mongo authority copy');
  await api('identity', `/api/auth/users/${id}/demote-to-user`, { method: 'POST', token: admin.token });
  const demotedState = mongo(`const d=db.getSiblingDB('spotibuds_demo'); print(JSON.stringify({roles:d.users.findOne({IdentityUserId:'${id}'}).Roles}));`);
  assert(demotedState.roles.length === 1 && demotedState.roles[0] === 'User' && (await api('identity', '/api/auth/users', { token: promoted.token, expected: 401 })).status === 401, 'Demotion synchronizes ordinary role and immediately revokes old administrator access');
  await api('identity', `/api/auth/users/${id}`, { method: 'DELETE', token: admin.token, expected: [204, 202] });
  let deleted;
  for (let attempt = 0; attempt < 30; attempt++) {
    deleted = postgres(`SELECT json_build_object('users',(SELECT count(*) FROM "Users" WHERE "Id"='${id}'),'work',(SELECT count(*) FROM "ProfileSyncWork" WHERE "UserId"='${id}'));`);
    if (Number(deleted.users) === 0 && Number(deleted.work) === 0) break; await delay(1000);
  }
  assert(Number(deleted.users) === 0 && Number(deleted.work) === 0, 'Deletion removes Identity state and completes durable cleanup');
  assert(mongo(`const d=db.getSiblingDB('spotibuds_demo'); print(JSON.stringify({count:d.users.countDocuments({IdentityUserId:'${id}'})}));`).count === 0, 'Deletion removes the synchronized profile');
  id = null;
} finally {
  if (id) try { await api('identity', `/api/auth/users/${id}`, { method: 'DELETE', token: admin.token, expected: [204, 202] }); } catch { }
  await api('identity', '/api/auth/logout', { method: 'POST', cookie: admin.cookie, expected: 204 });
  await writeFile(new URL('./identity-verification.local.json', import.meta.url), JSON.stringify(evidence, null, 2));
}
console.log(`Identity full-stack regression checks passed: ${evidence.checks.length}. PostgreSQL/Mongo/Mailpit invariants asserted. Credentials were not logged.`);
