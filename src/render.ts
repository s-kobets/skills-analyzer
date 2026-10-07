import path from 'node:path';

import type { Report } from './validate.js';

export interface RenderOptions {
  color?: boolean;
  problemsOnly?: boolean;
}

export function renderTree(report: Report, options: RenderOptions = {}): string {
  const lines: string[] = [];
  const color = options.color !== false;

  lines.push('');
  lines.push('Skills');
  lines.push('');

  for (const root of report.roots) {
    const marker = root.exists ? '' : ' ' + (color ? '\x1b[90m(unavailable)\x1b[0m' : '(unavailable)');
    lines.push((color ? '\x1b[1m' : '') + root.path + (color ? '\x1b[0m' : '') + marker);
    if (root.error) lines.push('  ' + (color ? '\x1b[31m[ERR]\x1b[0m ' : '[ERR] ') + root.error);

    const rootSkills = report.skills.filter((skill) => path.dirname(skill.path) === root.path);
    for (const skill of rootSkills) {
      if (options.problemsOnly && skill.status === 'healthy') continue;
      const icon = skill.status === 'healthy'
        ? (color ? '\x1b[32m[OK]\x1b[0m' : '[OK]')
        : skill.status === 'warning'
          ? (color ? '\x1b[33m[WARN]\x1b[0m' : '[WARN]')
          : (color ? '\x1b[31m[ERR]\x1b[0m' : '[ERR]');
      const problemCount = skill.findings.length;
      const extra = problemCount > 0 ? ' ' + problemCount + ' problem' + (problemCount !== 1 ? 's' : '') : '';
      lines.push('    ' + skill.name + ' '.repeat(4) + icon + extra);
    }

    if (rootSkills.length === 0 || (options.problemsOnly && rootSkills.every((skill) => skill.status === 'healthy'))) {
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

export function renderFindings(report: Report, options: RenderOptions = {}): string {
  const color = options.color !== false;
  const allSkills = report.skills.filter((skill) => skill.findings.length > 0);
  if (allSkills.length === 0) return '';

  const lines: string[] = ['', 'Recommendations', ''];
  for (const skill of allSkills) {
    lines.push((color ? '\x1b[1m' : '') + skill.name + (color ? '\x1b[0m' : ''));
    for (const finding of skill.findings) {
      const icon = finding.severity === 'error'
        ? (color ? '\x1b[31m[ERR]\x1b[0m' : '[ERR]')
        : (color ? '\x1b[33m[WARN]\x1b[0m' : '[WARN]');
      lines.push('  ' + icon + ' ' + finding.message);
      const sourcePath = finding.sourcePath || finding.path;
      if (sourcePath) lines.push('    At: ' + sourcePath + (finding.line ? ':' + finding.line : ''));
      const peers = (finding.relatedPaths || []).filter((location) =>
        location.path !== sourcePath || location.line !== finding.line);
      if (peers.length > 0) {
        lines.push('    Also in: ' + peers.map((location) =>
          location.path + (location.line ? ':' + location.line : '')).join(', '));
      }
      lines.push('    Fix: ' + finding.recommendation);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
