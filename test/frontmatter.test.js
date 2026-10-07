const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseFrontmatter, readSkillFile } = require('../src/frontmatter');

test('parses name and description from frontmatter', () => {
  const result = parseFrontmatter('---\nname: demo\ndescription: Demo skill\n---\nBody');
  assert.deepEqual(result.metadata, { name: 'demo', description: 'Demo skill' });
  assert.deepEqual(result.metadataLines, { name: 2, description: 3 });
  assert.deepEqual(result.errors, []);
});

test('parses CRLF and YAML folded/quoted description values', () => {
  const result = parseFrontmatter('---\r\nname: "demo"\r\ndescription: >-\r\n  Scope: first line\r\n  second line\r\nquote: "a value"\r\n---\r\nBody');
  assert.deepEqual(result.metadata, { name: 'demo', description: 'Scope: first line second line' });
  assert.deepEqual(result.metadataLines, { name: 2, description: 3 });
  assert.deepEqual(result.errors, []);
});

test('reports YAML syntax and duplicate key errors with source lines', () => {
  const syntax = parseFrontmatter('---\nname: [invalid\ndescription: desc\n---');
  assert.ok(syntax.errors.some((error) => error.code === 'MALFORMED_FRONTMATTER'));

  const unresolvedAlias = parseFrontmatter('---\nname: *missing\ndescription: desc\n---');
  assert.ok(unresolvedAlias.errors.some((error) => error.code === 'MALFORMED_FRONTMATTER'));

  const duplicate = parseFrontmatter('---\nname: first\nname: second\ndescription: desc\n---');
  assert.ok(duplicate.errors.some((error) => error.code === 'DUPLICATE_KEY' && error.line === 3));
});

test('reports error for missing name', () => {
  const result = parseFrontmatter('---\ndescription: only desc\n---');
  assert.ok(result.errors.length > 0);
  assert.equal(result.metadata.name, '');
});

test('reports error for missing description', () => {
  const result = parseFrontmatter('---\nname: demo\n---');
  assert.ok(result.errors.length > 0);
  assert.equal(result.metadata.description, '');
});

test('reports error for empty name value', () => {
  const result = parseFrontmatter('---\nname:\ndescription: desc\n---');
  assert.ok(result.errors.length > 0);
});

test('reports error for empty description value', () => {
  const result = parseFrontmatter('---\nname: demo\ndescription:\n---');
  assert.ok(result.errors.length > 0);
});

test('handles missing frontmatter delimiters', () => {
  const result = parseFrontmatter('# Just markdown');
  assert.equal(result.metadata.name, '');
  assert.equal(result.metadata.description, '');
  assert.deepEqual(result.errors.map((error) => error.code), ['MISSING_NAME', 'MISSING_DESCRIPTION']);
});

test('reports missing metadata for an unterminated frontmatter block', () => {
  const result = parseFrontmatter('---\nname: demo\ndescription: Demo skill');
  assert.ok(result.errors.some((error) => error.code === 'MALFORMED_FRONTMATTER'));
  assert.equal(result.metadata.name, 'demo');
  assert.equal(result.metadata.description, 'Demo skill');
});

test('handles malformed frontmatter', () => {
  const result = parseFrontmatter('---\nbad line without colon\nname: ok\ndescription: desc\n---');
  assert.ok(result.errors.some((error) => error.code === 'MALFORMED_FRONTMATTER'));
  assert.equal(result.metadata.name, '');
  assert.equal(result.errors[0].line, 2);
});

test('ignores unknown frontmatter keys', () => {
  const result = parseFrontmatter('---\nname: demo\ndescription: desc\nversion: 1\n---');
  assert.deepEqual(result.metadata, { name: 'demo', description: 'desc' });
  assert.deepEqual(result.errors, []);
});

test('handles empty content', () => {
  const result = parseFrontmatter('');
  assert.equal(result.metadata.name, '');
  assert.equal(result.metadata.description, '');
});

test('handles content with only delimiters', () => {
  const result = parseFrontmatter('---\n---');
  assert.equal(result.metadata.name, '');
  assert.equal(result.metadata.description, '');
});

test('readSkillFile returns content for existing file', () => {
  const dir = path.join(os.tmpdir(), 'sa-fm-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: test\n---');
  try {
    const result = readSkillFile(dir);
    assert.equal(result.readError, null);
    assert.match(result.content, /---\nname: test\n---/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readSkillFile returns error for missing file', () => {
  const dir = path.join(os.tmpdir(), 'sa-fm-missing-' + Date.now());
  const result = readSkillFile(dir);
  assert.equal(result.content, null);
  assert.ok(result.readError !== null);
});
