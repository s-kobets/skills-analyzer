import path from 'node:path';
import fs from 'node:fs';
import MarkdownIt from 'markdown-it';

import type { SkillEntry, RootReport } from './discovery.js';
import { parseFrontmatter, readSkillFile } from './frontmatter.js';

const markdown = new MarkdownIt();

export interface SkillFinding {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  recommendation: string;
  path: string;
  sourcePath?: string;
  line?: number;
  relatedPaths?: Array<{ path: string; line?: number | null }>;
}

export interface SkillReport {
  path: string;
  name: string;
  exists: boolean;
  metadata: { name: string; description: string };
  metadataLines: { name: number | null; description: number | null };
  status: 'healthy' | 'warning' | 'error';
  findings: SkillFinding[];
}

export interface Counts {
  roots: number;
  skills: number;
  healthy: number;
  warnings: number;
  errors: number;
}

export interface Report {
  roots: RootReport[];
  skills: SkillReport[];
  counts: Counts;
}

export function validateSkill(skill: SkillEntry): SkillReport {
  const report: SkillReport = {
    path: skill.path,
    name: skill.name,
    exists: true,
    metadata: { name: '', description: '' },
    metadataLines: { name: null, description: null },
    status: 'healthy',
    findings: [],
  };

  const { content, readError } = readSkillFile(skill.path);
  if (readError) {
    report.status = 'error';
    report.findings.push({
      code: readError.code === 'ENOENT' ? 'MISSING_SKILL_FILE' : 'UNREADABLE_SKILL_FILE',
      severity: 'error',
      message: readError.message,
      recommendation: 'Ensure SKILL.md exists and is readable.',
      path: path.join(skill.path, 'SKILL.md'),
    });
    return report;
  }

  const { metadata, metadataLines, errors } = parseFrontmatter(content);
  report.metadata = metadata;
  report.metadataLines = metadataLines;

  for (const error of errors) {
    const severity = error.code === 'MISSING_NAME' || error.code === 'MISSING_DESCRIPTION' ? 'error' : 'warning';
    report.findings.push({
      code: error.code,
      severity,
      message: error.message,
      recommendation: error.recommendation,
      path: path.join(skill.path, 'SKILL.md'),
      line: error.line,
    });
  }

  checkReferences(skill.path, content ?? '', report);
  checkNameDrift(skill, metadata, metadataLines, report);
  computeStatus(report);
  return report;
}

function checkReferences(skillDir: string, content: string, report: SkillReport): void {
  const sourceLines = content.split(/\r\n?|\n/);

  for (const token of markdown.parse(markdownBody(content), {})) {
    if (token.type !== 'inline' || !token.children) continue;
    let searchLine = token.map?.[0] || 0;
    const endLine = token.map?.[1] || sourceLines.length;
    for (const child of token.children) {
      const attribute = child.type === 'link_open' ? child.attrGet('href')
        : child.type === 'image' ? child.attrGet('src') : null;
      const target = typeof attribute === 'string' ? attribute : null;
      if (!target) continue;
      const decodedTarget = decodeTarget(target);
      const foundLine = sourceLines.findIndex((line, index) =>
        index >= searchLine && index < endLine && (line.includes(target) || line.includes(decodedTarget)));
      const line = foundLine === -1 ? searchLine + 1 : foundLine + 1;
      checkPath(skillDir, target, report, line);
      if (foundLine !== -1) searchLine = foundLine;
    }
  }
}

function markdownBody(content: string): string {
  const lines = content.split(/\r\n?|\n/);
  if (lines[0] !== '---') return content;
  const closingLine = lines.findIndex((line, index) => index > 0 && line === '---');
  return lines.map((line, index) => closingLine === -1 || index <= closingLine ? '' : line).join('\n');
}

function checkPath(skillDir: string, target: string, report: SkillReport, line: number): void {
  const reference = target.trim();
  if (path.isAbsolute(reference) || /^[a-z]:[\\/]/i.test(reference) || /^[a-z][a-z\d+.-]*:/i.test(reference)) return;
  if (reference.startsWith('#')) return;
  if (reference.includes('*') || /[{}\[\]]/.test(reference) || /[\\/]$/.test(reference)) return;
  const trimmed = decodeTarget(reference).split(/[?#]/, 1)[0];
  if (!trimmed) return;

  const resolved = path.resolve(skillDir, trimmed);
  if (!fs.existsSync(resolved)) {
    report.findings.push({
      code: 'MISSING_REFERENCE',
      severity: 'warning',
      message: 'Referenced file not found: ' + trimmed,
      recommendation: 'Verify the path or create the missing file.',
      path: resolved,
      sourcePath: path.join(skillDir, 'SKILL.md'),
      line,
    });
  }
}

function decodeTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function checkNameDrift(
  skill: SkillEntry,
  metadata: { name: string; description: string },
  metadataLines: { name: number | null; description: number | null },
  report: SkillReport,
): void {
  if (metadata.name && metadata.name !== skill.name) {
    report.findings.push({
      code: 'NAME_DRIFT',
      severity: 'warning',
      message: `Directory name "${skill.name}" differs from metadata name "${metadata.name}"`,
      recommendation: 'Rename the directory or update the name in SKILL.md frontmatter.',
      path: path.join(skill.path, 'SKILL.md'),
      line: metadataLines.name ?? undefined,
    });
  }
}

function computeStatus(report: SkillReport): void {
  const errors = report.findings.filter((finding) => finding.severity === 'error');
  const warnings = report.findings.filter((finding) => finding.severity === 'warning');
  if (errors.length > 0) report.status = 'error';
  else if (warnings.length > 0) report.status = 'warning';
}

export function applyDuplicateFindings(skillReports: SkillReport[]): SkillReport[] {
  const nameReports = new Map<string, SkillReport[]>();
  for (const report of skillReports) {
    if (!report.metadata.name) continue;
    const reports = nameReports.get(report.metadata.name) || [];
    reports.push(report);
    nameReports.set(report.metadata.name, reports);
  }

  for (const [name, duplicates] of nameReports) {
    if (duplicates.length < 2) continue;
    const relatedPaths = duplicates.map((duplicate) => ({
      path: path.join(duplicate.path, 'SKILL.md'),
      line: duplicate.metadataLines.name,
    }));
    for (const report of duplicates) {
      report.findings.push({
        code: 'DUPLICATE_NAME',
        severity: 'error',
        message: `Duplicate skill name "${name}" found in ${duplicates.length} locations`,
        recommendation: 'Give each skill a unique name in its SKILL.md frontmatter.',
        path: path.join(report.path, 'SKILL.md'),
        line: report.metadataLines.name ?? undefined,
        relatedPaths,
      });
      computeStatus(report);
    }
  }
  return skillReports;
}

export function buildReport(rootReports: RootReport[], skillReports: SkillReport[]): Report {
  const counts: Counts = { roots: 0, skills: 0, healthy: 0, warnings: 0, errors: 0 };
  for (const root of rootReports) {
    if (root.exists) counts.roots++;
  }
  for (const skill of skillReports) {
    counts.skills++;
    if (skill.status === 'healthy') counts.healthy++;
    else if (skill.status === 'error') counts.errors++;
    else if (skill.status === 'warning') counts.warnings++;
  }
  return { roots: rootReports, skills: skillReports, counts };
}

export function getExitCode(report: Report, options: { warningsAsErrors?: boolean }): number {
  if (report.counts.errors > 0 || (report.roots ?? []).some((root) => root.error)) return 1;
  if (options.warningsAsErrors && report.counts.warnings > 0) return 1;
  return 0;
}
