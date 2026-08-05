import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export interface DiscoveryOptions {
  homeDir?: string;
  projectDir?: string;
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
  for (const r of roots) {
    const abs = path.resolve(cwd || process.cwd(), r);
    if (!seen.has(abs)) {
      seen.add(abs);
      result.push(abs);
    }
  }
  return result;
}

export function discoverRoot(rootPath: string, { explicit }: { explicit?: boolean } = {}): RootReport {
  const result: RootReport = {
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
  } catch (err: unknown) {
    result.error = (err as Error).message;
    result.exists = true;
  }

  return result;
}

export function discoverSkills(roots: string[], options: Record<string, unknown>): RootReport[] {
  return roots.map((r) => discoverRoot(r, options));
}
