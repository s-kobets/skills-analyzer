import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export interface FrontmatterMetadata {
  name: string;
  description: string;
}

export interface MetadataLines {
  name: number | null;
  description: number | null;
}

export interface FrontmatterError {
  code: string;
  message: string;
  recommendation: string;
  line?: number;
}

export interface FrontmatterResult {
  metadata: FrontmatterMetadata;
  metadataLines: MetadataLines;
  errors: FrontmatterError[];
}

export interface ReadFileResult {
  content: string | null;
  readError: { code: string; message: string } | null;
}

export function parseFrontmatter(content: string | null): FrontmatterResult {
  const metadata: FrontmatterMetadata = { name: '', description: '' };
  const metadataLines: MetadataLines = { name: null, description: null };
  const errors: FrontmatterError[] = [];
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');

  if (lines[0] !== '---') {
    addMissingMetadataErrors(metadata, metadataLines, errors);
    return { metadata, metadataLines, errors };
  }

  const closingLine = lines.findIndex((line, index) => index > 0 && line === '---');
  const frontmatterLines = lines.slice(1, closingLine === -1 ? undefined : closingLine);
  for (const [index, line] of frontmatterLines.entries()) {
    const key = line.match(/^(name|description)\s*:/)?.[1] as keyof MetadataLines | undefined;
    if (key && metadataLines[key] === null) metadataLines[key] = index + 2;
  }

  const document = YAML.parseDocument(frontmatterLines.join('\n'), { uniqueKeys: true, logLevel: 'silent' });
  for (const error of document.errors) {
    const line = error.linePos?.[0]?.line;
    errors.push({
      code: error.code === 'DUPLICATE_KEY' ? 'DUPLICATE_KEY' : 'MALFORMED_FRONTMATTER',
      message: error.message,
      recommendation: error.code === 'DUPLICATE_KEY'
        ? 'Remove the duplicate frontmatter key.'
        : 'Fix the YAML syntax in the frontmatter.',
      ...(line ? { line: line + 1 } : {}),
    });
  }

  for (const key of ['name', 'description'] as const) {
    try {
      let node: unknown = document.get(key);
      if (YAML.isAlias(node)) {
        node = node.resolve(document);
        if (!node) throw new Error('Unresolved YAML alias');
      }
      const value = toYamlValue(node);
      if (typeof value === 'string') metadata[key] = value.trim();
    } catch (error) {
      errors.push({
        code: 'MALFORMED_FRONTMATTER',
        message: (error as Error).message,
        recommendation: 'Fix the YAML syntax in the frontmatter.',
        line: metadataLines[key] ?? undefined,
      });
    }
  }

  if (closingLine === -1) {
    errors.push({
      code: 'MALFORMED_FRONTMATTER',
      message: 'Frontmatter closing delimiter is missing',
      recommendation: 'Close the frontmatter block with --- on its own line.',
      line: lines.length,
    });
  }

  addMissingMetadataErrors(metadata, metadataLines, errors);
  return { metadata, metadataLines, errors };
}

function toYamlValue(node: unknown): unknown {
  if (node && typeof node === 'object' && 'toJSON' in node) {
    const toJSON = (node as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === 'function') return toJSON.call(node);
  }
  return node;
}

function addMissingMetadataErrors(
  metadata: FrontmatterMetadata,
  metadataLines: MetadataLines,
  errors: FrontmatterError[],
): void {
  if (metadata.name === '') {
    errors.push({
      code: 'MISSING_NAME',
      message: 'Skill name is missing or empty',
      recommendation: 'Add a non-empty name field to the SKILL.md frontmatter.',
      ...(metadataLines.name !== null ? { line: metadataLines.name } : {}),
    });
  }
  if (metadata.description === '') {
    errors.push({
      code: 'MISSING_DESCRIPTION',
      message: 'Skill description is missing or empty',
      recommendation: 'Add a non-empty description field to the SKILL.md frontmatter.',
      ...(metadataLines.description !== null ? { line: metadataLines.description } : {}),
    });
  }
}

export function readSkillFile(skillDir: string): ReadFileResult {
  const filePath = path.join(skillDir, 'SKILL.md');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, readError: null };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return { content: null, readError: { code: err.code || 'READ_ERROR', message: err.message } };
  }
}
