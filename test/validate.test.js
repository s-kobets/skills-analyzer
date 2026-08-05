const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { validateSkill, applyDuplicateFindings, buildReport, getExitCode } = require('../src/validate');

const tmpBase = path.join(os.tmpdir(), 'sa-validate-test-' + Date.now());

function makeTempDir() {
  const dir = path.join(tmpBase, String(Math.random().toString(36).slice(2)));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('healthy skill with valid frontmatter', () => {
  const skillDir = makeTempDir();
  writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: healthy\ndescription: Works fine\n---\nBody');
  const report = validateSkill({ path: skillDir, name: 'healthy' }, {});
  assert.equal(report.status, 'healthy');
  assert.deepEqual(report.findings, []);
  assert.equal(report.metadata.name, 'healthy');
  assert.equal(report.metadata.description, 'Works fine');
});

test('reports missing SKILL.md', () => {
  const skillDir = makeTempDir();
  const report = validateSkill({ path: skillDir, name: 'broken' }, {});
  assert.equal(report.status, 'error');
  assert.equal(report.findings[0].code, 'MISSING_SKILL_FILE');
});

test('reports unreadable SKILL.md', () => {
  const skillDir = makeTempDir();
  writeFile(path.join(skillDir, 'SKILL.md'), 'x');
  fs.chmodSync(path.join(skillDir, 'SKILL.md'), 0o000);
  try {
    const report = validateSkill({ path: skillDir, name: 'unread' }, {});
    assert.equal(report.status, 'error');
    assert.equal(report.findings[0].code, 'UNREADABLE_SKILL_FILE');
  } finally {
    fs.chmodSync(path.join(skillDir, 'SKILL.md'), 0o644);
  }
});

test('reports missing name in metadata', () => {
  const skillDir = makeTempDir();
  writeFile(path.join(skillDir, 'SKILL.md'), '---\ndescription: no name\n---');
  const report = validateSkill({ path: skillDir, name: 'noname' }, {});
  assert.equal(report.status, 'error');
  assert.equal(report.findings[0].code, 'MISSING_NAME');
});

test('reports missing description with concrete recommendation', () => {
  const skillDir = makeTempDir();
  writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: nodesc\n---');
  const report = validateSkill({ path: skillDir, name: 'nodesc' }, {});
  assert.equal(report.status, 'error');
  assert.equal(report.findings[0].code, 'MISSING_DESCRIPTION');
  assert.match(report.findings[0].recommendation, /description/i);
});

test('reports directory name drift as warning', () => {
  const skillDir = makeTempDir();
  writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: mismatched\ndescription: different name\n---');
  const report = validateSkill({ path: skillDir, name: 'other-name' }, {});
  assert.equal(report.status, 'warning');
  assert.equal(report.findings[0].code, 'NAME_DRIFT');
});

test('reports missing local reference', () => {
  const skillDir = makeTempDir();
  writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: ref-test\ndescription: has ref\n---\nSee [docs](./missing.md)');
  const report = validateSkill({ path: skillDir, name: 'ref-test' }, {});
  assert.equal(report.status, 'warning');
  assert.equal(report.findings[0].code, 'MISSING_REFERENCE');
});

test('ignores URLs and absolute paths in references', () => {
  const skillDir = makeTempDir();
  writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: ref-test\ndescription: has refs\n---\nSee https://example.com or /absolute/path');
  const report = validateSkill({ path: skillDir, name: 'ref-test' }, {});
  assert.equal(report.status, 'healthy');
});

test('applyDuplicateFindings adds warnings for duplicate names', () => {
  const skillDir1 = makeTempDir();
  writeFile(path.join(skillDir1, 'SKILL.md'), '---\nname: dup\ndescription: first\n---');
  const skillDir2 = makeTempDir();
  writeFile(path.join(skillDir2, 'SKILL.md'), '---\nname: dup\ndescription: second\n---');

  const report1 = validateSkill({ path: skillDir1, name: 'a' }, {});
  const report2 = validateSkill({ path: skillDir2, name: 'b' }, {});

  const results = applyDuplicateFindings([report1, report2]);
  assert.equal(results[0].status, 'error');
  assert.ok(results[0].findings.some((f) => f.code === 'DUPLICATE_NAME'));
  assert.equal(results[1].status, 'error');
  assert.ok(results[1].findings.some((f) => f.code === 'DUPLICATE_NAME'));
});

test('duplicate check ignores empty names', () => {
  const skillDir1 = makeTempDir();
  writeFile(path.join(skillDir1, 'SKILL.md'), '---\ndescription: no name\n---');
  const skillDir2 = makeTempDir();
  writeFile(path.join(skillDir2, 'SKILL.md'), '---\ndescription: no name either\n---');

  const report1 = validateSkill({ path: skillDir1, name: 'a' }, {});
  const report2 = validateSkill({ path: skillDir2, name: 'b' }, {});

  const results = applyDuplicateFindings([report1, report2]);
  assert.equal(results[0].findings.length, 1);
  assert.equal(results[0].findings[0].code, 'MISSING_NAME');
  assert.equal(results[1].findings.length, 1);
  assert.equal(results[1].findings[0].code, 'MISSING_NAME');
});

test('buildReport aggregates counts', () => {
  const rootReports = [{ path: '/r', exists: true, explicit: false, skills: [], error: null }];
  const skillReports = [
    { path: '/r/a', name: 'a', exists: true, metadata: { name: 'a', description: 'd' }, status: 'healthy', findings: [] },
    { path: '/r/b', name: 'b', exists: true, metadata: { name: '', description: '' }, status: 'error', findings: [{ code: 'MISSING_NAME', severity: 'error', message: 'x', recommendation: 'y', path: '/r/b/SKILL.md' }] },
  ];

  const report = buildReport(rootReports, skillReports);
  assert.equal(report.counts.roots, 1);
  assert.equal(report.counts.skills, 2);
  assert.equal(report.counts.healthy, 1);
  assert.equal(report.counts.warnings, 0);
  assert.equal(report.counts.errors, 1);
});

test('getExitCode returns 0 for clean', () => {
  const report = { counts: { errors: 0, warnings: 0 } };
  assert.equal(getExitCode(report, { warningsAsErrors: false }), 0);
});

test('getExitCode returns 1 for errors', () => {
  const report = { counts: { errors: 1, warnings: 0 } };
  assert.equal(getExitCode(report, { warningsAsErrors: false }), 1);
});

test('getExitCode returns 1 for warnings when warningsAsErrors', () => {
  const report = { counts: { errors: 0, warnings: 2 } };
  assert.equal(getExitCode(report, { warningsAsErrors: true }), 1);
});

test('getExitCode returns 0 for warnings when not warningsAsErrors', () => {
  const report = { counts: { errors: 0, warnings: 2 } };
  assert.equal(getExitCode(report, { warningsAsErrors: false }), 0);
});

test.after(() => {
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
});
