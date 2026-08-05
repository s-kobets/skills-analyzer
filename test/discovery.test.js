const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { getDefaultRoots, normalizeRoots, discoverRoot, discoverSkills } = require('../src/discovery');

const tmpBase = path.join(os.tmpdir(), 'sa-discovery-test-' + Date.now());

function makeTempDir() {
  const dir = path.join(tmpBase, String(Math.random().toString(36).slice(2)));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('getDefaultRoots includes global and project-local roots', () => {
  const roots = getDefaultRoots({ homeDir: '/home/test', projectDir: '/project/test' });
  assert.ok(roots.length >= 9);
  assert.ok(roots.includes(path.join('/home/test', '.agents', 'skills')));
  assert.ok(roots.includes(path.join('/home/test', '.config', 'opencode', 'skills')));
  assert.ok(roots.includes(path.join('/home/test', '.config', 'opencode', 'superpowers', 'skills')));
  assert.ok(roots.includes(path.join('/home/test', '.claude', 'skills')));
  assert.ok(roots.includes(path.join('/home/test', '.opencode', 'skills')));
  assert.ok(roots.includes(path.join('/project/test', '.agents', 'skills')));
  assert.ok(roots.includes(path.join('/project/test', '.opencode', 'skills')));
  assert.ok(roots.includes(path.join('/project/test', '.claude', 'skills')));
  assert.ok(roots.includes(path.join('/project/test', '.config', 'opencode', 'skills')));
});

test('normalizeRoots deduplicates absolute paths', () => {
  const roots = normalizeRoots(['/a/b', '/a/b', '/c/d']);
  assert.deepEqual(roots, ['/a/b', '/c/d']);
});

test('normalizeRoots resolves relative paths', () => {
  const cwd = '/current';
  const roots = normalizeRoots(['/a', 'b'], cwd);
  assert.deepEqual(roots, ['/a', path.join(cwd, 'b')]);
});

test('discoverRoot finds immediate child directories containing SKILL.md', () => {
  const root = makeTempDir();
  mkdir(path.join(root, 'one'));
  writeFile(path.join(root, 'one', 'SKILL.md'), '# One');
  mkdir(path.join(root, 'not-a-skill'));
  writeFile(path.join(root, 'not-a-skill', 'NOT_SKILL.md'), 'nope');
  mkdir(path.join(root, 'nested', 'two'));
  writeFile(path.join(root, 'nested', 'two', 'SKILL.md'), '# Two');

  const result = discoverRoot(root, { explicit: true });
  assert.equal(result.path, root);
  assert.equal(result.exists, true);
  assert.deepEqual(result.skills.map((s) => s.path), [path.join(root, 'one')]);
  assert.equal(result.error, null);
});

test('missing default root returns exists: false without error', () => {
  const result = discoverRoot('/nonexistent/path', { explicit: false });
  assert.equal(result.exists, false);
  assert.equal(result.error, null);
  assert.deepEqual(result.skills, []);
});

test('unreadable root records an error', () => {
  const root = makeTempDir();
  mkdir(path.join(root, 'skill'));
  writeFile(path.join(root, 'skill', 'SKILL.md'), '# x');
  fs.chmodSync(root, 0o000);

  try {
    const result = discoverRoot(root, { explicit: true });
    assert.ok(result.error !== null);
  } finally {
    fs.chmodSync(root, 0o755);
  }
});

test('discoverSkills combines multiple roots', () => {
  const root1 = makeTempDir();
  mkdir(path.join(root1, 'alpha'));
  writeFile(path.join(root1, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: first\n---\n');

  const root2 = makeTempDir();
  mkdir(path.join(root2, 'beta'));
  writeFile(path.join(root2, 'beta', 'SKILL.md'), '---\nname: beta\ndescription: second\n---\n');

  const missing = '/no/such/path';

  const results = discoverSkills([root1, root2, missing], {});
  assert.equal(results.length, 3);
  assert.equal(results[0].skills.length, 1);
  assert.equal(results[1].skills.length, 1);
  assert.equal(results[2].exists, false);
});

test.after(() => {
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
});
