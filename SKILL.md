---
name: linear
description: Use when working with Linear issues — browse backlog, triage, plan implementations, propose improvements, and execute. Orchestrates subagents for context-efficient issue processing.
---

# Linear Issue Workflow

## Overview

Orchestrate Linear issue workflows: browse your backlog, pick issues, create implementation plans, and execute them — all while keeping your main context clean via subagents.

## Prerequisites

- `LINEAR_API_KEY` environment variable must be set
- Get your key at: Linear Settings → API → Create Key
- `export LINEAR_API_KEY="lin_api_..."`

## API Script

All Linear API calls go through:

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts <command>
```

Commands:
- `list-teams` — discover teams
- `list-states --team KEY` — workflow states for a team
- `list-issues --team KEY --status NAME --assignee NAME --label NAME --limit N`
- `get-issue IDENTIFIER` — full issue details (e.g., BLU-42)
- `search-issues <query>` — full-text search
- `create-issue --title T --team KEY --description D --priority 0-4 --label L`
- `update-status IDENTIFIER "State Name"`
- `add-comment IDENTIFIER "comment body"`

## Workflow

```dot
digraph linear_workflow {
    rankdir=TB;
    "User invokes /linear" [shape=doublecircle];
    "Browse, specific, or propose?" [shape=diamond];
    "Spawn linear-triage subagent" [shape=box];
    "User provides issue IDs" [shape=box];
    "Spawn linear-propose subagent" [shape=box];
    "Present proposals to user" [shape=box];
    "User picks proposals to create?" [shape=diamond];
    "Create Linear issues" [shape=box];
    "For each issue: spawn linear-plan subagent" [shape=box];
    "Present plans to user" [shape=box];
    "User approves plans?" [shape=diamond];
    "For each plan: spawn linear-implement subagent" [shape=box];
    "Summarize results" [shape=doublecircle];

    "User invokes /linear" -> "Browse, specific, or propose?";
    "Browse, specific, or propose?" -> "Spawn linear-triage subagent" [label="browse"];
    "Browse, specific, or propose?" -> "User provides issue IDs" [label="specific"];
    "Browse, specific, or propose?" -> "Spawn linear-propose subagent" [label="propose"];
    "Spawn linear-propose subagent" -> "Present proposals to user";
    "Present proposals to user" -> "User picks proposals to create?";
    "User picks proposals to create?" -> "Create Linear issues" [label="yes"];
    "Create Linear issues" -> "For each issue: spawn linear-plan subagent";
    "Spawn linear-triage subagent" -> "For each issue: spawn linear-plan subagent";
    "User provides issue IDs" -> "For each issue: spawn linear-plan subagent";
    "For each issue: spawn linear-plan subagent" -> "Present plans to user";
    "Present plans to user" -> "User approves plans?";
    "User approves plans?" -> "Present plans to user" [label="revise"];
    "User approves plans?" -> "For each plan: spawn linear-implement subagent" [label="yes"];
    "For each plan: spawn linear-implement subagent" -> "Summarize results";
}
```

### Step 1: Determine Scope

Ask the user:
- **Browse backlog**: "Let me look through your issues and help you pick" → Spawn a **linear-triage** subagent
- **Specific issues**: User provides issue IDs (e.g., "BLU-42, BLU-57") → Skip to Step 2
- **Propose improvements**: "Analyze the codebase and suggest things to add/fix/improve" → Go to Step 1b

### Step 1b: Propose (if "propose" selected)

Spawn a **linear-propose** subagent using the Task tool:

```
Task tool:
  subagent_type: general-purpose
  prompt: |
    You are a Linear proposal agent. Read and follow the skill instructions at:
    ~/.claude/skills/linear/linear-propose/SKILL.md

    Team key: <TEAM_KEY>
    Focus area: <user-specified focus or "broad sweep">
    Project root: <current working directory>

    The Linear API script is at: ~/.claude/skills/linear/scripts/linear-api.ts
    Run it with: source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts <command>
```

When the subagent returns proposals:
1. Present the proposals to the user in a clean table
2. Ask which proposals to create as Linear issues
3. For each approved proposal, create a Linear issue using the API script
4. The user can then optionally proceed to Step 2 (Plan) with the newly created issues

### Step 2: Plan

For each selected issue, spawn a **linear-plan** subagent using the Task tool:

```
Task tool:
  subagent_type: general-purpose
  prompt: |
    You are a Linear planning agent. Read and follow the skill instructions at:
    ~/.claude/skills/linear/linear-plan/SKILL.md

    Issue to plan: <IDENTIFIER>
    Project root: <current working directory>

    The Linear API script is at: ~/.claude/skills/linear/scripts/linear-api.ts
    Run it with: bun ~/.claude/skills/linear/scripts/linear-api.ts <command>
```

**Parallelism decision:**
- Independent issues (different areas of codebase) → spawn plan subagents **in parallel**
- Overlapping issues (same files/modules) → run **serially**
- Ask the user if unsure

### Step 3: Review Plans

Present each plan summary to the user. Wait for explicit approval before proceeding.

### Step 4: Implement

For each approved plan, spawn a **linear-implement** subagent using the Task tool:

```
Task tool:
  subagent_type: general-purpose
  prompt: |
    You are a Linear implementation agent. Read and follow the skill instructions at:
    ~/.claude/skills/linear/linear-implement/SKILL.md

    Issue: <IDENTIFIER>
    Plan:
    <paste the full plan here>

    Project root: <current working directory>
    Main repo root: <absolute path to main repo root>

    The Linear API script is at: ~/.claude/skills/linear/scripts/linear-api.ts
    Run it with: source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts <command>

    MANDATORY: You MUST pull latest from main and work in a git worktree.
    Never work directly on main. The skill instructions explain the setup.
```

Same parallelism rules as Step 2. Worktrees are mandatory — each implementation subagent creates its own worktree automatically per `linear-implement` Step 1.

### Step 5: Summary

After all subagents complete:
- Summarize what was implemented
- List any follow-up issues created
- Report any failures or blockers

## Context Strategy

**The orchestrator (you) should hold minimal context:**
- Issue identifiers and one-line summaries only
- Delegate all codebase exploration to subagents
- Delegate all code writing to subagents
- Only hold plan summaries (not full plans) after Step 2

This keeps the main context clean for processing many issues in one session.

## Important

- Always confirm with the user before changing issue status in Linear
- Never auto-close issues — let the user decide when to mark done
- If a subagent encounters blockers, surface them to the user immediately
- Announce write operations (create issue, update status, add comment) before executing them
