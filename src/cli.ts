import { getDefaultRoots, normalizeRoots, discoverSkills } from './discovery.js';
import { validateSkill, applyDuplicateFindings, buildReport, getExitCode } from './validate.js';
import { renderTree, renderFindings, renderJson } from './render.js';

import type { SkillReport } from './validate.js';
import type { RootReport } from './discovery.js';

export interface CliOptions {
  command: string;
  project: string;
  roots: string[];
  color: boolean;
  json: boolean;
  problemsOnly: boolean;
  warningsAsErrors: boolean;
  help?: boolean;
  error?: string;
}

export interface CliIO {
  out: { write: (msg: string) => void };
  err: { write: (msg: string) => void };
}

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
    command: 'scan',
    project: process.cwd(),
    roots: [],
    color: true,
    json: false,
    problemsOnly: false,
    warningsAsErrors: false,
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
        options.project = args[++i];
        break;
      case '--root':
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

  const defaultRoots = getDefaultRoots({ projectDir: options.project });
  const allRoots = [...defaultRoots];
  if (options.roots.length > 0) {
    allRoots.push(...options.roots);
  }

  const normalized = normalizeRoots(allRoots);
  const rootReports: RootReport[] = discoverSkills(normalized, {});

  let skillReports: SkillReport[] = [];
  for (const root of rootReports) {
    for (const skill of root.skills) {
      skillReports.push(validateSkill(skill, {}));
    }
  }

  skillReports = applyDuplicateFindings(skillReports);
  const report = buildReport(rootReports, skillReports);

  const renderOpts = { color: options.color, problemsOnly: options.problemsOnly };

  if (options.json) {
    io.out.write(renderJson(report) + '\n');
  } else {
    io.out.write(renderTree(report, renderOpts) + '\n');
    io.out.write(renderFindings(report, renderOpts) + '\n');
  }

  return getExitCode(report, options);
}
