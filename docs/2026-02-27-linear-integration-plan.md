# Linear Integration Skill — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable Claude Code skill that integrates with Linear's GraphQL API for issue triage, planning, and implementation via subagent workflows.

**Architecture:** A single TypeScript CLI script (`linear-api.ts`) handles all Linear API calls. Four SKILL.md files define the orchestrator and three subagent workflows (triage, plan, implement). All files live in `~/.claude/skills/linear/`.

**Tech Stack:** TypeScript (bun runtime), Linear GraphQL API, zero external dependencies.

---

### Task 1: Write the Linear API Script

**Files:**
- Create: `~/.claude/skills/linear/scripts/linear-api.ts`

**Step 1: Create the CLI script with all subcommands**

Write `~/.claude/skills/linear/scripts/linear-api.ts`:

```typescript
#!/usr/bin/env bun

const API_URL = "https://api.linear.app/graphql";

function getApiKey(): string {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    console.error("Error: LINEAR_API_KEY environment variable is not set.");
    console.error("Get your key at: Linear Settings → API → Create Key");
    console.error('Then: export LINEAR_API_KEY="lin_api_..."');
    process.exit(1);
  }
  return key;
}

async function gql(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getApiKey(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${res.statusText}`);
    process.exit(1);
  }

  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  return json.data;
}

// --- Commands ---

async function listTeams() {
  const data = (await gql(`
    query {
      teams {
        nodes { id name key }
      }
    }
  `)) as { teams: { nodes: Array<{ id: string; name: string; key: string }> } };
  console.log(JSON.stringify(data.teams.nodes, null, 2));
}

async function listStates(args: string[]) {
  const teamFlag = args.indexOf("--team");
  const teamKey = teamFlag !== -1 ? args[teamFlag + 1] : null;

  let query: string;
  let variables: Record<string, unknown> | undefined;

  if (teamKey) {
    query = `
      query($teamKey: String!) {
        teams(filter: { key: { eq: $teamKey } }) {
          nodes {
            states {
              nodes { id name type position }
            }
          }
        }
      }
    `;
    variables = { teamKey };
    const data = (await gql(query, variables)) as {
      teams: { nodes: Array<{ states: { nodes: Array<{ id: string; name: string; type: string; position: number }> } }> };
    };
    const team = data.teams.nodes[0];
    if (!team) {
      console.error(`Team "${teamKey}" not found.`);
      process.exit(1);
    }
    console.log(JSON.stringify(team.states.nodes, null, 2));
  } else {
    query = `
      query {
        workflowStates {
          nodes { id name type team { key } }
        }
      }
    `;
    const data = (await gql(query)) as {
      workflowStates: { nodes: Array<{ id: string; name: string; type: string; team: { key: string } }> };
    };
    console.log(JSON.stringify(data.workflowStates.nodes, null, 2));
  }
}

async function listIssues(args: string[]) {
  const getFlag = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const team = getFlag("--team");
  const status = getFlag("--status");
  const assignee = getFlag("--assignee");
  const label = getFlag("--label");
  const limit = getFlag("--limit") || "25";

  const filters: string[] = [];
  if (team) filters.push(`team: { key: { eq: "${team}" } }`);
  if (status) filters.push(`state: { name: { eq: "${status}" } }`);
  if (assignee) filters.push(`assignee: { name: { containsIgnoreCase: "${assignee}" } }`);
  if (label) filters.push(`labels: { some: { name: { eq: "${label}" } } }`);

  const filterClause = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

  const data = (await gql(`
    query {
      issues(first: ${parseInt(limit)}, ${filterClause} orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          priority
          state { name type }
          assignee { name }
          labels { nodes { name } }
          createdAt
          updatedAt
        }
      }
    }
  `)) as { issues: { nodes: unknown[] } };

  console.log(JSON.stringify(data.issues.nodes, null, 2));
}

async function getIssue(args: string[]) {
  const identifier = args[0];
  if (!identifier) {
    console.error("Usage: get-issue <IDENTIFIER> (e.g., BLU-42)");
    process.exit(1);
  }

  // Parse identifier into team key and number
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    console.error(`Invalid identifier format: "${identifier}". Expected format: TEAM-123`);
    process.exit(1);
  }

  const [, teamKey, numStr] = match;
  const issueNumber = parseInt(numStr);

  const data = (await gql(
    `
    query($teamKey: String!, $number: Float!) {
      issues(filter: {
        team: { key: { eq: $teamKey } }
        number: { eq: $number }
      }) {
        nodes {
          id
          identifier
          title
          description
          priority
          priorityLabel
          state { id name type }
          assignee { id name }
          labels { nodes { name } }
          comments {
            nodes {
              body
              user { name }
              createdAt
            }
          }
          parent { identifier title }
          children { nodes { identifier title state { name } } }
          relations { nodes { type relatedIssue { identifier title } } }
          createdAt
          updatedAt
          dueDate
          estimate
          url
        }
      }
    }
  `,
    { teamKey, number: issueNumber }
  )) as { issues: { nodes: unknown[] } };

  const issue = data.issues.nodes[0];
  if (!issue) {
    console.error(`Issue "${identifier}" not found.`);
    process.exit(1);
  }

  console.log(JSON.stringify(issue, null, 2));
}

async function searchIssues(args: string[]) {
  const query = args.join(" ");
  if (!query) {
    console.error("Usage: search-issues <query>");
    process.exit(1);
  }

  const data = (await gql(
    `
    query($query: String!) {
      searchIssues(query: $query, first: 20) {
        nodes {
          id
          identifier
          title
          priority
          state { name }
          assignee { name }
          labels { nodes { name } }
          updatedAt
        }
      }
    }
  `,
    { query }
  )) as { searchIssues: { nodes: unknown[] } };

  console.log(JSON.stringify(data.searchIssues.nodes, null, 2));
}

async function createIssue(args: string[]) {
  const getFlag = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const title = getFlag("--title");
  const description = getFlag("--description") || "";
  const teamKey = getFlag("--team");
  const priority = getFlag("--priority");
  const labelName = getFlag("--label");

  if (!title || !teamKey) {
    console.error("Usage: create-issue --title <title> --team <TEAM_KEY> [--description <desc>] [--priority <0-4>] [--label <name>]");
    process.exit(1);
  }

  // Resolve team key to ID
  const teamData = (await gql(
    `
    query($key: String!) {
      teams(filter: { key: { eq: $key } }) {
        nodes { id }
      }
    }
  `,
    { key: teamKey }
  )) as { teams: { nodes: Array<{ id: string }> } };

  const team = teamData.teams.nodes[0];
  if (!team) {
    console.error(`Team "${teamKey}" not found.`);
    process.exit(1);
  }

  const input: Record<string, unknown> = {
    title,
    description,
    teamId: team.id,
  };

  if (priority) input.priority = parseInt(priority);

  if (labelName) {
    const labelData = (await gql(
      `
      query($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) {
          nodes { id }
        }
      }
    `,
      { name: labelName }
    )) as { issueLabels: { nodes: Array<{ id: string }> } };

    if (labelData.issueLabels.nodes.length > 0) {
      input.labelIds = [labelData.issueLabels.nodes[0].id];
    }
  }

  const data = (await gql(
    `
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `,
    { input }
  )) as { issueCreate: { success: boolean; issue: unknown } };

  console.log(JSON.stringify(data.issueCreate, null, 2));
}

async function updateStatus(args: string[]) {
  const identifier = args[0];
  const stateName = args[1];

  if (!identifier || !stateName) {
    console.error('Usage: update-status <IDENTIFIER> "<State Name>"');
    process.exit(1);
  }

  // First get the issue to find its team
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    console.error(`Invalid identifier: "${identifier}"`);
    process.exit(1);
  }

  const [, teamKey, numStr] = match;

  // Get the issue ID and its team's workflow states
  const issueData = (await gql(
    `
    query($teamKey: String!, $number: Float!) {
      issues(filter: {
        team: { key: { eq: $teamKey } }
        number: { eq: $number }
      }) {
        nodes {
          id
          team {
            states {
              nodes { id name }
            }
          }
        }
      }
    }
  `,
    { teamKey, number: parseInt(numStr) }
  )) as { issues: { nodes: Array<{ id: string; team: { states: { nodes: Array<{ id: string; name: string }> } } }> } };

  const issue = issueData.issues.nodes[0];
  if (!issue) {
    console.error(`Issue "${identifier}" not found.`);
    process.exit(1);
  }

  const state = issue.team.states.nodes.find(
    (s) => s.name.toLowerCase() === stateName.toLowerCase()
  );
  if (!state) {
    const available = issue.team.states.nodes.map((s) => s.name).join(", ");
    console.error(`State "${stateName}" not found. Available: ${available}`);
    process.exit(1);
  }

  const data = (await gql(
    `
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          identifier
          state { name }
        }
      }
    }
  `,
    { id: issue.id, input: { stateId: state.id } }
  )) as { issueUpdate: { success: boolean; issue: unknown } };

  console.log(JSON.stringify(data.issueUpdate, null, 2));
}

async function addComment(args: string[]) {
  const identifier = args[0];
  const body = args.slice(1).join(" ");

  if (!identifier || !body) {
    console.error('Usage: add-comment <IDENTIFIER> <comment body>');
    process.exit(1);
  }

  // Resolve identifier to issue ID
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    console.error(`Invalid identifier: "${identifier}"`);
    process.exit(1);
  }

  const [, teamKey, numStr] = match;

  const issueData = (await gql(
    `
    query($teamKey: String!, $number: Float!) {
      issues(filter: {
        team: { key: { eq: $teamKey } }
        number: { eq: $number }
      }) {
        nodes { id }
      }
    }
  `,
    { teamKey, number: parseInt(numStr) }
  )) as { issues: { nodes: Array<{ id: string }> } };

  const issue = issueData.issues.nodes[0];
  if (!issue) {
    console.error(`Issue "${identifier}" not found.`);
    process.exit(1);
  }

  const data = (await gql(
    `
    mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
          body
          createdAt
        }
      }
    }
  `,
    { input: { issueId: issue.id, body } }
  )) as { commentCreate: { success: boolean; comment: unknown } };

  console.log(JSON.stringify(data.commentCreate, null, 2));
}

// --- Router ---

const [command, ...args] = process.argv.slice(2);

const commands: Record<string, (args: string[]) => Promise<void>> = {
  "list-teams": () => listTeams(),
  "list-states": listStates,
  "list-issues": listIssues,
  "get-issue": getIssue,
  "search-issues": searchIssues,
  "create-issue": createIssue,
  "update-status": updateStatus,
  "add-comment": addComment,
};

if (!command || !commands[command]) {
  console.error(`Usage: linear-api.ts <command> [args]

Commands:
  list-teams                         List all teams
  list-states [--team KEY]           List workflow states
  list-issues [--team KEY] [--status NAME] [--assignee NAME] [--label NAME] [--limit N]
  get-issue <IDENTIFIER>             Get full issue details (e.g., BLU-42)
  search-issues <query>              Full-text search issues
  create-issue --title T --team KEY [--description D] [--priority 0-4] [--label L]
  update-status <IDENTIFIER> <STATE> Update issue workflow state
  add-comment <IDENTIFIER> <body>    Add comment to issue`);
  process.exit(1);
}

commands[command](args);
```

**Step 2: Make the script executable and test it**

Run: `chmod +x ~/.claude/skills/linear/scripts/linear-api.ts`
Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts` (no args — should print usage)
Expected: Usage text printed to stderr, exit code 1.

**Step 3: Verify API connectivity (requires LINEAR_API_KEY set)**

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts list-teams`
Expected: JSON array of teams. If key not set, error message with instructions.

---

### Task 2: Write the Orchestrator Skill (SKILL.md)

**Files:**
- Create: `~/.claude/skills/linear/SKILL.md`

**Step 1: Write the orchestrator skill**

Write `~/.claude/skills/linear/SKILL.md`:

```markdown
---
name: linear
description: Use when working with Linear issues — browse backlog, triage, plan implementations, and execute. Orchestrates subagents for context-efficient issue processing.
---

# Linear Issue Workflow

## Overview

Orchestrate Linear issue workflows: browse your backlog, pick issues, create implementation plans, and execute them — all while keeping your main context clean via subagents.

## Prerequisites

- `LINEAR_API_KEY` environment variable must be set
- Get your key at: Linear Settings → API → Create Key
- `export LINEAR_API_KEY="lin_api_..."`

## API Script

All Linear API calls go through: `bun ~/.claude/skills/linear/scripts/linear-api.ts <command>`

Available commands:
- `list-teams` — discover teams
- `list-states --team KEY` — workflow states for a team
- `list-issues --team KEY --status NAME --assignee NAME --label NAME --limit N`
- `get-issue IDENTIFIER` — full issue details (e.g., BLU-42)
- `search-issues <query>` — full-text search
- `create-issue --title T --team KEY --description D --priority 0-4 --label L`
- `update-status IDENTIFIER "State Name"`
- `add-comment IDENTIFIER "comment body"`

## Workflow

### Step 1: Determine Scope

Ask the user:
- **Browse backlog**: "Let me look through your issues and help you pick" → Spawn a **linear-triage** subagent
- **Specific issues**: User provides issue IDs (e.g., "BLU-42, BLU-57") → Skip to Step 2

### Step 2: Plan

For each selected issue, spawn a **linear-plan** subagent using the Task tool:

```
Task tool:
  subagent_type: general-purpose
  prompt: |
    You are a Linear planning agent. Read and follow the skill at ~/.claude/skills/linear/linear-plan/SKILL.md

    Issue to plan: <IDENTIFIER>
    Project root: <current working directory>
```

**Parallelism decision:**
- If issues are independent (different areas of codebase) → spawn plan subagents in parallel
- If issues overlap (same files/modules) → run serially
- Ask the user if unsure

### Step 3: Review Plans

Present each plan summary to the user. Get approval before proceeding.

### Step 4: Implement

For each approved plan, spawn a **linear-implement** subagent using the Task tool:

```
Task tool:
  subagent_type: general-purpose
  prompt: |
    You are a Linear implementation agent. Read and follow the skill at ~/.claude/skills/linear/linear-implement/SKILL.md

    Issue: <IDENTIFIER>
    Plan: <paste the plan>
    Project root: <current working directory>
```

Same parallelism rules as Step 2.

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

**This keeps the main context clean for processing many issues in one session.**

## Important

- Always confirm with the user before changing issue status in Linear
- Never auto-close issues — let the user decide when to mark done
- If a subagent encounters blockers, surface them to the user immediately
- Write operations (create issue, update status, add comment) should be announced before execution
```

---

### Task 3: Write the Triage Skill

**Files:**
- Create: `~/.claude/skills/linear/linear-triage/SKILL.md`

**Step 1: Write the triage skill**

Write `~/.claude/skills/linear/linear-triage/SKILL.md`:

```markdown
---
name: linear-triage
description: Browse and filter Linear issues to help the user pick which ones to work on next.
---

# Linear Triage

## Overview

Browse the user's Linear backlog, filter by team/status/label/assignee, and help them select issues to work on. Return selected issues with full context to the orchestrator.

## API Script

`bun ~/.claude/skills/linear/scripts/linear-api.ts <command>`

## Process

### 1. Discover Teams

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts list-teams`

Present the teams to the user and ask which team to focus on.

### 2. Browse Issues

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team <KEY> --status "Todo"`

Start with "Todo" issues. The user can refine with additional filters:
- `--status "In Progress"` / `"Backlog"` / etc.
- `--assignee "Name"`
- `--label "Bug"` / `"Feature"` etc.
- `--limit 50`

### 3. Present Issues

Format issues as a clean table:

```
| #  | ID      | Title                        | Priority | Labels     |
|----|---------|------------------------------|----------|------------|
| 1  | BLU-42  | Fix auth redirect loop       | Urgent   | Bug        |
| 2  | BLU-57  | Add dark mode toggle         | Medium   | Feature    |
| 3  | BLU-63  | Update onboarding flow       | High     | UX         |
```

### 4. Help Select

Ask the user which issues to work on. They can:
- Pick by number from the table
- Search for specific issues: `bun ~/.claude/skills/linear/scripts/linear-api.ts search-issues "auth bug"`
- Ask for more context on a specific issue

### 5. Fetch Full Details

For each selected issue, fetch full details:
Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts get-issue <IDENTIFIER>`

### 6. Return Results

Return the selected issues with their full details (title, description, comments, relations, priority) to the orchestrator for planning.
```

---

### Task 4: Write the Plan Skill

**Files:**
- Create: `~/.claude/skills/linear/linear-plan/SKILL.md`

**Step 1: Write the planning skill**

Write `~/.claude/skills/linear/linear-plan/SKILL.md`:

```markdown
---
name: linear-plan
description: Create a detailed implementation plan for a single Linear issue by analyzing the codebase.
---

# Linear Plan

## Overview

Given a Linear issue identifier, fetch its details, explore the project codebase, and create a detailed implementation plan. Update the issue status and add a comment with the plan summary.

## API Script

`bun ~/.claude/skills/linear/scripts/linear-api.ts <command>`

## Process

### 1. Fetch Issue Details

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts get-issue <IDENTIFIER>`

Parse the response to understand:
- What needs to be done (title + description)
- Any additional context (comments)
- Related issues (parent, children, relations)
- Priority and estimates

### 2. Explore the Codebase

Based on the issue description:
- Use Glob to find relevant files
- Use Grep to search for related code patterns
- Use Read to understand existing implementations
- Identify which files need to change and what the changes should be

### 3. Create Implementation Plan

Write a structured plan:

```
## Plan for <IDENTIFIER>: <Title>

**Summary**: <1-2 sentences>

**Files to modify**:
- `path/to/file.ts` — <what changes>
- `path/to/other.ts` — <what changes>

**New files**:
- `path/to/new-file.ts` — <purpose>

**Steps**:
1. <Specific actionable step>
2. <Specific actionable step>
3. ...

**Tests**:
- <What tests to write/update>

**Risks/Notes**:
- <Anything the implementer should know>
```

### 4. Update Linear

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts update-status <IDENTIFIER> "In Progress"`
Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts add-comment <IDENTIFIER> "Implementation plan created by Claude Code. Summary: <1-2 sentences>"`

### 5. Return Plan

Return the full plan text to the orchestrator for user review.
```

---

### Task 5: Write the Implement Skill

**Files:**
- Create: `~/.claude/skills/linear/linear-implement/SKILL.md`

**Step 1: Write the implementation skill**

Write `~/.claude/skills/linear/linear-implement/SKILL.md`:

```markdown
---
name: linear-implement
description: Execute an implementation plan for a single Linear issue — write code, run checks, update Linear.
---

# Linear Implement

## Overview

Given an implementation plan for a Linear issue, execute it step by step: write code, run tests/checks, and update the Linear issue with progress.

## API Script

`bun ~/.claude/skills/linear/scripts/linear-api.ts <command>`

## Process

### 1. Understand the Plan

Read the provided implementation plan carefully. Identify:
- Files to modify/create
- Order of operations
- Tests to write
- Any dependencies between steps

### 2. Implement

Execute the plan step by step:
- Write code changes using Edit/Write tools
- Follow existing code patterns and conventions
- Keep changes minimal and focused on the issue

### 3. Run Checks

After implementation, run the project's check command. Common patterns:
- `bun run check` (if available)
- `npm run lint && npm run typecheck`
- `bun test`

Check `package.json` for the project's specific commands.

Fix any errors before proceeding.

### 4. Handle Discoveries

If you find bugs or tech debt while implementing:

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts create-issue --title "Found during <IDENTIFIER>: <description>" --team <TEAM_KEY> --priority 3 --label "Tech Debt"`

Report created issues in your summary.

### 5. Update Linear

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts add-comment <IDENTIFIER> "Implementation complete. Changes: <summary of what was changed>"`

**Do NOT auto-close the issue.** Let the orchestrator/user decide when to mark done.

### 6. Return Summary

Return to the orchestrator:
- What was implemented (files changed, approach taken)
- Any tests written
- Any follow-up issues created
- Any blockers or concerns
- Whether checks passed
```

---

### Task 6: Test the Full Workflow

**Step 1: Verify script runs without errors**

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts`
Expected: Usage text, exit code 1.

**Step 2: Verify API connectivity (if LINEAR_API_KEY is set)**

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts list-teams`
Expected: JSON array of teams.

**Step 3: Test a read operation**

Run: `bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team <KEY> --limit 5`
Expected: JSON array of up to 5 issues.

**Step 4: Verify skills are discoverable by Claude Code**

Start a new Claude Code session and check that the skills appear:
- `linear` — main orchestrator
- `linear-triage` — browse issues
- `linear-plan` — plan implementation
- `linear-implement` — execute plan

**Step 5: End-to-end test**

Run: `/linear` in Claude Code and verify the orchestrator workflow starts correctly.
