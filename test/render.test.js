const test = require('node:test');
const assert = require('node:assert/strict');

const { renderTree, renderFindings, renderJson } = require('../src/render');

const sampleReport = {
  roots: [
    { path: '/home/.agents/skills', exists: true, explicit: false, skills: [], error: null },
    { path: '/missing', exists: false, explicit: false, skills: [], error: null },
  ],
  skills: [
    {
      path: '/home/.agents/skills/demo',
      name: 'demo',
      exists: true,
      metadata: { name: 'demo', description: 'A demo skill' },
      status: 'healthy',
      findings: [],
    },
    {
      path: '/home/.agents/skills/broken',
      name: 'broken',
      exists: true,
      metadata: { name: '', description: '' },
      status: 'error',
      findings: [
        { code: 'MISSING_NAME', severity: 'error', message: 'Name missing', recommendation: 'Add name', path: '/home/.agents/skills/broken/SKILL.md' },
        { code: 'MISSING_DESCRIPTION', severity: 'error', message: 'Desc missing', recommendation: 'Add description', path: '/home/.agents/skills/broken/SKILL.md' },
      ],
    },
  ],
  counts: { roots: 1, skills: 2, healthy: 1, warnings: 0, errors: 1 },
};

test('renderTree groups skills by root', () => {
  const output = renderTree(sampleReport, { color: false });
  assert.match(output, /Skills/);
  assert.match(output, /demo/);
  assert.match(output, /broken/);
  assert.match(output, /Summary: 2 skill/);
  assert.match(output, /1 healthy/);
  assert.match(output, /1 with errors/);
});

test('renderTree includes unavailable roots', () => {
  const output = renderTree(sampleReport, { color: false });
  assert.match(output, /missing/);
  assert.match(output, /unavailable/);
});

test('renderTree uses ASCII status markers', () => {
  const output = renderTree(sampleReport, { color: false });
  assert.match(output, /OK/);
  assert.match(output, /ERR/);
});

test('renderFindings lists recommendations', () => {
  const output = renderFindings(sampleReport, { color: false });
  assert.match(output, /Recommendations/);
  assert.match(output, /Add name/);
  assert.match(output, /Add description/);
});

test('renderFindings shows source line and duplicate locations', () => {
  const skill = sampleReport.skills[1];
  const report = {
    ...sampleReport,
    skills: [{
      ...skill,
      findings: [{
        code: 'DUPLICATE_NAME',
        severity: 'error',
        message: 'Duplicate skill name "broken"',
        recommendation: 'Give each skill a unique name.',
        path: '/skills/broken/SKILL.md',
        line: 2,
        relatedPaths: [
          { path: '/skills/broken/SKILL.md', line: 2 },
          { path: '/other/broken/SKILL.md', line: 4 },
        ],
      }],
    }],
  };

  const output = renderFindings(report, { color: false });
  assert.match(output, /\/skills\/broken\/SKILL\.md:2/);
  assert.match(output, /\/other\/broken\/SKILL\.md:4/);
});

test('renderFindings omits section when no problems', () => {
  const clean = { ...sampleReport, skills: [sampleReport.skills[0]], counts: { roots: 1, skills: 1, healthy: 1, warnings: 0, errors: 0 } };
  const output = renderFindings(clean, { color: false });
  assert.doesNotMatch(output, /Recommendations/);
});

test('renderJson produces valid parseable JSON', () => {
  const output = renderJson(sampleReport);
  const parsed = JSON.parse(output);
  assert.equal(parsed.counts.skills, 2);
  assert.equal(parsed.counts.healthy, 1);
  assert.equal(parsed.counts.errors, 1);
});

test('renderProblemsOnly filters healthy skills', () => {
  const reportWithProblems = {
    ...sampleReport,
    skills: [
      { ...sampleReport.skills[0], status: 'healthy', findings: [] },
      { ...sampleReport.skills[1], status: 'error', findings: [{ code: 'MISSING_NAME', severity: 'error', message: 'x', recommendation: 'y', path: '/p' }] },
    ],
    counts: { roots: 1, skills: 2, healthy: 1, warnings: 0, errors: 1 },
  };
  const output = renderTree(reportWithProblems, { color: false, problemsOnly: true });
  assert.match(output, /broken/);
  assert.doesNotMatch(output, /demo/);
});
