---
name: linear-triage
description: Browse and filter Linear issues to help the user pick which ones to work on next.
---

# Linear Triage

## Overview

Browse the user's Linear backlog, filter by team/status/label/assignee, and help them select issues to work on. Return selected issues with full context.

## API Script

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts <command>
```

## Process

### 1. Discover Teams

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts list-teams
```

Present teams to the user. Ask which team to focus on (or all).

### 2. Browse Issues

Start with unstarted issues:

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team <KEY> --status "Todo"
```

The user can refine with additional filters:
- `--status "In Progress"` / `"Backlog"` / `"Todo"` etc.
- `--assignee "Name"`
- `--label "Bug"` / `"Feature"` etc.
- `--limit 50`

If the user wants to search:

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts search-issues "auth redirect bug"
```

### 3. Present Issues

Format issues as a clean table for the user:

```
| #  | ID      | Title                        | Priority | Labels     |
|----|---------|------------------------------|----------|------------|
| 1  | BLU-42  | Fix auth redirect loop       | Urgent   | Bug        |
| 2  | BLU-57  | Add dark mode toggle         | Medium   | Feature    |
| 3  | BLU-63  | Update onboarding flow       | High     | UX         |
```

### 4. Help Select

Ask the user which issues to work on. They can:
- Pick by number from the table ("1 and 3")
- Ask for more details on a specific issue
- Request different filters
- Search for something specific

### 5. Fetch Full Details

For each selected issue, fetch complete details:

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts get-issue <IDENTIFIER>
```

This returns: title, description, comments, relations, parent/children, priority, labels, assignee, dates, URL.

### 6. Return Results

Return the selected issues with their full details to the orchestrator. Include:
- Issue identifier
- Title
- Full description
- Comments (for additional context)
- Related issues
- Priority and labels

The orchestrator will use this to spawn planning subagents.
