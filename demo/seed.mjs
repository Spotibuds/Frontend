import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { accounts, api, login, ready } from './demo-api.mjs';

const assetDir = new URL('./assets/', import.meta.url);
const fixtureFile = new URL('./fixtures.local.json', import.meta.url);
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, crc]); }
function png(color) {
  const size = 128; const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * (size * 4 + 1) + 1 + x * 4; const shape = Math.sin((x + y) / 17) * 20;
    for (let c = 0; c < 3; c++) pixels[index + c] = Math.max(0, Math.min(255, color[c] + shape + y / 5)); pixels[index + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
function wav(seconds, frequency) {
  const rate = 22050, samples = rate * seconds, dataSize = samples * 2; const audio = Buffer.alloc(44 + dataSize);
  audio.write('RIFF'); audio.writeUInt32LE(36 + dataSize, 4); audio.write('WAVE', 8); audio.write('fmt ', 12); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) { const envelope = Math.min(1, i / rate, (samples - i) / rate); const t = i / rate;
    audio.writeInt16LE(Math.round(envelope * 1000 * (Math.sin(2 * Math.PI * frequency * t) + .3 * Math.sin(2 * Math.PI * frequency * 1.5 * t))), 44 + i * 2); }
  return audio;
}
function form(fields, files = {}) { const result = new FormData(); for (const [key, value] of Object.entries(fields)) result.set(key, String(value));
  for (const [key, file] of Object.entries(files)) result.set(key, new Blob([file.bytes], { type: file.type }), file.name); return result; }
function assert(condition, message) { if (!condition) throw new Error(message); }
function stableId(text) { const hash = createHash('sha256').update(text).digest('hex'); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`; }

await ready(); await mkdir(assetDir, { recursive: true });
const cover = png([30, 100, 165]); const short = wav(12, 220), long = wav(125, 165);
await Promise.all([writeFile(new URL('cover.png', assetDir), cover), writeFile(new URL('morning-loop.wav', assetDir), short), writeFile(new URL('long-horizon.wav', assetDir), long)]);
const image = { bytes: cover, type: 'image/png', name: 'cover.png' };
const configured = await accounts(); const sessions = new Map();
try {
for (const account of configured) {
  if (account.role !== 'Admin') await api('identity', '/api/auth/register', { method: 'POST', body: { username: account.username, email: account.email, password: account.password, isPrivate: account.username === 'bob' }, expected: [200, 409] });
  const session = await login(account); assert(session.user.roles.includes(account.role), 'Account privilege invariant failed');
  if (account.role !== 'Admin') assert(!session.user.roles.includes('Admin'), 'Ordinary account became an administrator'); sessions.set(account.username, session);
  const displayName = account.username === 'demoadmin' ? 'Demo Administrator' : account.username[0].toUpperCase() + account.username.slice(1);
  await api('user', `/api/users/identity/${session.user.id}`, { method: 'PUT', token: session.token, body: { displayName, bio: 'Synthetic local demo profile. Media generated for this demo.', isPrivate: account.username === 'bob' } });
  const profile = (await api('user', `/api/users/identity/${session.user.id}`, { token: session.token })).data;
  if (!profile.avatarUrl) await api('user', `/api/users/identity/${session.user.id}/profile-picture`, { method: 'POST', token: session.token, body: form({}, { file: { ...image, name: 'avatar.png' } }) });
}
const admin = sessions.get(configured.find(a => a.role === 'Admin').username);
const existingArtists = (await api('music', '/api/artists?limit=100')).data;
let artist = existingArtists.find(a => a.name === 'Demo Aurora');
if (!artist) artist = (await api('music', '/api/admin/artists', { method: 'POST', token: admin.token, body: form({ Name: 'Demo Aurora', Bio: 'Generated instrumental demo artist.' }, { ImageFile: image }) })).data;
const existingAlbums = (await api('music', '/api/albums?limit=100')).data;
let album = existingAlbums.find(a => a.title === 'Local Sessions' && a.artist?.id === artist.id);
if (!album) album = (await api('music', '/api/admin/albums', { method: 'POST', token: admin.token, body: form({ Title: 'Local Sessions', ArtistId: artist.id, ReleaseDate: '2026-10-03T00:00:00Z' }, { CoverFile: image }) })).data;
const existingSongs = (await api('music', '/api/songs?limit=100')).data;
const songs = [];
for (const track of [{ title: 'Morning Loop', duration: 12, bytes: short, name: 'morning-loop.wav' }, { title: 'Long Horizon', duration: 125, bytes: long, name: 'long-horizon.wav' }]) {
  let song = existingSongs.find(s => s.title === track.title && s.album?.id === album.id);
  if (!song) song = (await api('music', '/api/admin/songs', { method: 'POST', token: admin.token, body: form({ Title: track.title, ArtistId: artist.id, AlbumId: album.id, Genre: 'Ambient', Duration: track.duration }, { AudioFile: { bytes: track.bytes, type: 'audio/wav', name: track.name }, CoverFile: image }) })).data;
  assert(song.durationSec === track.duration && !!song.fileUrl, 'Playable catalogue metadata invariant failed'); songs.push(song);
}
for (const name of ['alice', 'bob']) {
  const session = sessions.get(name); const lists = (await api('music', `/api/playlists/user/${session.user.id}?limit=100`, { token: session.token })).data;
  let playlist = lists.find(p => p.name === (name === 'alice' ? 'Demo Favorites' : 'Private Focus'));
  if (!playlist) playlist = (await api('music', '/api/playlists', { method: 'POST', token: session.token, body: { name: name === 'alice' ? 'Demo Favorites' : 'Private Focus', description: 'Rights-safe synthesized audio for the local walkthrough.', isPublic: name === 'alice' } })).data;
  for (const song of songs) await api('music', `/api/playlists/${playlist.id}/songs/${song.id}`, { method: 'POST', token: session.token, expected: [200, 409] });
  if (!playlist.coverUrl) await api('music', `/api/playlists/${playlist.id}/cover`, { method: 'POST', token: session.token, body: form({}, { file: image }) });
  const detail = (await api('music', `/api/playlists/${playlist.id}`, { token: session.token })).data;
  assert(detail.songs.length === 2 && new Set(detail.songs.map(s => s.id)).size === 2, 'Playlist seed duplicate invariant failed');
}
const alice = sessions.get('alice'), bob = sessions.get('bob');
const status = (await api('user', `/api/friends/status?userId1=${alice.user.id}&userId2=${bob.user.id}`, { token: alice.token })).data;
if (status.status !== 'accepted') {
  const request = (await api('user', '/api/friends/request', { method: 'POST', token: alice.token, body: { targetUserId: bob.user.id } })).data;
  await api('user', `/api/friends/${request.friendshipId}/accept`, { method: 'POST', token: bob.token });
}
await api('user', '/api/follows', { method: 'POST', token: alice.token, body: { followedId: bob.user.id } });
await api('user', '/api/follows', { method: 'POST', token: bob.token, body: { followedId: alice.user.id } });
const chat = (await api('user', '/api/chats/create-or-get', { method: 'POST', token: alice.token, body: { participantIds: [alice.user.id, bob.user.id] } })).data;
const chatId = chat.id ?? chat.chatId;
await api('user', `/api/chats/${chatId}/messages`, { method: 'POST', token: alice.token, body: { content: 'Welcome to the local demo! Try playback, playlists, profiles and chat.', clientMessageId: stableId('spotibuds-demo-alice-welcome-v1') } });
await api('user', `/api/chats/${chatId}/messages`, { method: 'POST', token: bob.token, body: { content: 'The long track demonstrates now-playing renewal beyond its initial lifetime.', clientMessageId: stableId('spotibuds-demo-bob-reply-v1') } });
for (const session of [alice, bob]) {
  const history = (await api('user', `/api/users/identity/${session.user.id}/listening-history?limit=100`, { token: session.token })).data;
  for (const song of songs) if (!history.some(h => h.songId === song.id)) await api('user', `/api/users/identity/${session.user.id}/listening-history`, { method: 'POST', token: session.token, body: { songId: song.id, songTitle: song.title, artist: artist.name, coverUrl: song.coverUrl, duration: song.durationSec } });
}
await writeFile(fixtureFile, JSON.stringify({ version: 1, artistId: artist.id, albumId: album.id, songIds: songs.map(s => s.id), chatId,
  users: Object.fromEntries([...sessions].map(([name, s]) => [name, { id: s.user.id }])) }, null, 2));
} finally {
for (const session of sessions.values()) await api('identity', '/api/auth/logout', { method: 'POST', cookie: session.cookie });
}
console.log('Seed verified: four privilege-correct accounts, public/private profiles, generated avatars/covers, artist/album/two playable tracks, two playlists, friends/follows/chat/history. No duplicate fixture relationships.');
