const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function getDefaultRoots({ homeDir, projectDir } = {}) {
  const home = homeDir || os.homedir();
  const project = projectDir || process.cwd();
  const globalRoots = [
    path.join(home, '.agents', 'skills'),
    path.join(home, '.config', 'opencode', 'skills'),
    path.join(home, '.config', 'opencode', 'superpowers', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.opencode', 'skills'),
  ];
  const projectRoots = [
    path.join(project, '.agents', 'skills'),
    path.join(project, '.opencode', 'skills'),
    path.join(project, '.claude', 'skills'),
    path.join(project, '.config', 'opencode', 'skills'),
  ];
  return [...globalRoots, ...projectRoots];
}

function normalizeRoots(roots, cwd) {
  const seen = new Set();
  const result = [];
  for (const r of roots) {
    const abs = path.resolve(cwd || process.cwd(), r);
    if (!seen.has(abs)) {
      seen.add(abs);
      result.push(abs);
    }
  }
  return result;
}

function discoverRoot(rootPath, { explicit } = {}) {
  const result = {
    path: rootPath,
    exists: false,
    explicit: !!explicit,
    skills: [],
    error: null,
  };

  try {
    if (!fs.existsSync(rootPath)) return result;
    const stat = fs.statSync(rootPath);
    if (!stat.isDirectory()) return result;
    result.exists = true;

    const entries = fs.readdirSync(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(rootPath, entry.name);
      const skillFile = path.join(skillPath, 'SKILL.md');
      try {
        if (fs.existsSync(skillFile) && fs.statSync(skillFile).isFile()) {
          result.skills.push({ path: skillPath, name: entry.name });
        }
      } catch {}
    }
  } catch (err) {
    result.error = err.message;
    result.exists = true;
  }

  return result;
}

function discoverSkills(roots, options) {
  return roots.map((r) => discoverRoot(r, options));
}

module.exports = { getDefaultRoots, normalizeRoots, discoverRoot, discoverSkills };
