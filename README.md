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
