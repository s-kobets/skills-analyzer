const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('CLI entrypoint is configured', () => {
  const packageJson = require('../package.json');
  assert.equal(packageJson.bin['skills-analyzer'], 'bin/skills-analyzer.js');
  assert.equal(fs.existsSync('bin/skills-analyzer.js'), true);
});
