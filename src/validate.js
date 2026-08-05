const path = require('node:path');
const fs = require('node:fs');

const { parseFrontmatter, readSkillFile } = require('./frontmatter');

function validateSkill(skill, options) {
  const report = {
    path: skill.path,
    name: skill.name,
    exists: true,
    metadata: { name: '', description: '' },
    status: 'healthy',
    findings: [],
  };

  const { content, readError } = readSkillFile(skill.path);

  if (readError) {
    const code = readError.code === 'ENOENT' ? 'MISSING_SKILL_FILE' : 'UNREADABLE_SKILL_FILE';
    report.status = 'error';
    report.findings.push({
      code,
      severity: 'error',
      message: readError.message,
      recommendation: 'Ensure SKILL.md exists and is readable.',
      path: path.join(skill.path, 'SKILL.md'),
    });
    return report;
  }

  const { metadata, errors } = parseFrontmatter(content);
  report.metadata = metadata;

  for (const err of errors) {
    const severity = (err.code === 'MISSING_NAME' || err.code === 'MISSING_DESCRIPTION') ? 'error' : 'warning';
    report.findings.push({
      code: err.code,
      severity,
      message: err.message,
      recommendation: err.recommendation,
      path: path.join(skill.path, 'SKILL.md'),
    });
  }

  checkReferences(skill.path, content, report);
  checkNameDrift(skill, metadata, report);
  computeStatus(report);

  return report;
}

function checkReferences(skillDir, content, report) {
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  const backtickPattern = /`(\.\/[^`]+)`/g;

  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    checkPath(skillDir, match[2], report);
  }
  while ((match = backtickPattern.exec(content)) !== null) {
    checkPath(skillDir, match[1], report);
  }
}

function checkPath(skillDir, target, report) {
  const trimmed = target.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) return;
  if (trimmed.startsWith('#')) return;
  if (trimmed.startsWith('mailto:')) return;

  try {
    const resolved = path.resolve(skillDir, trimmed);
    if (!fs.existsSync(resolved)) {
      report.findings.push({
        code: 'MISSING_REFERENCE',
        severity: 'warning',
        message: 'Referenced file not found: ' + trimmed,
        recommendation: 'Verify the path or create the missing file.',
        path: resolved,
      });
    }
  } catch {}
}

function checkNameDrift(skill, metadata, report) {
  if (metadata.name && metadata.name !== skill.name) {
    report.findings.push({
      code: 'NAME_DRIFT',
      severity: 'warning',
      message: 'Directory name "' + skill.name + '" differs from metadata name "' + metadata.name + '"',
      recommendation: 'Rename the directory or update the name in SKILL.md frontmatter.',
      path: path.join(skill.path, 'SKILL.md'),
    });
  }
}

function computeStatus(report) {
  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');
  if (errors.length > 0) report.status = 'error';
  else if (warnings.length > 0) report.status = 'warning';
}

function applyDuplicateFindings(skillReports) {
  const nameCount = new Map();
  const nameReports = new Map();

  for (const report of skillReports) {
    if (report.metadata.name) {
      nameCount.set(report.metadata.name, (nameCount.get(report.metadata.name) || 0) + 1);
      if (!nameReports.has(report.metadata.name)) nameReports.set(report.metadata.name, []);
      nameReports.get(report.metadata.name).push(report);
    }
  }

  for (const [name, count] of nameCount) {
    if (count > 1) {
      for (const report of nameReports.get(name)) {
        report.findings.push({
          code: 'DUPLICATE_NAME',
          severity: 'error',
          message: 'Duplicate skill name "' + name + '" found in ' + count + ' locations',
          recommendation: 'Give each skill a unique name in its SKILL.md frontmatter.',
          path: path.join(report.path, 'SKILL.md'),
        });
        computeStatus(report);
      }
    }
  }

  return skillReports;
}

function buildReport(rootReports, skillReports) {
  const counts = { roots: 0, skills: 0, healthy: 0, warnings: 0, errors: 0 };

  for (const r of rootReports) {
    if (r.exists) counts.roots++;
  }
  for (const s of skillReports) {
    counts.skills++;
    if (s.status === 'healthy') counts.healthy++;
    else if (s.status === 'error') counts.errors++;
    else if (s.status === 'warning') counts.warnings++;
  }

  return { roots: rootReports, skills: skillReports, counts };
}

function getExitCode(report, options) {
  if (report.counts.errors > 0) return 1;
  if (options.warningsAsErrors && report.counts.warnings > 0) return 1;
  return 0;
}

module.exports = { validateSkill, applyDuplicateFindings, buildReport, getExitCode };
