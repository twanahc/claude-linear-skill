---
name: linear-implement
description: Execute an implementation plan for a single Linear issue — write code, run checks, and update Linear with results.
---

# Linear Implement

## Overview

Given an implementation plan for a Linear issue, execute it step by step: write code, run tests/checks, and update the Linear issue with progress. Create follow-up issues for any bugs or tech debt discovered along the way.

## API Script

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts <command>
```

## Process

### 1. Pull Latest & Create Worktree

**This is mandatory. Never work outside a worktree.**

```bash
# Pull latest from main
git checkout main && git pull origin main

# Create a worktree for this feature
git worktree add .claude/worktrees/<IDENTIFIER> -b <IDENTIFIER>

# Symlink .env.local from the main repo root (required for API keys / Firebase)
ln -s <main-repo-root>/.env.local .claude/worktrees/<IDENTIFIER>/.env.local

# Switch into the worktree
cd .claude/worktrees/<IDENTIFIER>
```

Replace `<IDENTIFIER>` with the issue identifier in lowercase (e.g., `blue-42`). Replace `<main-repo-root>` with the absolute path to the main repository root.

### 2. Understand the Plan

Read the provided implementation plan carefully. Identify:
- Files to modify or create
- Order of operations (dependencies between steps)
- Tests to write or update
- The issue's team key (from the identifier, e.g., "BLU" from "BLU-42")

### 3. Use Superpowers Skills (if available)

If superpowers skills are available in the environment, use them to guide implementation:
- **brainstorming** — before creative work (new features, new components, behavioral changes)
- **test-driven-development** — before writing implementation code
- **systematic-debugging** — if you encounter bugs or unexpected behavior
- **verification-before-completion** — before claiming work is done
- **writing-plans** — if the plan needs further decomposition

Invoke the relevant skill before proceeding. If no superpowers skills are available, continue normally.

### 4. Implement

Execute the plan step by step:

- Write code changes using Edit/Write tools
- Follow existing code patterns and conventions in the project
- Keep changes minimal and focused on the issue
- Write tests for new functionality

### 5. Run Checks

After implementation, run the project's checks. Check `package.json` for available scripts:

```bash
# Common patterns — use what the project has:
bun run check          # if available (preferred)
bun run lint           # linting
bun run typecheck      # type checking
bun test               # tests
```

Fix any errors before proceeding. If checks fail:
- Read the error output carefully
- Fix the root cause (not the symptom)
- Re-run checks until they pass

### 6. Handle Discoveries

If you find bugs, tech debt, or edge cases while implementing that are **outside the scope** of the current issue:

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts create-issue \
  --title "Found during <IDENTIFIER>: <brief description>" \
  --team <TEAM_KEY> \
  --priority 3 \
  --description "Discovered while implementing <IDENTIFIER>. <Details of what was found and why it matters.>"
```

Track all created follow-up issues in your summary.

### 7. Update Linear

Add an implementation summary comment:

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts add-comment <IDENTIFIER> \
  "Implementation complete. Changes: <summary of files changed and what was done>. Tests: <what was tested>. Follow-ups: <any issues created, or 'none'>."
```

**Do NOT change the issue status to Done.** The orchestrator or user will decide when to close it. Only update status if explicitly asked.

### 8. Return Summary

Return to the orchestrator:
- **What was implemented**: files changed, approach taken
- **Tests**: what was written, whether they pass
- **Checks**: whether all project checks pass
- **Follow-up issues**: any new issues created (with identifiers)
- **Blockers**: anything that couldn't be completed and why

## Key Principles

- **Scope discipline**: Only implement what the plan says. Don't refactor nearby code, add features, or "improve" things outside the plan.
- **Check before claiming done**: Always run the project's check/test commands and confirm they pass.
- **File follow-ups, don't fix everything**: If you find unrelated issues, create Linear issues for them instead of fixing them in this PR.
- **Be transparent**: If something doesn't work as expected, report it honestly in the summary.
