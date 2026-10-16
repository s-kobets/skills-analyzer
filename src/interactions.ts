import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { readSkillFile } from './frontmatter.js';
import type { SkillReport } from './validate.js';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'always', 'and', 'any', 'are', 'around', 'before', 'being', 'between',
  'both', 'can', 'could', 'each', 'for', 'from', 'have', 'into', 'just', 'more', 'most', 'must', 'only',
  'other', 'our', 'out', 'over', 'same', 'should', 'some', 'such', 'than', 'that', 'the', 'their', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'under', 'until', 'use', 'used', 'using', 'very',
  'was', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'within', 'without',
  'would', 'you', 'your', 'skill', 'skills',
  'без', 'более', 'бы', 'был', 'была', 'были', 'было', 'быть', 'вам', 'вас', 'весь', 'вот', 'все', 'вы',
  'где', 'да', 'для', 'до', 'его', 'ее', 'если', 'есть', 'ещё', 'же', 'за', 'здесь', 'и', 'из', 'или',
  'им', 'их', 'к', 'как', 'когда', 'кто', 'ли', 'либо', 'мне', 'мы', 'на', 'над', 'него', 'нее', 'нет',
  'ни', 'них', 'но', 'ну', 'о', 'об', 'он', 'она', 'они', 'оно', 'от', 'по', 'под', 'при', 'с', 'со',
  'так', 'такой', 'там', 'те', 'тем', 'то', 'тогда', 'тоже', 'только', 'том', 'ты', 'у', 'уже', 'что',
  'чтобы', 'эта', 'эти', 'это', 'я',
]);
const MIN_SHARED_TERMS = 2;
const MIN_JACCARD_SIMILARITY = 0.12;
const SEMANTIC_TIMEOUT_MS = 10_000;
const MAX_SEMANTIC_OUTPUT_BYTES = 1_048_576;

export interface InteractionSkill {
  id: string;
  name: string;
  path: string;
  description: string;
  content: string;
}

export interface InteractionCandidate {
  id: string;
  names: [string, string];
  skills: [InteractionSkill, InteractionSkill];
  sharedTerms: string[];
}

export interface SkillInteraction {
  candidateId: string;
  type: 'overlap' | 'conflict';
  names: [string, string];
  paths: [string, string];
  explanation: string;
  sharedTerms: string[];
  citations: Array<{ path: string; line: number; quote: string }>;
}

export interface InteractionResult {
  interactions: SkillInteraction[];
  error: string | null;
}

export interface InteractionOptions {
  semanticCommand?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export function findInteractionCandidates(skills: SkillReport[]): InteractionCandidate[] {
  const documents = skills.flatMap((report): InteractionSkill[] => {
    if (!report.metadata.name || !report.metadata.description) return [];
    const { content, readError } = readSkillFile(report.path);
    if (readError || content === null) return [];
    return [{
      id: report.path,
      name: report.metadata.name,
      path: path.join(report.path, 'SKILL.md'),
      description: report.metadata.description,
      content,
    }];
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  const candidates: InteractionCandidate[] = [];
  for (let left = 0; left < documents.length; left++) {
    const leftTerms = getTerms(documents[left]);
    for (let right = left + 1; right < documents.length; right++) {
      const rightTerms = getTerms(documents[right]);
      const sharedTerms = [...leftTerms].filter((term) => rightTerms.has(term)).sort();
      const unionSize = new Set([...leftTerms, ...rightTerms]).size;
      if (sharedTerms.length < MIN_SHARED_TERMS || sharedTerms.length / unionSize < MIN_JACCARD_SIMILARITY) continue;

      const skills: [InteractionSkill, InteractionSkill] = [documents[left], documents[right]];
      candidates.push({
        id: `pair-${candidates.length + 1}`,
        names: [skills[0].name, skills[1].name],
        skills,
        sharedTerms,
      });
    }
  }
  return candidates;
}

export function analyzeInteractions(skills: SkillReport[], options: InteractionOptions = {}): InteractionResult {
  const candidates = findInteractionCandidates(skills);
  const interactions = candidates.map((candidate): SkillInteraction => ({
    candidateId: candidate.id,
    type: 'overlap',
    names: candidate.names,
    paths: [candidate.skills[0].path, candidate.skills[1].path],
    explanation: `Shared terms: ${candidate.sharedTerms.join(', ')}`,
    sharedTerms: candidate.sharedTerms,
    citations: candidate.skills.flatMap((skill) => {
      const citation = findHeuristicCitation(skill, candidate.sharedTerms);
      return citation ? [citation] : [];
    }),
  }));

  if (!options.semanticCommand || candidates.length === 0) return { interactions, error: null };

  const semantic = runSemanticCommand(options.semanticCommand, candidates, options);
  if (semantic.error) return { interactions, error: semantic.error };
  for (const result of semantic.results) {
    const index = candidates.findIndex((candidate) => candidate.id === result.candidateId);
    const candidate = candidates[index];
    interactions[index] = {
      ...interactions[index],
      type: result.type,
      explanation: result.explanation,
      citations: result.citations.map((citation) => {
        const skill = candidate.skills.find((entry) => entry.id === citation.skillId)!;
        const offset = skill.content.indexOf(citation.quote);
        const line = skill.content.slice(0, offset).split(/\r\n?|\n/).length;
        return { path: skill.path, line, quote: citation.quote };
      }),
    };
  }
  return { interactions, error: null };
}

interface SemanticOutput {
  candidateId: string;
  type: 'overlap' | 'conflict';
  explanation: string;
  citations: Array<{ skillId: string; quote: string }>;
}

function runSemanticCommand(
  command: string,
  candidates: InteractionCandidate[],
  options: InteractionOptions,
): { results: SemanticOutput[]; error: string | null } {
  const input = JSON.stringify({
    version: 1,
    candidates: candidates.map(({ id, skills, sharedTerms }) => ({ id, skills, sharedTerms })),
  });
  const execution = spawnSync(command, [], {
    input,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeoutMs ?? SEMANTIC_TIMEOUT_MS,
    maxBuffer: options.maxOutputBytes ?? MAX_SEMANTIC_OUTPUT_BYTES,
  });
  const executionError = execution.error as NodeJS.ErrnoException | undefined;
  if (executionError?.code === 'ETIMEDOUT') return { results: [], error: 'Semantic command timed out' };
  if (executionError?.code === 'ENOBUFS') return { results: [], error: 'Semantic command output exceeded the limit' };
  if (execution.error) return { results: [], error: `Semantic command failed: ${execution.error.message}` };
  if (execution.status !== 0) {
    const detail = execution.stderr.trim();
    return { results: [], error: `Semantic command exited with status ${execution.status}${detail ? `: ${detail}` : ''}` };
  }

  let output: unknown;
  try {
    output = JSON.parse(execution.stdout);
  } catch {
    return { results: [], error: 'Semantic command returned invalid JSON' };
  }
  if (!isRecord(output) || output.version !== 1 || !Array.isArray(output.interactions)) {
    return { results: [], error: 'Semantic command returned an invalid response format' };
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const results: SemanticOutput[] = [];
  const seenCandidates = new Set<string>();
  for (const raw of output.interactions) {
    if (!isRecord(raw) || typeof raw.candidateId !== 'string' || !candidateById.has(raw.candidateId)
      || (raw.type !== 'overlap' && raw.type !== 'conflict') || typeof raw.explanation !== 'string'
      || !raw.explanation.trim() || !Array.isArray(raw.citations)) {
      return { results: [], error: 'Semantic command returned an invalid interaction' };
    }
    if (seenCandidates.has(raw.candidateId)) return { results: [], error: 'Semantic command returned a duplicate candidate' };
    seenCandidates.add(raw.candidateId);
    const candidate = candidateById.get(raw.candidateId)!;
    const citations: SemanticOutput['citations'] = [];
    for (const citation of raw.citations) {
      if (!isRecord(citation) || typeof citation.skillId !== 'string' || typeof citation.quote !== 'string' || !citation.quote) {
        return { results: [], error: 'Semantic command returned an invalid or unmatched citation' };
      }
      const skillId = citation.skillId;
      const quote = citation.quote;
      if (!candidate.skills.some((skill) => skill.id === skillId && skill.content.includes(quote))) {
        return { results: [], error: 'Semantic command returned an invalid or unmatched citation' };
      }
      citations.push({ skillId, quote });
    }
    if (candidate.skills.some((skill) => !citations.some((citation) => citation.skillId === skill.id))) {
      return { results: [], error: 'Semantic command must cite both skills in each interaction' };
    }
    results.push({
      candidateId: raw.candidateId,
      type: raw.type,
      explanation: raw.explanation,
      citations,
    });
  }
  if (seenCandidates.size !== candidateById.size) {
    return { results: [], error: 'Semantic command response is missing candidate results' };
  }
  return { results, error: null };
}

function findHeuristicCitation(
  skill: InteractionSkill,
  sharedTerms: string[],
): SkillInteraction['citations'][number] | null {
  const lines = skill.content.split(/\r\n?|\n/);
  const matchesTerm = (sourceLine: string): boolean =>
    sharedTerms.some((term) => sourceLine.toLowerCase().includes(term.toLowerCase()));
  const descriptionStart = lines.findIndex((line) => /^\s*description\s*:/i.test(line));
  const frontmatterEnd = lines.findIndex((line, index) => index > 0 && line === '---');
  const descriptionEnd = frontmatterEnd === -1 ? lines.length : frontmatterEnd;
  const descriptionMatch = descriptionStart === -1 ? -1
    : lines.findIndex((line, index) => index >= descriptionStart && index < descriptionEnd && matchesTerm(line));
  const lineIndex = descriptionMatch !== -1 ? descriptionMatch : lines.findIndex(matchesTerm);
  if (lineIndex === -1) return null;
  return {
    path: skill.path,
    line: lineIndex + 1,
    quote: lines[lineIndex].trim(),
  };
}

function getTerms(skill: InteractionSkill): Set<string> {
  const tokens = `${skill.name} ${skill.description}`
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{2,}/gu) || [];
  return new Set(tokens.filter((token) => !STOP_WORDS.has(token)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
