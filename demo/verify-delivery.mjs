import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Inspect only files eligible for delivery. Never output credential values or
// matching content, including on failure.
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const local = async name => (await readFile(new URL(name, import.meta.url), 'utf8')).replace(/^\uFEFF/, '');
const environment = await local('.env.localdemo');
const credentials = JSON.parse(await local('accounts.local.json'));
const sensitive = environment.split(/\r?\n/)
  .filter(line => /^[^#=]*(?:PASSWORD|KEY|SECRET)[^=]*=/.test(line))
  .map(line => line.slice(line.indexOf('=') + 1));
sensitive.push(...credentials.map(account => account.password));
assert(sensitive.length >= 10 && sensitive.every(value => typeof value === 'string' && value.length >= 12), 'Generated credentials are missing or invalid');
let count = 0;
for (const repository of ['Frontend', 'Identity', 'Music', 'User']) {
  const directory = path.join(workspace, repository);
  const files = execFileSync('git', ['-c', `safe.directory=${directory.replaceAll('\\', '/')}`, '-C', directory, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    .split('\0').filter(Boolean);
  for (const relative of new Set(files)) {
    const name = `${repository}/${relative}`;
    assert(!/(?:^|\/)(?:\.env\.localdemo|accounts\.local\.json|fixtures\.local\.json|node_modules|\.git|assets)(?:\/|$)/.test(relative), `Generated or private file eligible for delivery: ${name}`);
    let content;
    try { content = await readFile(path.join(directory, relative)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw new Error(`Cannot inspect delivery file: ${name}`); }
    assert(!sensitive.some(value => content.includes(Buffer.from(value))), `Fresh local credential found in delivery file: ${name}`);
    count++;
  }
  execFileSync('git', ['-c', `safe.directory=${directory.replaceAll('\\', '/')}`, '-C', directory, 'diff', '--check'], { stdio: ['ignore', 'ignore', 'ignore'] });
  execFileSync('git', ['-c', `safe.directory=${directory.replaceAll('\\', '/')}`, '-C', directory, 'diff', '--cached', '--check'], { stdio: ['ignore', 'ignore', 'ignore'] });
}
console.log(`Delivery hygiene passed: ${count} files; no generated credentials/assets included; working-tree and staged whitespace checks passed in all four repositories.`);
