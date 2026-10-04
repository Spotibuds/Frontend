import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { accounts, api, login, ready, urls } from './demo-api.mjs';

// Fresh ordinary fixtures in the named local demo; only the User service restarts.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const compose = ['compose', '--project-name', 'spotibuds-local-demo', '--env-file', 'Frontend/demo/.env.localdemo', '-f', 'Frontend/demo/compose.yml'];
const reportFile = new URL('../docs/notification-runtime-verification.json', import.meta.url);
const command = promisify(execFile);
const createdAccounts = [];
const sessions = [];
const checks = [];
const cleanupErrors = [];
let hub;
let chat;
let restarted = false;
let restartStarted = false;
let automaticReconnectVerified = false;
let verification;
let failedStage;
let stage = 'initial-readiness';
const state = async session => (await api('user', '/api/notifications/' + session.user.id + '?limit=100', { token: session.token })).data;
const deadline = (operation, milliseconds, message) => {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
};
const cleanupStep = async (name, operation) => {
  try { await operation(); } catch { cleanupErrors.push(name); }
};

try {
  // A failed rerun must not leave an earlier passed artifact looking current.
  await writeFile(reportFile, JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'spotibuds-local-demo', verdict: 'running', cleanupVerified: false, automaticReconnectVerified: false }, null, 2) + '\n');
  await ready({ attempts: 1 });
  for (let index = 0; index < 2; index++) {
    stage = 'fixture-registration';
    const suffix = randomUUID().replaceAll('-', '');
    const member = { username: 'restart' + suffix + index, email: 'restart' + suffix + index + '@example.test', password: 'Fixture!Aa8' + randomUUID() };
    const registered = await api('identity', '/api/auth/register', { method: 'POST', body: { ...member, isPrivate: false }, expected: [200, 503] });
    const id = registered.data?.userId;
    if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new Error('Registration did not return the exact created account identity');
    // RegisterCore commits before returning503 {userId,pending:true} when
    // profile reconciliation is unavailable. Remember it before login/status.
    createdAccounts.push({ id: id.toLowerCase(), username: member.username, email: member.email });
    if (registered.status === 503) {
      if (registered.data.pending !== true) throw new Error('Registration503 violates the committed pending-profile contract');
      throw new Error('Fixture profile reconciliation is pending');
    }
    stage = 'fixture-login';
    const session = await login(member);
    assert.equal(session.user.id.toLowerCase(), id.toLowerCase());
    assert.deepEqual(session.user.roles, ['User']); sessions.push(session);
  }
  const [sender, recipient] = sessions;
  stage = 'initial-notifications';
  chat = (await api('user', '/api/chats/create-or-get', { method: 'POST', token: sender.token, body: { participantIds: sessions.map(session => session.user.id) } })).data.chatId;
  const send = (content, clientMessageId = randomUUID()) => api('user', '/api/chats/' + chat + '/messages', { method: 'POST', token: sender.token, body: { content, clientMessageId } });
  await send('Restart fixture read'); await send('Restart fixture unread'); await send('Restart fixture dismissed');
  const initial = await state(recipient); assert.equal(initial.notifications.length, 3); assert.equal(initial.unreadCount, 3);
  const read = initial.notifications.find(item => item.message === 'Restart fixture read');
  const dismissed = initial.notifications.find(item => item.message === 'Restart fixture dismissed');
  stage = 'read-and-dismiss';
  await api('user', '/api/notifications/' + read.id + '/read', { method: 'POST', token: recipient.token });
  await api('user', '/api/notifications/' + dismissed.id + '/read', { method: 'POST', token: recipient.token });
  await api('user', '/api/notifications/' + dismissed.id, { method: 'DELETE', token: recipient.token });
  await api('user', '/api/notifications/' + dismissed.id, { method: 'DELETE', token: recipient.token });
  const before = await state(recipient); assert.equal(before.unreadCount, 1); assert.equal(before.totalCount, 2);
  assert.equal(before.notifications.find(item => item.id === read.id).status, 'Read');
  checks.push('Read and repeated dismissal persist correct counts before restart');
  const stable = before.notifications.map(item => ({ id: item.id, status: item.status, createdAt: item.createdAt, readAt: item.readAt }));

  stage = 'pre-restart-hub-subscription';
  let initialConnectionId;
  let reconnectingEvents = 0;
  let reconnectedEvents = 0;
  let resolveReconnect;
  let rejectReconnect;
  const reconnected = new Promise((resolve, reject) => { resolveReconnect = resolve; rejectReconnect = reject; });
  // Observe rejection immediately, even while the bounded Docker command runs.
  void reconnected.catch(() => {});
  hub = new HubConnectionBuilder().withUrl(urls.user + '/notification-hub', { accessTokenFactory: () => recipient.token, timeout: 5000 }).withAutomaticReconnect([0, 500, 1500, 3000, 5000, 5000, 5000, 5000, 5000, 5000]).configureLogging(LogLevel.None).build();
  hub.onreconnecting(() => { if (restartStarted) reconnectingEvents++; });
  hub.onreconnected(connectionId => {
    if (restartStarted && reconnectingEvents > 0 && connectionId && connectionId !== initialConnectionId) { reconnectedEvents++; resolveReconnect(); }
  });
  hub.onclose(() => { if (restartStarted && !automaticReconnectVerified) rejectReconnect(new Error('Notification connection closed before automatic restart recovery')); });
  await deadline(hub.start(), 15000, 'Initial notification subscription timed out');
  initialConnectionId = hub.connectionId;
  assert.equal(typeof initialConnectionId, 'string');
  stage = 'actual-user-restart';
  restartStarted = true;
  const recovery = deadline(reconnected, 60000, 'Notification connection did not automatically recover from the actual User restart');
  void recovery.catch(() => {});
  await command('docker', [...compose, 'restart', 'user'], { cwd: workspace, timeout: 60000, maxBuffer: 1024 * 1024 });
  restarted = true;
  stage = 'automatic-reconnection';
  await recovery;
  automaticReconnectVerified = true;
  await ready({ attempts: 3 });
  checks.push('Existing notification connection automatically reconnects with a new connection identity after the actual User container restart');

  stage = 'durable-snapshot';
  const after = await state(recipient);
  assert.deepEqual(after.notifications.map(item => ({ id: item.id, status: item.status, createdAt: item.createdAt, readAt: item.readAt })), stable);
  assert.equal(after.totalCount, before.totalCount); assert.equal(after.unreadCount, before.unreadCount);
  checks.push('Actual User container restart preserves canonical IDs, order, read timestamp and total/unread counts');
  stage = 'post-reconnect-live-delivery';
  const incomingEvents = [];
  let resolveIncoming;
  const incoming = new Promise(resolve => { resolveIncoming = resolve; });
  const content = 'Restart fixture live after restart';
  hub.on('NewNotification', value => { incomingEvents.push(value); if (value.message === content) resolveIncoming(value); });
  const retryId = randomUUID();
  const sent = await send(content, retryId);
  const delivered = await deadline(incoming, 10000, 'Canonical notification did not arrive on the automatically reconnected subscription');
  const repeated = await send(content, retryId);
  assert.equal(sent.data.id, repeated.data.id);
  assert.equal(delivered.data.messageId, sent.data.id); assert.equal(delivered.data.chatId, chat);
  assert.equal(delivered.targetUserId, recipient.user.id); assert.equal(delivered.sourceUserId, sender.user.id);
  const final = await state(recipient);
  assert.equal(final.notifications.filter(item => item.id === delivered.id).length, 1);
  assert.equal(final.unreadCount, 2); assert.equal(final.totalCount, 3);
  await delay(200);
  assert.equal(incomingEvents.filter(item => item.id === delivered.id).length, 1);
  checks.push('Automatically reconnected recipient receives canonical persisted ID; message retry creates no second notice or live event');
  verification = { ordinaryUsers: 2, actualUserContainerRestart: true, automaticReconnectVerified, reconnectingEvents, reconnectedEvents, before: { totalCount: before.totalCount, unreadCount: before.unreadCount }, after: { totalCount: after.totalCount, unreadCount: after.unreadCount }, stableIdentityDigest: createHash('sha256').update(JSON.stringify(stable)).digest('hex') };
} catch {
  failedStage = stage;
} finally {
  // A failed hub stop or one failed deletion cannot skip another account.
  if (hub) await cleanupStep('hub-stop', () => deadline(hub.stop(), 10000, 'Notification connection stop timed out'));
  if (restartStarted) await cleanupStep('post-restart-readiness', () => ready({ attempts: 3 }));
  if (createdAccounts.length > 0) {
    let admin;
    await cleanupStep('cleanup-admin-login', async () => { admin = await login((await accounts()).find(account => account.username === 'demoadmin')); });
    if (admin) {
      for (let index = 0; index < createdAccounts.length; index++) {
        const fixture = createdAccounts[index];
        await cleanupStep('scoped-account-' + (index + 1), async () => {
          const current = await api('identity', '/api/auth/users/' + fixture.id, { token: admin.token, expected: [200, 404] });
          if (current.status === 200) {
            if (current.data.username !== fixture.username || current.data.email !== fixture.email || current.data.roles.length !== 1 || current.data.roles[0] !== 'User') throw new Error('Cleanup account identity or ordinary role differs from the registered fixture');
            await api('identity', '/api/auth/users/' + fixture.id, { method: 'DELETE', token: admin.token, expected: 204 });
          }
          await api('identity', '/api/auth/users/' + fixture.id, { token: admin.token, expected: 404 });
          await api('user', '/api/users/' + fixture.id, { token: admin.token, expected: 404 });
          // The recipient stays authenticated until its subsequent deletion.
          if (index === 0 && chat && sessions.length === 2) {
            await api('user', '/api/chats/' + chat, { token: sessions[1].token, expected: 404 });
            const remaining = await state(sessions[1]);
            assert.equal(remaining.totalCount, 0); assert.equal(remaining.unreadCount, 0);
          }
        });
      }
      await cleanupStep('cleanup-admin-logout', () => api('identity', '/api/auth/logout', { method: 'POST', token: admin.token, cookie: admin.cookie, expected: 204 }));
    }
  }
}

const cleanupVerified = cleanupErrors.length === 0;
if (failedStage || !cleanupVerified || !verification || !restarted || !automaticReconnectVerified) {
  await writeFile(reportFile, JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'spotibuds-local-demo', ordinaryUsers: createdAccounts.length, actualUserContainerRestart: restarted, automaticReconnectVerified, cleanupVerified, failedStage: failedStage ?? 'fixture-cleanup', cleanupFailures: cleanupErrors, verdict: 'failed' }, null, 2) + '\n');
  throw new Error('Notification restart verification failed during ' + (failedStage ?? 'fixture-cleanup') + '; cleanup ' + (cleanupVerified ? 'verified' : 'requires attention'));
}
checks.push('Both exact ordinary fixture accounts, their chat and recipient notices are removed and profile absence is verified');
await writeFile(reportFile, JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'spotibuds-local-demo', ...verification, cleanupVerified, checks, verdict: 'passed' }, null, 2) + '\n');
console.log('Notification service restart verification passed: automatic reconnect, durable IDs/read state/counts, live receipt, retry deduplication, and verified fixture cleanup.');
