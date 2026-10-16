const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { validateSkill } = require('../src/validate');
const { analyzeInteractions, findInteractionCandidates } = require('../src/interactions');

const tmpBase = path.join(os.tmpdir(), 'sa-interactions-test-' + Date.now());

function makeSkill(name, description, body = '') {
  const dir = path.join(tmpBase, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n${body}`);
  return validateSkill({ path: dir, name });
}

function makeCommand(program) {
  const commandPath = path.join(tmpBase, `command-${Math.random().toString(36).slice(2)}.js`);
  fs.mkdirSync(tmpBase, { recursive: true });
  fs.writeFileSync(commandPath, `#!/usr/bin/env node\n${program}`);
  fs.chmodSync(commandPath, 0o755);
  return commandPath;
}

function semanticResponse(type = 'conflict') {
  return `const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));\n` +
    `const candidate = input.candidates[0];\n` +
    `process.stdout.write(JSON.stringify({version: 1, interactions: [{candidateId: candidate.id, type: '${type}', explanation: 'Instructions disagree', citations: [{skillId: candidate.skills[0].id, quote: 'Always format with tabs.'}, {skillId: candidate.skills[1].id, quote: 'Prefer spaces for formatting.'}]}]}));`;
}

test('finds likely overlapping skills with stable evidence', () => {
  const skills = [
    makeSkill('react-forms', 'Build accessible React forms with validation'),
    makeSkill('form-helper', 'Create accessible React forms and validation'),
  ];

  const candidates = findInteractionCandidates(skills);

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].names, ['form-helper', 'react-forms']);
  assert.deepEqual(candidates[0].sharedTerms, ['accessible', 'forms', 'react', 'validation']);
  assert.equal(candidates[0].id, findInteractionCandidates(skills)[0].id);
});

test('does not flag unrelated skills or compare a skill with itself', () => {
  const skills = [
    makeSkill('gardening', 'Plan seasonal vegetable gardens and soil care'),
    makeSkill('database', 'Tune PostgreSQL queries and database indexes'),
  ];

  assert.deepEqual(findInteractionCandidates(skills), []);
  assert.deepEqual(findInteractionCandidates([skills[0]]), []);
});

test('matches non-English skill descriptions', () => {
  const skills = [
    makeSkill('security-a', 'Проверяй безопасность зависимостей и уязвимости проекта'),
    makeSkill('security-b', 'Анализируй безопасность зависимостей и уязвимости пакетов'),
  ];

  assert.deepEqual(findInteractionCandidates(skills)[0].sharedTerms, ['безопасность', 'зависимостей', 'уязвимости']);
});

test('offline overlap results cite matching text from both skill descriptions', () => {
  const skills = [
    makeSkill('react-forms', 'Build accessible React forms with validation'),
    makeSkill('form-helper', 'Create accessible React forms and validation'),
  ];

  const interaction = analyzeInteractions(skills).interactions[0];

  assert.equal(interaction.citations.length, 2);
  assert.ok(interaction.citations.every((citation) => citation.line === 3 && citation.quote));
});

test('semantic command can classify a conflict and returns locally resolved citation lines', () => {
  const skills = [
    makeSkill('format-a', 'Format code with tabs', 'Always format with tabs.'),
    makeSkill('format-b', 'Format code with spaces', 'Prefer spaces for formatting.'),
  ];
  const command = makeCommand(semanticResponse());

  const result = analyzeInteractions(skills, { semanticCommand: command });

  assert.equal(result.error, null);
  assert.equal(result.interactions[0].type, 'conflict');
  assert.deepEqual(result.interactions[0].citations.map(({ path: sourcePath, line, quote }) => ({
    path: sourcePath,
    line,
    quote,
  })), [
    { path: path.join(skills[0].path, 'SKILL.md'), line: 5, quote: 'Always format with tabs.' },
    { path: path.join(skills[1].path, 'SKILL.md'), line: 5, quote: 'Prefer spaces for formatting.' },
  ]);
});

test('semantic command errors on invalid JSON and unmatched citations', () => {
  const skills = [makeSkill('format-a', 'Format code with tabs'), makeSkill('format-b', 'Format code with spaces')];
  assert.equal(findInteractionCandidates(skills).length, 1);
  const invalidJson = analyzeInteractions(skills, { semanticCommand: makeCommand('process.stdout.write("not-json");') });
  assert.match(invalidJson.error, /invalid JSON/);

  const invalidCitation = analyzeInteractions(skills, {
    semanticCommand: makeCommand(semanticResponse().replace('Always format with tabs.', 'not in the skill')),
  });
  assert.match(invalidCitation.error, /citation/);

  const unknownPair = analyzeInteractions(skills, {
    semanticCommand: makeCommand(semanticResponse().replace('candidate.id', '"unknown-pair"')),
  });
  assert.match(unknownPair.error, /invalid interaction/);

  const missingResult = analyzeInteractions(skills, {
    semanticCommand: makeCommand('process.stdout.write(JSON.stringify({version: 1, interactions: []}));'),
  });
  assert.match(missingResult.error, /missing candidate/i);
});

test('does not invoke semantic command when lexical scan finds no candidate', () => {
  const skills = [
    makeSkill('gardening', 'Plan seasonal vegetable gardens and soil care'),
    makeSkill('database', 'Tune PostgreSQL queries and database indexes'),
  ];

  assert.deepEqual(analyzeInteractions(skills, { semanticCommand: '/not/a/real/command' }), {
    interactions: [],
    error: null,
  });
});

test('semantic command reports process failure, timeout, and excessive output', () => {
  const skills = [makeSkill('format-a', 'Format code with tabs'), makeSkill('format-b', 'Format code with spaces')];
  const failed = analyzeInteractions(skills, { semanticCommand: makeCommand('process.exit(3);') });
  assert.match(failed.error, /status 3/);

  const timedOut = analyzeInteractions(skills, {
    semanticCommand: makeCommand('setTimeout(() => process.exit(0), 1000);'),
    timeoutMs: 20,
  });
  assert.match(timedOut.error, /timed out|ETIMEDOUT/i);

  const oversized = analyzeInteractions(skills, {
    semanticCommand: makeCommand('process.stdout.write("x".repeat(1000));'),
    maxOutputBytes: 100,
  });
  assert.match(oversized.error, /maxBuffer|output/i);
});

test.after(() => {
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
});
