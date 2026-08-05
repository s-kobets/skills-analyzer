function renderTree(report, options = {}) {
  const lines = [];
  const color = options.color !== false;

  lines.push('');
  lines.push('Skills');
  lines.push('');

  for (const root of report.roots) {
    const marker = root.exists ? '' : ' ' + (color ? '\x1b[90m(unavailable)\x1b[0m' : '(unavailable)');
    lines.push((color ? '\x1b[1m' : '') + root.path + (color ? '\x1b[0m' : '') + marker);

    const rootSkills = report.skills.filter((s) => s.path.startsWith(root.path));
    for (let i = 0; i < rootSkills.length; i++) {
      const s = rootSkills[i];
      if (options.problemsOnly && s.status === 'healthy') continue;

      const connector = i === rootSkills.length - 1 ? '  ' : '  ';
      const icon = s.status === 'healthy'
        ? (color ? '\x1b[32m[OK]\x1b[0m' : '[OK]')
        : s.status === 'warning'
          ? (color ? '\x1b[33m[WARN]\x1b[0m' : '[WARN]')
          : (color ? '\x1b[31m[ERR]\x1b[0m' : '[ERR]');

      const problemCount = s.findings.length;
      const extra = problemCount > 0 ? ' ' + problemCount + ' problem' + (problemCount !== 1 ? 's' : '') : '';

      lines.push('  ' + connector + s.name + ' '.repeat(Math.max(1, 4)) + icon + extra);
    }

    if (rootSkills.length === 0 || (options.problemsOnly && rootSkills.every((s) => s.status === 'healthy'))) {
      lines.push('  ' + (color ? '\x1b[90m(no skills found)\x1b[0m' : '(no skills found)'));
    }

    lines.push('');
  }

  lines.push('Summary: ' + report.counts.skills + ' skill' + (report.counts.skills !== 1 ? 's' : '')
    + ', ' + report.counts.healthy + ' healthy'
    + (report.counts.warnings > 0 ? ', ' + report.counts.warnings + ' with warnings' : '')
    + (report.counts.errors > 0 ? ', ' + report.counts.errors + ' with errors' : ''));

  return lines.join('\n');
}

function renderFindings(report, options = {}) {
  const color = options.color !== false;
  const allSkills = report.skills.filter((s) => s.findings.length > 0);
  if (allSkills.length === 0) return '';

  const lines = [];
  lines.push('');
  lines.push('Recommendations');
  lines.push('');

  for (const skill of allSkills) {
    lines.push((color ? '\x1b[1m' : '') + skill.name + (color ? '\x1b[0m' : ''));
    for (const finding of skill.findings) {
      const icon = finding.severity === 'error'
        ? (color ? '\x1b[31m[ERR]\x1b[0m' : '[ERR]')
        : (color ? '\x1b[33m[WARN]\x1b[0m' : '[WARN]');
      lines.push('  ' + icon + ' ' + finding.message);
      lines.push('    Fix: ' + finding.recommendation);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderJson(report) {
  return JSON.stringify(report, null, 2);
}

module.exports = { renderTree, renderFindings, renderJson };
