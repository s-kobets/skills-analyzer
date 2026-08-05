import fs from 'node:fs';
import path from 'node:path';

export interface FrontmatterMetadata {
  name: string;
  description: string;
}

export interface FrontmatterError {
  code: string;
  message: string;
  recommendation: string;
}

export interface FrontmatterResult {
  metadata: FrontmatterMetadata;
  errors: FrontmatterError[];
}

export interface ReadFileResult {
  content: string | null;
  readError: { code: string; message: string } | null;
}

export function parseFrontmatter(content: string | null): FrontmatterResult {
  const metadata: FrontmatterMetadata = { name: '', description: '' };
  const errors: FrontmatterError[] = [];

  if (!content || !content.startsWith('---\n')) {
    return { metadata, errors };
  }

  let endIdx = content.indexOf('\n---', 4);
  if (endIdx === -1 && content.endsWith('\n---')) {
    endIdx = content.length - 4;
  } else if (endIdx === -1 && content === '---\n---') {
    endIdx = 4;
  }
  if (endIdx === -1) {
    return { metadata, errors };
  }

  const fmBlock = content.slice(4, endIdx);
  const lines = fmBlock.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      errors.push({
        code: 'MALFORMED_FRONTMATTER',
        message: 'Malformed frontmatter line: ' + trimmed,
        recommendation: 'Ensure each line is key: value format.',
      });
      continue;
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (key === 'name' || key === 'description') {
      if (metadata[key] !== '' && metadata[key] !== undefined) {
        errors.push({
          code: 'DUPLICATE_KEY',
          message: 'Duplicate frontmatter key: ' + key,
          recommendation: 'Remove the duplicate ' + key + ' field.',
        });
      } else {
        metadata[key] = value;
      }
    }
  }

  if (metadata.name === '') {
    errors.push({
      code: 'MISSING_NAME',
      message: 'Skill name is missing or empty',
      recommendation: 'Add a non-empty name field to the SKILL.md frontmatter.',
    });
  }
  if (metadata.description === '') {
    errors.push({
      code: 'MISSING_DESCRIPTION',
      message: 'Skill description is missing or empty',
      recommendation: 'Add a non-empty description field to the SKILL.md frontmatter.',
    });
  }

  return { metadata, errors };
}

export function readSkillFile(skillDir: string): ReadFileResult {
  const filePath = path.join(skillDir, 'SKILL.md');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, readError: null };
  } catch (err: unknown) {
    return { content: null, readError: { code: (err as NodeJS.ErrnoException).code || 'READ_ERROR', message: (err as Error).message } };
  }
}
