import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { accounts, api, login, ready } from './demo-api.mjs';

// A repeatable, secret-free fingerprint of the seeded durable state. This is
// deliberately separate from volatile presence, access tokens and playback.
const mode = process.argv[2];
if (!['capture', 'verify'].includes(mode)) throw new Error('Use capture or verify.');
const baseline = new URL('./results-persistence-baseline.local.json', import.meta.url);
const fixtures = JSON.parse((await readFile(new URL('./fixtures.local.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const hash = data => createHash('sha256').update(data).digest('hex');
const sessions = new Map();
await ready();
try {
  for (const account of await accounts()) sessions.set(account.username, await login(account));
  const admin = sessions.get('demoadmin');
  const state = { profiles: {}, playlists: {}, history: {}, media: [], chat: {} };
  for (const [name, session] of sessions) {
    assert(name === 'demoadmin' ? session.user.roles.includes('Admin') : session.user.roles.length === 1 && session.user.roles[0] === 'User', 'Account privilege changed');
    const profile = (await api('user', `/api/users/identity/${session.user.id}`, { token: admin.token })).data;
    state.profiles[name] = { id: profile.id, identityUserId: profile.identityUserId, username: profile.username ?? profile.userName, displayName: profile.displayName, bio: profile.bio, isPrivate: profile.isPrivate, avatarUrl: profile.avatarUrl, roles: [...session.user.roles].sort() };
    if (!['alice', 'bob'].includes(name)) continue;
    const lists = (await api('music', `/api/playlists/user/${session.user.id}?limit=100`, { token: session.token })).data;
    state.playlists[name] = lists.map(list => ({ id: list.id, name: list.name, coverUrl: list.coverUrl, isPublic: list.isPublic, songs: list.songs.map(song => song.id) })).sort((a, b) => a.id.localeCompare(b.id));
    const history = (await api('user', `/api/users/identity/${session.user.id}/listening-history?limit=100`, { token: session.token })).data;
    state.history[name] = history.map(event => ({ songId: event.songId, playedAt: event.playedAt, duration: event.duration }));
  }
  const alice = sessions.get('alice');
  const chat = (await api('user', `/api/chats/${fixtures.chatId}`, { token: alice.token })).data;
  const messages = (await api('user', `/api/chats/${fixtures.chatId}/messages`, { token: alice.token })).data;
  state.chat = { id: chat.id ?? chat.chatId, messages: messages.map(message => ({ id: message.id ?? message.messageId, contentHash: hash(message.content) })) };
  for (const id of fixtures.songIds) {
    const song = (await api('music', `/api/songs/${id}`)).data;
    const url = new URL(song.fileUrl);
    assert(url.origin === 'http://127.0.0.1:5102' && url.pathname.startsWith('/api/'), 'Media is outside the isolated catalogue proxy');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert(response.ok, 'Media fingerprint failed');
    const bytes = Buffer.from(await response.arrayBuffer());
    state.media.push({ id, durationSec: song.durationSec, byteLength: bytes.length, sha256: hash(bytes) });
  }
  if (mode === 'capture') await writeFile(baseline, JSON.stringify(state, null, 2));
  else assert.deepEqual(state, JSON.parse(await readFile(baseline, 'utf8')), 'Durable data changed across full stack stop/restart');
  console.log(`Persistence ${mode} passed: four profiles/roles, two playlist/history owners, seeded chat and two byte-exact media files.`);
} finally {
  for (const session of sessions.values()) await api('identity', '/api/auth/logout', { method: 'POST', cookie: session.cookie, expected: 204 });
}
