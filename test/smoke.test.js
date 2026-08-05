const test = require('node:test');
const assert = require('node:assert/strict');

test('CLI entrypoint is configured', () => {
  const packageJson = require('../package.json');
  assert.equal(packageJson.bin['skills-analyzer'], 'dist/skills-analyzer.js');
  assert.equal(packageJson.bin['sa'], 'dist/skills-analyzer.js');
});
