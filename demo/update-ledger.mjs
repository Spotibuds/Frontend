import assert from 'node:assert/strict';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SUPPORTED_STATUSES = Object.freeze([
  'Fixed and verified',
  'Fixed, verification blocked',
  'Mitigated for the local demo',
  'Deferred: production-only follow-up',
  'Not applicable, with evidence',
]);

const series = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
export const ORIGINAL_IDS = Object.freeze([
  ...series('F-', 15), ...series('IU-', 29), ...series('M-', 22), ...series('O-', 7),
  ...series('FR-', 4), ...series('IU-R', 6), ...series('MR-', 6), ...series('O-R', 3),
]);
const originalIds = new Set(ORIGINAL_IDS);
const repositories = new Set(['Frontend', 'Identity', 'Music', 'User']);
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const primaryPath = 'Frontend/docs/local-demo/remediation-ledger.json';
const markdownPath = 'Frontend/docs/local-demo/Remediation.md';
const inputs = [
  { repository: 'Identity', source: 'Identity/docs/remediation.json' },
  { repository: 'Music', source: 'Music/docs/remediation.json' },
  { repository: 'User', source: 'User/docs/remediation.json' },
  { repository: 'Frontend', source: 'Frontend/docs/frontend-remediation.json' },
  { repository: 'Frontend', source: 'Frontend/docs/local-demo/operations-remediation.json', operations: true },
];

function fail(message) { throw new Error(message); }
function record(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${context}: expected a JSON object.`);
  return value;
}
function strings(value, context) {
  if (value == null) return [];
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list) || list.some(item => typeof item !== 'string')) fail(`${context}: expected text or an array of text.`);
  return [...new Set(list.map(item => item.trim()).filter(Boolean))];
}
function text(value, context) { return strings(value, context).join('\n'); }
function id(value, context) {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(value) || value.length > 50) fail(`${context}: invalid finding ID.`);
  return value;
}
function status(value, context) {
  if (!SUPPORTED_STATUSES.includes(value)) fail(`${context}: unsupported disposition; use one of the five documented statuses exactly.`);
  return value;
}
function entries(document, context) {
  record(document, context);
  if (!Array.isArray(document.entries)) fail(`${context}: entries must be an array.`);
  const seen = new Set();
  for (const entry of document.entries) {
    record(entry, context); const key = id(entry.id, context);
    if (seen.has(key)) fail(`${context}: duplicate ID ${key}.`);
    seen.add(key);
  }
  return document.entries;
}

export function repositoryFile(file, repository) {
  if (typeof file !== 'string' || !file.trim()) fail(`${repository}: invalid changed file.`);
  const normalized = file.trim().replaceAll('\\', '/');
  const match = /^(.*?)(\s+\(removed\))$/i.exec(normalized);
  const label = match ? match[2] : '';
  const target = match ? match[1] : normalized;
  if (/^(?:\/|[A-Za-z]:|[a-z]+:\/\/)/.test(target) || target.includes('\0')) fail(`${repository}: changed files must stay within the four repository paths.`);
  const prefix = target.split('/')[0];
  const resolved = path.posix.normalize(repositories.has(prefix) ? target : `${repository}/${target}`);
  if (!repositories.has(resolved.split('/')[0])) fail(`${repository}: a changed file escapes the workspace repositories.`);
  return resolved + label;
}

function contributor(entry, input) {
  const key = entry.id; const context = `${input.source} ${key}`;
  const disposition = status(entry.status ?? entry.finalStatus, context);
  if (entry.status != null && entry.finalStatus != null && entry.status !== entry.finalStatus) fail(`${context}: contradictory status and finalStatus.`);
  const correction = text(entry.correction ?? entry.plannedCorrection, `${context} correction`);
  const applicability = text(entry.applicability, `${context} applicability`);
  if (!correction || !applicability) fail(`${context}: correction and applicability are required.`);
  const verification = strings(entry.verification, `${context} verification`);
  const evidence = text(entry.evidence, `${context} evidence`);
  if (disposition === 'Fixed and verified' && !verification.length) fail(`${context}: verified disposition requires recorded verification.`);
  if (disposition === 'Not applicable, with evidence' && !evidence && !verification.length) fail(`${context}: non-applicability requires evidence or recorded verification.`);
  return {
    repository: input.repository, source: input.source, operations: Boolean(input.operations),
    title: text(entry.title, `${context} title`), applicability, correction,
    changedFiles: strings(entry.changedFiles, `${context} changedFiles`).map(file => repositoryFile(file, input.repository)),
    verification, regressionTests: strings(entry.regressionTests, `${context} regressionTests`),
    evidence, status: disposition,
    limitations: strings(entry.limitations ?? entry.remainingLimitations, `${context} limitations`),
  };
}

function selectedStatus(key, contributions, overrides) {
  if (Object.hasOwn(overrides, key)) return { value: overrides[key], reason: 'Explicit manual override' };
  const operations = contributions.filter(item => item.operations);
  if (/^O-/.test(key) && operations.length) return { value: operations[0].status, reason: 'Shared operations ledger is authoritative' };
  // Every relevant contributor must be verified before a shared finding is verified.
  const applicable = contributions.filter(item => item.status !== 'Not applicable, with evidence');
  const order = ['Fixed, verification blocked', 'Deferred: production-only follow-up', 'Mitigated for the local demo', 'Fixed and verified'];
  return { value: applicable.length ? order.find(value => applicable.some(item => item.status === value)) : 'Not applicable, with evidence', reason: 'Conservative combined contributor dispositions' };
}
function counters(list) {
  return Object.fromEntries(SUPPORTED_STATUSES.map(value => [value, list.filter(entry => entry.finalStatus === value).length]));
}

export function mergeLedgers(primary, sources, explicitOverrides = {}) {
  const originals = entries(primary, 'Primary ledger');
  const missing = ORIGINAL_IDS.filter(key => !originals.some(entry => entry.id === key));
  if (missing.length) fail(`Primary ledger is missing original audit IDs: ${missing.join(', ')}.`);
  for (const entry of originals) {
    if (entry.finalStatus != null) status(entry.finalStatus, `Primary ledger ${entry.id}`);
    if (entry.status != null) status(entry.status, `Primary ledger ${entry.id}`);
    if (originalIds.has(entry.id) && (!text(entry.title, `${entry.id} original title`) || !text(entry.evidence, `${entry.id} original evidence`))) fail(`Primary ledger ${entry.id}: original title and evidence must be retained.`);
  }
  const overrides = { ...record(primary.manualStatusOverrides ?? {}, 'manualStatusOverrides'), ...record(explicitOverrides, 'CLI overrides') };
  for (const [key, value] of Object.entries(overrides)) { id(key, 'manualStatusOverrides'); status(value, `manualStatusOverrides ${key}`); }
  const map = new Map(originals.map(entry => [entry.id, { ...entry, contributors: [] }]));
  const seenSources = new Set();
  for (const input of sources) {
    if (!repositories.has(input.repository) || !input.source || seenSources.has(input.source)) fail('Contributor inputs require a known repository and distinct source path.');
    seenSources.add(input.source);
    record(input.document, input.source);
    if (input.document.repository && input.document.repository !== input.repository) fail(`${input.source}: repository label does not match its source.`);
    for (const entry of entries(input.document, input.source)) {
      const contribution = contributor(entry, input);
      if (!map.has(entry.id)) {
        map.set(entry.id, {
          id: entry.id, title: contribution.title || contribution.applicability,
          severity: entry.severity ?? 'Not severity-ranked in the original audit',
          evidence: contribution.evidence || 'Encountered during task; supporting evidence is recorded by the contributors below.',
          plannedCorrection: contribution.correction, contributors: [],
        });
      }
      map.get(entry.id).contributors.push(contribution);
    }
  }
  for (const key of Object.keys(overrides)) if (!map.has(key)) fail(`Manual override refers to an unknown ID: ${key}.`);
  const merged = [];
  for (const [key, entry] of map) {
    if (!entry.contributors.length) fail(`No contributor disposition exists for ${key}. Complete the relevant remediation input before merging.`);
    const decision = selectedStatus(key, entry.contributors, overrides);
    const unique = field => [...new Set(entry.contributors.flatMap(item => item[field]))];
    merged.push({
      ...entry,
      origin: originalIds.has(key) ? 'Original audit' : 'Encountered during task',
      applicability: [...new Set(entry.contributors.map(item => `${item.repository}: ${item.applicability}`))].join('\n'),
      correction: [...new Set(entry.contributors.map(item => `${item.repository}: ${item.correction}`))].join('\n'),
      changedFiles: unique('changedFiles'), verification: unique('verification'), regressionTests: unique('regressionTests'),
      workState: decision.value === 'Fixed, verification blocked' ? 'Verification blocked' : 'Complete disposition',
      finalStatus: decision.value, statusResolution: decision.reason,
      remainingLimitations: unique('limitations'),
    });
  }
  const originalEntries = merged.filter(entry => originalIds.has(entry.id));
  const newEntries = merged.filter(entry => !originalIds.has(entry.id));
  assert.equal(originalEntries.length, 92);
  return {
    ...primary, schemaVersion: 2, updated: new Date().toISOString().slice(0, 10),
    manualStatusOverrides: overrides,
    mergeSources: sources.map(({ repository, source }) => ({ repository, source })),
    statusPolicy: 'Exact user-supported statuses; explicit overrides first; root operations owns O-*; otherwise conservative contributor disposition. Original evidence/title/severity/planned correction retained.',
    counts: { originalAuditIds: 92, originalFindings: 73, originalRisksAndDormantItems: 19, encounteredDuringTask: newEntries.length, total: merged.length },
    dispositions: { originalAudit: counters(originalEntries), encounteredDuringTask: counters(newEntries), overall: counters(merged) },
    entries: merged,
  };
}

function prose(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
export function renderMarkdown(ledger) {
  const lines = ['# Spotibuds remediation ledger', '', `${ledger.scope}. Updated ${ledger.updated}.`, '',
    'All 92 original audit IDs are retained with their original evidence. Newly encountered issues are counted separately. Verification statements describe the recorded checks; remaining limitations qualify each disposition.', '',
    '| Disposition | Original audit IDs | Encountered during task | Total |', '| --- | ---: | ---: | ---: |'];
  for (const value of SUPPORTED_STATUSES) lines.push(`| ${value} | ${ledger.dispositions.originalAudit[value]} | ${ledger.dispositions.encounteredDuringTask[value]} | ${ledger.dispositions.overall[value]} |`);
  lines.push(`| **Total** | **92** | **${ledger.counts.encounteredDuringTask}** | **${ledger.counts.total}** |`, '',
    'Original audit: 73 findings and 19 risks/dormant items. Machine-readable evidence and contributor provenance: [remediation-ledger.json](remediation-ledger.json).', '');
  for (const [origin, heading] of [['Original audit', 'Original audit dispositions'], ['Encountered during task', 'Issues encountered during task']]) {
    lines.push(`## ${heading}`, '');
    for (const entry of ledger.entries.filter(item => item.origin === origin)) {
      lines.push(`### ${entry.id}: ${prose(entry.title).replaceAll('\n', ' ')}`, '', `**Status:** ${entry.finalStatus}`, '', `**Origin:** ${origin}. ${entry.statusResolution}.`, '',
        '**Applicability:**', '', prose(entry.applicability), '', origin === 'Original audit' ? '**Original evidence:**' : '**Discovery evidence:**', '', prose(entry.evidence), '',
        '**Planned correction:**', '', prose(entry.plannedCorrection), '', '**Implemented correction or mitigation:**', '', prose(entry.correction), '', '**Changed files:**', '');
      if (entry.changedFiles.length) lines.push(...entry.changedFiles.map(file => `- ${prose(file)}`));
      else lines.push('No source file change required; disposition evidence is recorded below.');
      lines.push('', '**Regression tests and verification:**', '');
      lines.push(...[...new Set([...entry.regressionTests, ...entry.verification])].map(check => `- ${prose(check)}`));
      lines.push('', '**Remaining limitations:**', '');
      if (entry.remainingLimitations.length) lines.push(...entry.remainingLimitations.map(limitation => `- ${prose(limitation)}`));
      else lines.push('No remaining limitation recorded for this finding.');
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

async function readJson(relative) {
  let source;
  try { source = await readFile(path.join(workspace, relative), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') fail(`Required ledger input is missing: ${relative}. Complete its remediation entries and run the merger again.`); throw error; }
  try { return JSON.parse(source.replace(/^\uFEFF/, '')); }
  catch { fail(`Invalid JSON in ledger input: ${relative}. No outputs were written.`); }
}

export function selfTest() {
  const primary = { scope: 'Self-test only', entries: ORIGINAL_IDS.map(key => ({ id: key, title: key, evidence: `Original ${key}`, plannedCorrection: 'Original plan' })) };
  const source = { repository: 'User', source: 'User/docs/remediation.json', document: { repository: 'User', entries: ORIGINAL_IDS.map(key => ({ id: key, applicability: 'Confirmed', correction: 'Corrected', changedFiles: ['Controllers/DebugController.cs (removed)'], verification: ['State verified'], status: SUPPORTED_STATUSES[0], limitations: [] })) } };
  const merged = mergeLedgers(primary, [source]);
  assert.equal(merged.dispositions.originalAudit[SUPPORTED_STATUSES[0]], 92); assert.equal(merged.counts.encounteredDuringTask, 0);
  assert.equal(merged.entries[0].evidence, 'Original F-01'); assert.equal(merged.entries[0].plannedCorrection, 'Original plan');
  assert.equal(merged.entries[0].changedFiles[0], 'User/Controllers/DebugController.cs (removed)');
  assert.equal(repositoryFile('../Frontend/demo/Test.ps1', 'Identity'), 'Frontend/demo/Test.ps1');
  assert.throws(() => repositoryFile('../../outside.txt', 'User'), /escapes/);
  assert.throws(() => mergeLedgers({ ...primary, entries: primary.entries.slice(1) }, [source]), /missing original/);
  const erased = structuredClone(primary); delete erased.entries[0].evidence; assert.throws(() => mergeLedgers(erased, [source]), /original title and evidence/);
  const invalidPrimary = structuredClone(primary); invalidPrimary.entries[0].finalStatus = 'Done'; assert.throws(() => mergeLedgers(invalidPrimary, [source]), /unsupported disposition/);
  const invalid = structuredClone(source); invalid.document.entries[0].status = 'Done'; assert.throws(() => mergeLedgers(primary, [invalid]), /unsupported disposition/);
  const duplicate = structuredClone(source); duplicate.document.entries.push(duplicate.document.entries[0]); assert.throws(() => mergeLedgers(primary, [duplicate]), /duplicate ID/);
  const missing = structuredClone(source); missing.document.entries.pop(); assert.throws(() => mergeLedgers(primary, [missing]), /No contributor/);
  const addition = structuredClone(source); addition.document.entries.push({ ...addition.document.entries[0], id: 'NEW-U99', title: 'New issue' });
  const added = mergeLedgers(primary, [addition], { 'O-02': SUPPORTED_STATUSES[2] });
  assert.equal(added.counts.encounteredDuringTask, 1); assert.equal(added.counts.originalAuditIds, 92);
  assert.equal(added.entries.at(-1).origin, 'Encountered during task'); assert.equal(added.entries.at(-1).title, 'New issue');
  assert.equal(added.dispositions.originalAudit[SUPPORTED_STATUSES[2]], 1); assert.equal(added.dispositions.encounteredDuringTask[SUPPORTED_STATUSES[0]], 1);
  assert.deepEqual(mergeLedgers(added, [addition]), added);
  const blocked = { ...structuredClone(source), source: 'Music/docs/remediation.json', repository: 'Music' }; blocked.document.repository = 'Music'; blocked.document.entries[0].status = SUPPORTED_STATUSES[1];
  const shared = mergeLedgers(primary, [source, blocked]); assert.equal(shared.entries[0].finalStatus, SUPPORTED_STATUSES[1]);
  const operations = { ...structuredClone(source), source: 'Frontend/docs/local-demo/operations-remediation.json', repository: 'Frontend', operations: true }; operations.document.repository = 'Frontend'; operations.document.entries.find(entry => entry.id === 'O-04').status = SUPPORTED_STATUSES[0];
  blocked.document.entries.find(entry => entry.id === 'O-04').status = SUPPORTED_STATUSES[1];
  assert.equal(mergeLedgers(primary, [blocked, operations]).entries.find(entry => entry.id === 'O-04').finalStatus, SUPPORTED_STATUSES[0]);
  assert.match(renderMarkdown(added), /Original audit dispositions/); assert.match(renderMarkdown(added), /NEW-U99: New issue/);
  return 'Ledger self-test passed: evidence preservation, all92 coverage, exact statuses, duplicate/missing rejection, paths/removal labels, new counts, conservative/shared overrides, rerun stability, Markdown.';
}

async function main(args) {
  if (args.includes('--self-test')) { if (args.length !== 1) fail('--self-test cannot be combined with merge options.'); console.log(selfTest()); return; }
  if (args.includes('--help')) { console.log("Usage: node Frontend/demo/update-ledger.mjs [--check] [--override 'ID=Exact status']\nReads all five contributor ledgers. --check validates without writing. Manual overrides can also be stored in the primary ledger's manualStatusOverrides map. --self-test runs only in-memory checks."); return; }
  let checkOnly = false; const overrides = {};
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--check') { checkOnly = true; continue; }
    if (args[index] !== '--override' || !args[index + 1]?.includes('=')) fail('Unknown or incomplete argument; use --help.');
    const option = args[++index]; const separator = option.indexOf('='); const key = id(option.slice(0, separator), '--override');
    if (Object.hasOwn(overrides, key)) fail(`Duplicate manual override: ${key}.`);
    overrides[key] = status(option.slice(separator + 1), `--override ${key}`);
  }
  const primary = await readJson(primaryPath);
  const sources = await Promise.all(inputs.map(async input => ({ ...input, document: await readJson(input.source) })));
  const ledger = mergeLedgers(primary, sources, overrides);
  const json = JSON.stringify(ledger, null, 2) + '\n'; const markdown = renderMarkdown(ledger);
  if (!checkOnly) {
    const jsonTarget = path.join(workspace, primaryPath); const markdownTarget = path.join(workspace, markdownPath);
    const suffix = `.merge-${process.pid}.tmp`; const jsonTemporary = jsonTarget + suffix; const markdownTemporary = markdownTarget + suffix;
    try {
      await writeFile(jsonTemporary, json, { flag: 'wx' }); await writeFile(markdownTemporary, markdown, { flag: 'wx' });
      await rename(markdownTemporary, markdownTarget); await rename(jsonTemporary, jsonTarget);
    } finally { await Promise.all([rm(jsonTemporary, { force: true }), rm(markdownTemporary, { force: true })]); }
  }
  console.log(`${checkOnly ? 'Validated' : 'Updated'} remediation ledger: 92 original audit IDs; ${ledger.counts.encounteredDuringTask} newly encountered; ${ledger.counts.total} total.`);
  console.log(JSON.stringify(ledger.dispositions, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(`Ledger merge failed: ${error.message}`); process.exitCode = 1; });
}
