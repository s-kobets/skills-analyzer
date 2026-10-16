import fs from 'node:fs';

import { getDefaultRoots, normalizeRoots, discoverSkills } from './discovery.js';
import { validateSkill, applyDuplicateFindings, buildReport, getExitCode } from './validate.js';
import { analyzeInteractions } from './interactions.js';
import { renderTree, renderFindings, renderInteractions, renderJson } from './render.js';
import type { SkillReport } from './validate.js';
import type { RootReport } from './discovery.js';

export interface CliOptions {
  command: string;
  project: string;
  projectSpecified: boolean;
  roots: string[];
  color: boolean;
  json: boolean;
  problemsOnly: boolean;
  warningsAsErrors: boolean;
  interactions: boolean;
  semanticCommand?: string;
  help?: boolean;
  error?: string;
}

export interface CliIO {
  out: { write: (message: string) => void };
  err: { write: (message: string) => void };
}

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
    command: 'scan',
    project: process.cwd(),
    projectSpecified: false,
    roots: [],
    color: true,
    json: false,
    problemsOnly: false,
    warningsAsErrors: false,
    interactions: false,
  };

  let i = 0;
  const commands = ['scan', 'tree', 'check', 'report'];
  while (i < args.length) {
    const arg = args[i];
    if (commands.includes(arg) && i === 0) {
      options.command = arg;
      i++;
      continue;
    }

    switch (arg) {
      case '--project':
        if (!args[i + 1] || args[i + 1].startsWith('-')) return { ...options, error: '--project requires a path' };
        options.project = args[++i];
        options.projectSpecified = true;
        break;
      case '--root':
        if (!args[i + 1] || args[i + 1].startsWith('-')) return { ...options, error: '--root requires a path' };
        options.roots.push(args[++i]);
        break;
      case '--json':
        options.json = true;
        break;
      case '--problems-only':
        options.problemsOnly = true;
        break;
      case '--warnings-as-errors':
        options.warningsAsErrors = true;
        break;
      case '--interactions':
        options.interactions = true;
        break;
      case '--semantic-command':
        if (!args[i + 1] || args[i + 1].startsWith('-')) return { ...options, error: '--semantic-command requires an executable path' };
        options.semanticCommand = args[++i];
        break;
      case '--no-color':
        options.color = false;
        break;
      case '--help':
      case '-h':
        return { ...options, help: true };
      default:
        return { ...options, error: 'Unknown option: ' + arg };
    }
    i++;
  }
  if (options.semanticCommand && !options.interactions) {
    return { ...options, error: '--semantic-command requires --interactions' };
  }
  return options;
}

export function printHelp(): string {
  return `Usage: skills-analyzer [command] [options]

Commands:
  scan (default)  Scan skills and display tree
  tree            Same as scan
  check           Scan and show findings
  report          Scan and output JSON

Options:
  --project <path>     Project directory (default: current working directory)
  --root <path>        Additional scan root (repeatable)
  --json               Output in JSON format
  --problems-only      Only show skills with problems
  --warnings-as-errors Treat warnings as errors for exit code
  --interactions       Find skills that may overlap or conflict
  --semantic-command <path> Use executable for semantic analysis (requires --interactions)
  --no-color           Disable colored output
  -h, --help           Show this help`;
}

export function run(options: CliOptions, io: CliIO): number {
  if (options.error) {
    io.err.write('skills-analyzer: ' + options.error + '\n\n' + printHelp() + '\n');
    return 2;
  }
  if (options.help) {
    io.out.write(printHelp() + '\n');
    return 0;
  }

  if (options.projectSpecified) {
    try {
      if (!fs.statSync(options.project).isDirectory()) throw new Error('not a directory');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.err.write('skills-analyzer: invalid project directory: ' + options.project + ' (' + message + ')\n');
      return 2;
    }
  }

  const roots = [...getDefaultRoots({ projectDir: options.project }), ...options.roots];
  const normalized = normalizeRoots(roots);
  const explicitRoots = new Set(normalizeRoots(options.roots));
  const rootReports: RootReport[] = discoverSkills(normalized, { explicitRoots });
  let skillReports: SkillReport[] = [];

  for (const root of rootReports) {
    for (const skill of root.skills) skillReports.push(validateSkill(skill));
  }

  skillReports = applyDuplicateFindings(skillReports);
  const report = buildReport(rootReports, skillReports);
  let interactionError: string | null = null;
  if (options.interactions) {
    const result = analyzeInteractions(skillReports, { semanticCommand: options.semanticCommand });
    report.interactions = result.interactions;
    interactionError = result.error;
    if (interactionError) io.err.write('skills-analyzer: interaction analysis failed: ' + interactionError + '\n');
  }
  const renderOptions = { color: options.color, problemsOnly: options.problemsOnly };

  if (options.json || options.command === 'report') {
    io.out.write(renderJson(report) + '\n');
  } else {
    io.out.write(renderTree(report, renderOptions) + '\n');
    io.out.write(renderFindings(report, renderOptions) + '\n');
    io.out.write(renderInteractions(report, renderOptions) + '\n');
  }
  return interactionError ? 1 : getExitCode(report, options);
}
