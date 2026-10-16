# Skills Analyzer

Analyze agent skills across global and project-local directories with a terminal tree and actionable recommendations.

## Quick Start

Requires Node.js 22 or newer.

From a checkout:

```bash
npm ci
npm test
npm install --global .
skills-analyzer
sa
```

After publishing, install globally with `npm install --global skills-analyzer`.

After publishing, install globally with `npm install --global skills-analyzer`.

CI tests Node 22 and 24 on Linux and macOS, and smoke-tests the packed CLI.

## Usage

```text
skills-analyzer [command] [options]
sa [command] [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `scan` (default) | Scan skills and display tree |
| `tree` | Same as scan |
| `check` | Scan and show findings |
| `report` | Scan and output JSON |

### Options

| Option | Description |
|--------|-------------|
| `--project <path>` | Project directory (default: cwd) |
| `--root <path>` | Additional scan root (repeatable) |
| `--json` | Output in JSON format |
| `--problems-only` | Only show skills with problems |
| `--warnings-as-errors` | Treat warnings as errors for exit code |
| `--interactions` | Find skill pairs that may overlap or conflict |
| `--semantic-command <path>` | Use an executable for semantic analysis; requires `--interactions` |
| `--no-color` | Disable colored output |
| `-h, --help` | Show help |

## Scanned Directories

**Global roots:**

- `~/.agents/skills`
- `~/.config/opencode/skills`
- `~/.config/opencode/superpowers/skills`
- `~/.claude/skills`
- `~/.opencode/skills`

**Project-local roots:**

- `<project>/.agents/skills`
- `<project>/.opencode/skills`
- `<project>/.claude/skills`
- `<project>/.config/opencode/skills`

## Findings

| Code | Severity | Description |
|------|----------|-------------|
| `MISSING_SKILL_FILE` | error | SKILL.md not found |
| `UNREADABLE_SKILL_FILE` | error | SKILL.md cannot be read |
| `MISSING_NAME` | error | No name in frontmatter |
| `MISSING_DESCRIPTION` | error | No description in frontmatter |
| `DUPLICATE_NAME` | error | Skill name used in multiple locations |
| `MALFORMED_FRONTMATTER` | warning | Invalid YAML or frontmatter block |
| `DUPLICATE_KEY` | warning | Frontmatter key is repeated |
| `NAME_DRIFT` | warning | Directory name differs from metadata name |
| `MISSING_REFERENCE` | warning | Markdown link or image points to a missing local file |

Reference checks inspect Markdown link and image targets; code literals and fenced examples are ignored.

## Skill Interactions

`check --interactions` adds a deterministic, offline candidate scan. It compares skill names and descriptions, which usually declare when skills activate; pairs need at least two shared terms and Jaccard similarity of 0.12 or higher. This is a heuristic: it can miss paraphrases and can report false positives. Results are advisory and do not affect exit codes. The semantic command receives each candidate's full `SKILL.md` to classify possible conflicts.

Text output groups each pair, prints shared terms once, shortens home paths to `~/...`, and truncates long excerpts. Interaction labels use yellow for possible overlap and red for possible conflict; `--no-color` disables ANSI colors. JSON keeps full paths and excerpts.

For semantic classification of candidate pairs, provide an executable explicitly:

```bash
skills-analyzer check --project ~/my-project --interactions \
  --semantic-command ~/bin/analyze-skill-pairs
```

The executable is launched directly without a shell or extra arguments. It receives JSON on stdin:

```json
{
  "version": 1,
  "candidates": [{
    "id": "pair-1",
    "sharedTerms": ["format"],
    "skills": [{
      "id": "/path/to/skill",
      "name": "skill-name",
      "path": "/path/to/SKILL.md",
      "description": "Skill description",
      "content": "Full SKILL.md content"
    }, {
      "id": "/path/to/another-skill",
      "name": "another-skill",
      "path": "/path/to/another-skill/SKILL.md",
      "description": "Another skill description",
      "content": "Full SKILL.md content"
    }]
  }]
}
```

Return JSON on stdout with one result per analyzed candidate. Each citation must quote exact text from the cited skill; analyzer resolves line numbers locally and requires citations from both skills.

```json
{
  "version": 1,
  "interactions": [{
    "candidateId": "pair-1",
    "type": "conflict",
    "explanation": "Skills require different formatting styles.",
    "citations": [
      { "skillId": "/path/to/skill-a", "quote": "Use tabs." },
      { "skillId": "/path/to/skill-b", "quote": "Use spaces." }
    ]
  }]
}
```

Semantic analysis runs only when `--semantic-command` is supplied, with a 10-second timeout and 1 MiB output limit. Command failures, malformed or incomplete responses, unknown IDs, and invalid citations produce a non-zero exit code. Skill content is passed only to the explicitly configured executable; it is never run or edited by the analyzer. This does not verify runtime skill selection; that requires replaying prompts through the target agent.

## Examples

```bash
# Scan and show tree
skills-analyzer

# Show only problems
skills-analyzer --problems-only

# Check a specific project
skills-analyzer check --project ~/my-project

# Export JSON report
skills-analyzer report --json > report.json

# Scan an extra directory
skills-analyzer --root ~/custom-skills
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No errors found |
| 1 | Errors found (or warnings with `--warnings-as-errors`) |
| 2 | Invalid arguments |
