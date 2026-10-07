import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export interface DiscoveryOptions {
  homeDir?: string;
  projectDir?: string;
}

export interface ScanOptions {
  explicit?: boolean;
  explicitRoots?: ReadonlySet<string>;
}

export interface RootReport {
  path: string;
  exists: boolean;
  explicit: boolean;
  skills: SkillEntry[];
  error: string | null;
}

export interface SkillEntry {
  path: string;
  name: string;
}

export function getDefaultRoots({ homeDir, projectDir }: DiscoveryOptions = {}): string[] {
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

export function normalizeRoots(roots: string[], cwd?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const root of roots) {
    const absolute = path.resolve(cwd || process.cwd(), root);
    if (!seen.has(absolute)) {
      seen.add(absolute);
      result.push(absolute);
    }
  }
  return result;
}

export function discoverRoot(rootPath: string, { explicit }: ScanOptions = {}): RootReport {
  const result: RootReport = {
    path: rootPath,
    exists: false,
    explicit: !!explicit,
    skills: [],
    error: null,
  };

  try {
    if (!fs.existsSync(rootPath)) {
      if (explicit) result.error = 'Scan root not found: ' + rootPath;
      return result;
    }
    if (!fs.statSync(rootPath).isDirectory()) {
      if (explicit) result.error = 'Scan root is not a directory: ' + rootPath;
      return result;
    }
    result.exists = true;

    for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
      const skillPath = path.join(rootPath, entry.name);
      let isDirectory = entry.isDirectory();
      if (!isDirectory && entry.isSymbolicLink()) {
        try {
          isDirectory = fs.statSync(skillPath).isDirectory();
        } catch {
          continue;
        }
      }
      if (!isDirectory) continue;

      const contents = fs.readdirSync(skillPath, { withFileTypes: true });
      if (contents.some((child) => child.isFile())) {
        result.skills.push({ path: skillPath, name: entry.name });
      }
    }
  } catch (error) {
    result.error = (error as Error).message;
    result.exists = true;
  }

  return result;
}

export function discoverSkills(roots: string[], options: ScanOptions = {}): RootReport[] {
  return roots.map((root) => discoverRoot(root, {
    explicit: options.explicit || options.explicitRoots?.has(root),
  }));
}
