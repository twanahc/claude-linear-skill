# Linear Integration Skill — Design Document

**Date**: 2026-02-27
**Status**: Approved

## Overview

A reusable Claude Code skill that integrates with Linear's GraphQL API via a lightweight TypeScript CLI script. Enables Claude to browse, triage, plan, and implement Linear issues — with subagent-driven workflows that keep the main context clean.

This is a **global skill** installed in `~/.claude/skills/`, available across all projects.

## Architecture

### File Structure

```
~/.claude/skills/
  linear/
    SKILL.md                    # Main orchestrator skill
    docs/
      2026-02-27-linear-integration-design.md  # This file
    linear-triage/
      SKILL.md                  # Browse & select issues
    linear-plan/
      SKILL.md                  # Create implementation plan per issue
    linear-implement/
      SKILL.md                  # Execute plan, write code
    scripts/
      linear-api.ts             # Single CLI script, zero deps
```

### Authentication

- Uses `LINEAR_API_KEY` environment variable
- User sets this in their shell profile (`~/.bashrc` or `~/.zshrc`)
- API key created at: Linear Settings → API → Create Key

### API Script (`linear-api.ts`)

Single TypeScript file (~150-200 lines) using `fetch()` against `https://api.linear.app/graphql`. Run with `bun`. Zero external dependencies.

#### Subcommands

| Command | Args | Description | Output |
|---------|------|-------------|--------|
| `list-issues` | `--team`, `--status`, `--assignee`, `--label`, `--limit` | List issues with filters | JSON array |
| `get-issue` | `<id>` | Fetch full issue details + comments | JSON object |
| `search-issues` | `<query>` | Full-text search across issues | JSON array |
| `create-issue` | `--title`, `--description`, `--team`, `--priority`, `--label` | Create a new issue | Created issue JSON |
| `update-status` | `<id> <state>` | Move issue to a workflow state | Confirmation JSON |
| `add-comment` | `<id> <body>` | Add a comment to an issue | Confirmation JSON |
| `list-teams` | (none) | List available teams | JSON array |
| `list-states` | `--team` | List workflow states for a team | JSON array |

- All output is **JSON to stdout**
- Errors go to **stderr** with non-zero exit code
- Script validates `LINEAR_API_KEY` is set before any operation

## Skills

### Skill 1: `linear` (Main Orchestrator)

**Trigger**: User says "work on linear issues", "check my linear backlog", or invokes `/linear`

**Workflow**:
1. Ask user: browse issues or specific issue IDs?
2. If browsing → spawn **linear-triage** subagent (Task tool)
3. Once issues selected → for each issue, spawn **linear-plan** subagent(s)
4. Present plans for user approval
5. Once approved → spawn **linear-implement** subagent(s)
6. Can run steps 3+4 in **parallel** for independent issues, or serially

**Context strategy**: Orchestrator only holds issue IDs and summaries. All heavy codebase exploration and code writing happens in subagents.

### Skill 2: `linear-triage`

**Purpose**: Browse, filter, and help user select issues.

**Workflow**:
1. Run `list-teams` to discover teams
2. Run `list-issues` with user-specified filters
3. Present issues as clean summary table (ID, title, priority, labels, assignee)
4. Help user pick which ones to work on
5. For each selected issue, run `get-issue` for full details
6. Return selected issues with full context

### Skill 3: `linear-plan`

**Purpose**: Create a detailed implementation plan for a single issue.

**Workflow**:
1. Run `get-issue <id>` for full details + comments
2. Explore the project codebase (Glob, Grep, Read) to understand impact
3. Create implementation plan (files to change, approach, tests needed)
4. Run `update-status <id> "In Progress"`
5. Run `add-comment <id>` with plan summary
6. Return the plan

### Skill 4: `linear-implement`

**Purpose**: Execute an implementation plan for a single issue.

**Workflow**:
1. Receive plan from orchestrator or linear-plan output
2. Implement changes step by step
3. Run project checks (e.g., `bun run check`, tests)
4. If bugs/tech debt discovered → `create-issue` for follow-ups
5. Run `add-comment <id>` with implementation summary
6. Run `update-status <id> "Done"` (or "In Review")
7. Return summary of changes made

## Design Decisions

1. **Script over MCP**: A CLI script is more context-efficient than an MCP server. MCP tools register globally and consume tokens every turn. The script only fires when invoked.

2. **Zero dependencies**: Using raw `fetch()` + GraphQL instead of `@linear/sdk` keeps the script portable and avoids `node_modules`.

3. **3 separate skills vs 1 monolith**: Modularity lets you use each skill independently (e.g., just triage without implementing) and enables parallel subagent dispatch.

4. **JSON output**: Structured output lets Claude parse results reliably. Human-readable formatting is Claude's job, not the script's.

5. **Subagent isolation**: Each subagent gets its own context window. The orchestrator stays lean, enabling longer sessions with more issues processed.

## Parallel Execution Strategy

For **independent issues** (no shared files or dependencies):
- Orchestrator spawns N plan subagents in parallel
- After plans approved, spawns N implement subagents in parallel
- Each can run in an isolated git worktree for safety

For **dependent issues** (overlapping files):
- Run serially: plan → implement → plan → implement
- Or plan all first, then implement in dependency order

## Future Extensions

- `assign-issue` command for reassignment
- `list-projects` / `list-cycles` for broader context
- Automatic priority scoring based on codebase analysis
- Integration with git branch naming (e.g., `feat/BLU-42-description`)
- PR description auto-generation from Linear issue details
