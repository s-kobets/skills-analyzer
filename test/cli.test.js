const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const tmpBase = path.join(os.tmpdir(), 'sa-cli-test-' + Date.now());
const fakeHome = path.join(tmpBase, 'fake-home');
fs.mkdirSync(fakeHome, { recursive: true });

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

test('default scan renders tree', () => {
  const fixture = makeFixture({
    '.agents/skills/alpha/SKILL.md': '---\nname: alpha\ndescription: first skill\n---',
    '.agents/skills/beta/SKILL.md': '---\nname: beta\ndescription: second skill\n---',
  });

  const result = spawnSync(process.execPath, [
    path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js')),
    '--project', fixture,
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome } });

  assert.match(result.stdout, /Skills/);
  assert.match(result.stdout, /alpha/);
  assert.equal(result.status, 0);
});

test('report --json emits parseable JSON and exits on errors', () => {
  const fixture = makeFixture({
    '.agents/skills/broken/SKILL.md': '---\n---',
  });

  const result = spawnSync(process.execPath, [
    path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js')),
    'report', '--json', '--project', fixture,
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome } });

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.counts.errors, 1);
  assert.ok(report.counts.skills >= 1);
});

test('check command reports findings', () => {
  const fixture = makeFixture({
    '.agents/skills/good/SKILL.md': '---\nname: good\ndescription: OK\n---',
    '.agents/skills/bad/SKILL.md': '---\n---',
  });

  const result = spawnSync(process.execPath, [
    path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js')),
    'check', '--project', fixture,
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome } });

  assert.match(result.stdout, /Recommendations/);
  assert.equal(result.status, 1);
});

test('--root flag adds additional scan path', () => {
  const fixture = makeFixture({
    '.agents/skills/good/SKILL.md': '---\nname: good\ndescription: OK\n---',
  });
  const extraRoot = path.join(tmpBase, 'extra');
  fs.mkdirSync(path.join(extraRoot, 'extra-skill'), { recursive: true });
  fs.writeFileSync(path.join(extraRoot, 'extra-skill', 'SKILL.md'), '---\nname: extra\ndescription: extra desc\n---');

  const result = spawnSync(process.execPath, [
    path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js')),
    '--json', '--project', fixture, '--root', extraRoot,
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome } });

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

  const result = spawnSync(process.execPath, [
    path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js')),
    '--problems-only', '--project', fixture,
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome } });

  assert.doesNotMatch(result.stdout, /good/);
  assert.match(result.stdout, /bad/);
});

test('--warnings-as-errors exits 1 for names drift', () => {
  const fixture = makeFixture({
    '.agents/skills/drift/SKILL.md': '---\nname: other-name\ndescription: some desc\n---',
  });

  const result = spawnSync(process.execPath, [
    path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js')),
    '--warnings-as-errors', '--project', fixture,
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome } });

  assert.equal(result.status, 1);
});

test('unknown option prints usage and exits 2', () => {
  const result = spawnSync(process.execPath, [
    path.resolve(path.join(__dirname, '..', 'bin', 'skills-analyzer.js')),
    '--bogus-flag',
  ], { encoding: 'utf8', env: { ...process.env, HOME: fakeHome } });

  assert.equal(result.status, 2);
});

test.after(() => {
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
});
