const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const tmpBase = path.join(os.tmpdir(), 'sa-cli-test-' + Date.now());
const fakeHome = path.join(tmpBase, 'fake-home');
fs.mkdirSync(fakeHome, { recursive: true });

const binPath = path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js'));

function runCli(args, opts = {}) {
  return spawnSync(process.execPath, [
    '--require', 'tsx/cjs',
    binPath,
    ...args,
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome }, ...opts });
}

function makeFixture(contents) {
  const dir = path.join(tmpBase, String(Math.random().toString(36).slice(2)));
  fs.mkdirSync(dir, { recursive: true });

  for (const [relPath, content] of Object.entries(contents)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return dir;
}

function makeCommand(program) {
  const commandPath = path.join(tmpBase, `semantic-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(commandPath, `#!/usr/bin/env node\n${program}`);
  fs.chmodSync(commandPath, 0o755);
  return commandPath;
}

test('default scan renders tree', () => {
  const fixture = makeFixture({
    '.agents/skills/alpha/SKILL.md': '---\nname: alpha\ndescription: first skill\n---',
    '.agents/skills/beta/SKILL.md': '---\nname: beta\ndescription: second skill\n---',
  });

  const result = runCli(['--project', fixture]);

  assert.match(result.stdout, /Skills/);
  assert.match(result.stdout, /alpha/);
  assert.equal(result.status, 0);
});

test('report --json emits parseable JSON and exits on errors', () => {
  const fixture = makeFixture({
    '.agents/skills/broken/SKILL.md': '---\n---',
  });

  const result = runCli(['report', '--json', '--project', fixture]);

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.counts.errors, 1);
  assert.ok(report.counts.skills >= 1);
});

test('report emits JSON without requiring --json', () => {
  const fixture = makeFixture({
    '.agents/skills/good/SKILL.md': '---\nname: good\ndescription: OK\n---',
  });

  const result = runCli(['report', '--project', fixture]);

  assert.doesNotThrow(() => JSON.parse(result.stdout));
  assert.equal(result.status, 0);
});

test('reports a skill directory without SKILL.md', () => {
  const fixture = makeFixture({
    '.agents/skills/broken/README.md': 'No skill file',
  });

  const result = runCli(['check', '--project', fixture]);

  assert.match(result.stdout, /MISSING_SKILL_FILE|SKILL\.md/);
  assert.equal(result.status, 1);
});

test('reports root scan errors and exits non-zero', () => {
  const root = path.join(tmpBase, 'unreadable-root');
  fs.mkdirSync(root, { recursive: true });
  fs.chmodSync(root, 0o000);

  let result;
  try {
    result = runCli(['--root', root]);
  } finally {
    fs.chmodSync(root, 0o755);
  }

  assert.equal(result.status, 1);
  assert.match(result.stdout, /permission denied|EACCES/i);
});

test('check command reports findings', () => {
  const fixture = makeFixture({
    '.agents/skills/good/SKILL.md': '---\nname: good\ndescription: OK\n---',
    '.agents/skills/bad/SKILL.md': '---\n---',
  });

  const result = runCli(['check', '--project', fixture]);

  assert.match(result.stdout, /Recommendations/);
  assert.equal(result.status, 1);
});

test('check command prints source line for a missing reference', () => {
  const fixture = makeFixture({
    '.agents/skills/broken/SKILL.md': '---\nname: broken\ndescription: broken link\n---\nSee [missing](./missing.md)',
  });

  const result = runCli(['check', '--no-color', '--project', fixture]);

  assert.match(result.stdout, /SKILL\.md:5/);
  assert.equal(result.status, 0);
});

test('check --interactions reports likely overlaps in JSON', () => {
  const fixture = makeFixture({
    '.agents/skills/react-forms/SKILL.md': '---\nname: react-forms\ndescription: Build accessible React forms with validation\n---',
    '.agents/skills/form-helper/SKILL.md': '---\nname: form-helper\ndescription: Create accessible React forms and validation\n---',
  });

  const result = runCli(['check', '--interactions', '--json', '--project', fixture]);

  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.interactions.length, 1);
  assert.deepEqual(report.interactions[0].sharedTerms, ['accessible', 'forms', 'react', 'validation']);
  assert.equal(report.interactions[0].citations.length, 2);
  assert.ok(report.interactions[0].citations.every((citation) => citation.line === 3));

  const text = runCli(['check', '--interactions', '--no-color', '--project', fixture]);
  assert.match(text.stdout, /\[OVERLAP\?\] form-helper ↔ react-forms/);
  assert.equal((text.stdout.match(/Shared terms:/g) || []).length, 1);
  assert.doesNotMatch(text.stdout, /  Skills:/);
  assert.match(text.stdout, /\n    "description: Create accessible React forms and validation"/);
});

test('semantic command classifies candidates only when interactions are requested', () => {
  const fixture = makeFixture({
    '.agents/skills/tab-style/SKILL.md': '---\nname: tab-style\ndescription: Format code with tabs\n---\nAlways format with tabs.',
    '.agents/skills/space-style/SKILL.md': '---\nname: space-style\ndescription: Format code with spaces\n---\nPrefer spaces for formatting.',
  });
  const command = makeCommand([
    'const input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));',
    'const pair = input.candidates[0];',
    'process.stdout.write(JSON.stringify({version: 1, interactions: [{candidateId: pair.id, type: "conflict", explanation: "Formatting rules disagree", citations: [{skillId: pair.skills[0].id, quote: "Prefer spaces for formatting."}, {skillId: pair.skills[1].id, quote: "Always format with tabs."}]}]}));',
  ].join('\n'));

  const result = runCli(['check', '--interactions', '--semantic-command', command, '--project', fixture, '--no-color']);

  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Skill interactions/);
  assert.match(result.stdout, /CONFLICT\?/);
  assert.match(result.stdout, /SKILL\.md:5/);
});

test('semantic command requires explicit interaction mode and failures exit non-zero', () => {
  const missingMode = runCli(['check', '--semantic-command', '/does/not/run']);
  assert.equal(missingMode.status, 2);
  assert.match(missingMode.stderr, /requires --interactions/);

  const fixture = makeFixture({
    '.agents/skills/a/SKILL.md': '---\nname: a\ndescription: Format code using tabs\n---',
    '.agents/skills/b/SKILL.md': '---\nname: b\ndescription: Format code using spaces\n---',
  });
  const failure = runCli(['check', '--interactions', '--semantic-command', '/missing/semantic-command', '--project', fixture]);
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /interaction analysis failed/);
});

test('--root flag adds additional scan path', () => {
  const fixture = makeFixture({
    '.agents/skills/good/SKILL.md': '---\nname: good\ndescription: OK\n---',
  });
  const extraRoot = path.join(tmpBase, 'extra');
  fs.mkdirSync(path.join(extraRoot, 'extra-skill'), { recursive: true });
  fs.writeFileSync(path.join(extraRoot, 'extra-skill', 'SKILL.md'), '---\nname: extra\ndescription: extra desc\n---');

  const result = runCli(['--json', '--project', fixture, '--root', extraRoot]);

  const report = JSON.parse(result.stdout);
  const names = report.skills.map((s) => s.metadata.name);
  assert.ok(names.includes('good'));
  assert.ok(names.includes('extra'));
});

test('--problems-only omits healthy skills', () => {
  const fixture = makeFixture({
    '.agents/skills/good/SKILL.md': '---\nname: good\ndescription: OK\n---',
    '.agents/skills/bad/SKILL.md': '---\n---',
  });

  const result = runCli(['--problems-only', '--project', fixture]);

  assert.doesNotMatch(result.stdout, /good/);
  assert.match(result.stdout, /bad/);
});

test('--warnings-as-errors exits 1 for names drift', () => {
  const fixture = makeFixture({
    '.agents/skills/drift/SKILL.md': '---\nname: other-name\ndescription: some desc\n---',
  });

  const result = runCli(['--warnings-as-errors', '--project', fixture]);

  assert.equal(result.status, 1);
});

test('unknown option prints usage and exits 2', () => {
  const result = runCli(['--bogus-flag']);

  assert.equal(result.status, 2);
});

test('path options require values', () => {
  for (const option of ['--project', '--root']) {
    const result = runCli([option]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, new RegExp(`${option} requires a path`));
  }
});

test('rejects a nonexistent project directory', () => {
  const result = runCli(['--project', path.join(tmpBase, 'missing-project')]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid project directory/i);
});

test('reports a nonexistent explicit scan root as an error', () => {
  const result = runCli(['--no-color', '--root', path.join(tmpBase, 'missing-root')]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Scan root not found/);
});

test.after(() => {
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
});
