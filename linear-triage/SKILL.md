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

### 2. Check What's Already In Progress

**Before browsing available work**, check what's currently being worked on:

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team <KEY> --status "In Progress"
```

Present these separately so the user knows what other agents are already handling:

```
Currently in progress (other agents may be working on these):

| ID      | Title                        | Assignee   |
|---------|------------------------------|------------|
| BLU-38  | Apparel in character studio  | —          |
| BLU-15  | Character save toast         | —          |
```

**Do NOT suggest "In Progress" issues for new work.** They are already being handled by another agent or terminal.

### 3. Browse Available Issues

Fetch unstarted issues:

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team <KEY> --status "Todo"
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team <KEY> --status "Backlog"
```

The user can refine with additional filters:
- `--assignee "Name"`
- `--label "Bug"` / `"Feature"` etc.
- `--limit 50`

If the user wants to search:

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts search-issues "auth redirect bug"
```

### 4. Present Issues

Format available issues as a clean table for the user:

```
Available to work on:

| #  | ID      | Title                        | Priority | Labels     |
|----|---------|------------------------------|----------|------------|
| 1  | BLU-42  | Fix auth redirect loop       | Urgent   | Bug        |
| 2  | BLU-57  | Add dark mode toggle         | Medium   | Feature    |
| 3  | BLU-63  | Update onboarding flow       | High     | UX         |
```

### 5. Help Select

Ask the user which issues to work on. They can:
- Pick by number from the table ("1 and 3")
- Ask for more details on a specific issue
- Request different filters
- Search for something specific

### 6. Fetch Full Details

For each selected issue, fetch complete details:

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts get-issue <IDENTIFIER>
```

This returns: title, description, comments, relations, parent/children, priority, labels, assignee, dates, URL.

### 7. Return Results

Return the selected issues with their full details to the orchestrator. Include:
- Issue identifier
- Title
- Full description
- Comments (for additional context)
- Related issues
- Priority and labels

The orchestrator will use this to spawn planning subagents.
