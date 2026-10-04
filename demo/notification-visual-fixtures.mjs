import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { accounts, api, login, ready } from './demo-api.mjs';

// Fresh source account is the only disposable account. Alice is the existing
// ordinary demo recipient; her unrelated data is preserved during cleanup.
const file = new URL('./notification-visual-verification.local.json', import.meta.url);
const mode = process.argv[2];
assert(['prepare', 'cleanup'].includes(mode), 'Choose prepare or cleanup');
const seeded = await accounts();
await ready({ attempts: 1 });
if (mode === 'prepare') {
  try { await readFile(file); throw new Error('Existing visual fixtures require cleanup before another preparation'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const suffix = randomUUID().replaceAll('-', '');
  const source = { username: `noticevisual${suffix}`, email: `noticevisual${suffix}@example.test`, password: `Fixture!Aa8${randomUUID()}` };
  await api('identity', '/api/auth/register', { method: 'POST', body: { ...source, isPrivate: false }, expected: 200 });
  const sender = await login(source); const recipient = await login(seeded.find(account => account.username === 'alice'));
  assert.deepEqual(sender.user.roles, ['User']); assert.deepEqual(recipient.user.roles, ['User']);
  const chat = (await api('user', '/api/chats/create-or-get', { method: 'POST', token: sender.token, body: { participantIds: [sender.user.id, recipient.user.id] } })).data.chatId;
  const send = content => api('user', `/api/chats/${chat}/messages`, { method: 'POST', token: sender.token, body: { content, clientMessageId: randomUUID() } });
  await send('Verified notification delivery from a separate ordinary user session.');
  await send('Long notification content wraps within its card: ' + 'Music brings people together. '.repeat(18));
  await api('user', '/api/friends/request', { method: 'POST', token: sender.token, body: { targetUserId: recipient.user.id } });
  const snapshot = (await api('user', `/api/notifications/${recipient.user.id}?limit=100`, { token: recipient.token })).data;
  const notices = snapshot.notifications.filter(item => item.sourceUserId === sender.user.id);
  assert.equal(notices.length, 3);
  await writeFile(file, JSON.stringify({ scope: 'notification-visual-only', source, sourceId: sender.user.id, recipientId: recipient.user.id, chatId: chat, notices: notices.map(item => ({ id: item.id, type: item.type, message: item.message })) }, null, 2) + '\n');
  console.log('Prepared 3 real persisted notices from a fresh ordinary source to the ordinary demo recipient.');
} else {
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(fixture.scope, 'notification-visual-only'); assert.match(fixture.source.username, /^noticevisual[a-f0-9]{32}$/);
  const admin = await login(seeded.find(account => account.username === 'demoadmin'));
  const profile = await api('user', `/api/users/${fixture.sourceId}`, { token: admin.token });
  assert.equal(profile.data.userName, fixture.source.username);
  await api('identity', `/api/auth/users/${fixture.sourceId}`, { method: 'DELETE', token: admin.token, expected: 204 });
  await api('identity', `/api/auth/users/${fixture.sourceId}`, { token: admin.token, expected: 404 });
  await api('user', `/api/users/${fixture.sourceId}`, { token: admin.token, expected: 404 });
  const recipient = await login(seeded.find(account => account.username === 'alice'));
  await api('user', `/api/chats/${fixture.chatId}`, { token: recipient.token, expected: 404 });
  const snapshot = (await api('user', `/api/notifications/${recipient.user.id}?limit=100`, { token: recipient.token })).data;
  assert(!snapshot.notifications.some(item => fixture.notices.some(previous => previous.id === item.id)));
  await api('identity', '/api/auth/logout', { method: 'POST', token: admin.token, cookie: admin.cookie, expected: 204 });
  await writeFile(file, JSON.stringify({ ...fixture, cleanupVerified: true }, null, 2) + '\n');
  console.log('Visual fixtures removed by exact source account identity; recipient data preserved; chat/profile/notices deletion verified.');
}
