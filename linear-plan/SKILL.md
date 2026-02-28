---
name: linear-plan
description: Create a detailed implementation plan for a single Linear issue by analyzing the issue and the project codebase.
---

# Linear Plan

## Overview

Given a Linear issue identifier, fetch its details, explore the project codebase, and create a detailed implementation plan. Update the issue status and add a planning comment to Linear.

## API Script

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts <command>
```

## Process

### 1. Fetch Issue Details

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts get-issue <IDENTIFIER>
```

Parse the response to understand:
- **What** needs to be done (title + description)
- **Context** from comments and related issues
- **Scope** from parent/children relationships
- **Priority** and any deadlines

### 2. Explore the Codebase

Based on the issue description:
- Use **Glob** to find relevant files by name/pattern
- Use **Grep** to search for related code, functions, components
- Use **Read** to understand existing implementations and patterns
- Identify which files need to change and what the changes should be
- Check for existing tests related to the area

### 3. Create Implementation Plan

Write a structured plan in this format:

```markdown
## Plan for <IDENTIFIER>: <Title>

**Summary**: <1-2 sentence overview of what needs to happen>

**Files to modify**:
- `path/to/file.ts` — <what changes and why>
- `path/to/other.ts` — <what changes and why>

**New files** (if any):
- `path/to/new-file.ts` — <purpose>

**Implementation steps**:
1. <Specific, actionable step with file paths>
2. <Next step>
3. ...

**Tests**:
- <What tests to write or update>
- <What to assert>

**Risks / Notes**:
- <Edge cases to watch for>
- <Dependencies or ordering concerns>
- <Anything the implementer should be aware of>
```

### 4. Update Linear

**Immediately** set the issue to "In Progress" — do not ask for confirmation. Picking an issue to plan means it's being worked on.

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts update-status <IDENTIFIER> "In Progress"
```

Then add a planning comment:

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts add-comment <IDENTIFIER> "Implementation plan created by Claude Code. Summary: <1-2 sentences of what the plan covers>"
```

### 5. Return Plan

Return the full plan text to the orchestrator for user review. The orchestrator will present it and get approval before proceeding to implementation.

## Key Principles

- **Be specific**: Include exact file paths, function names, line references
- **Be minimal**: Plan the smallest change that solves the issue
- **Be honest**: If the issue is unclear or the codebase is confusing, say so
- **Follow existing patterns**: Match the project's conventions, don't introduce new patterns
- **Consider tests**: Always include what tests need to be written or updated
