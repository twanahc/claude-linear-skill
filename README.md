# Claude Code Linear Skill

A Claude Code skill for working with Linear issues directly from your terminal — browse your backlog, triage, plan implementations, and execute, all through natural conversation.

## Why a Skill Instead of MCP?

There are broadly two ways to give Claude Code access to external services: **MCP servers** and **skills**. This project takes the skill approach, and it's a deliberate choice.

### How MCP Works

An MCP (Model Context Protocol) server registers tools globally. Once configured, every single turn of every conversation includes the tool definitions in the context — whether you're working on Linear issues or not. For a service like Linear with 8+ operations, that's a meaningful chunk of tokens consumed on every API call, even when you're just asking Claude to fix a typo.

### How This Skill Works

The skill is only loaded when invoked (`/linear`). When it's not active, it costs zero tokens. The orchestrator skill spawns **subagents** for each phase (triage, planning, implementation), so the main conversation context stays clean even when processing many issues in a single session.

### Trade-offs

| | MCP Server | Skill |
|---|---|---|
| **Always available** | Yes — tools are always registered | No — must invoke `/linear` |
| **Context cost** | Constant — tool defs included every turn | Zero when not in use |
| **Multi-issue sessions** | Context fills up fast | Subagents keep main context lean |
| **Setup** | Configure in `settings.json`, run a server process | Drop files in `~/.claude/skills/` |
| **Complexity** | Needs a running server, JSON-RPC protocol | Just a TypeScript script + markdown |
| **Discoverability** | Tools auto-appear in Claude's tool list | User must know to invoke `/linear` |
| **Flexibility** | Rigid tool schemas | Markdown instructions — easy to customize workflows |

**The short version:** MCP is better if you want Linear tools passively available at all times. A skill is better if you want zero overhead until you need it, and want to process multiple issues without running out of context.

## Architecture

```
linear/
├── SKILL.md                    # Orchestrator — routes to subagents
├── linear-triage/
│   └── SKILL.md                # Browse & filter issues, help user pick work
├── linear-plan/
│   └── SKILL.md                # Analyze codebase, create implementation plan
├── linear-implement/
│   └── SKILL.md                # Execute plan, run checks, update Linear
├── linear-propose/
│   └── SKILL.md                # Scan codebase, suggest improvements as issues
└── scripts/
    └── linear-api.ts           # GraphQL CLI client (zero dependencies)
```

**Orchestrator** delegates to four specialized subagents:

1. **Triage** — discovers teams, filters issues by status/assignee/label, presents a selection table
2. **Propose** — scans the codebase for improvements, bugs, and tech debt; deduplicates against existing issues; returns proposals for the user to approve
3. **Plan** — fetches issue details, explores the codebase, writes a structured implementation plan, updates Linear status
4. **Implement** — executes the plan step by step in a git worktree, runs project checks, creates follow-up issues for discovered tech debt

Each subagent runs in its own context window, so the orchestrator stays lean. Independent issues can be planned and implemented in parallel.

## Setup

### 1. Get a Linear API Key

Linear Settings → API → Create Key

### 2. Set the Environment Variable

```bash
export LINEAR_API_KEY="lin_api_..."
```

Add this to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.) so it persists.

### 3. Install the Skill

```bash
# Clone into your Claude Code skills directory
git clone https://github.com/twanahc/claude-linear-skill.git ~/.claude/skills/linear
```

### 4. Verify

Start a Claude Code session and run `/linear`. The orchestrator should ask whether you want to browse your backlog or work on specific issues.

## The API Script

`scripts/linear-api.ts` is a single TypeScript file with zero external dependencies. It uses native `fetch()` against Linear's GraphQL API. Run it with [Bun](https://bun.sh).

### Commands

```
list-teams                              List all teams
list-projects [--team KEY]              List projects (optionally by team)
list-states [--team KEY]                List workflow states
list-issues [filters]                   List issues with filters
  --team KEY                            Filter by team
  --status NAME                         Filter by status
  --assignee NAME                       Filter by assignee
  --label NAME                          Filter by label
  --limit N                             Max results (default: 25)
get-issue <IDENTIFIER>                  Full issue details (e.g., BLU-42)
search-issues <query>                   Full-text search
create-issue [options]                  Create a new issue
  --title TITLE                         Required
  --team KEY                            Required
  --description DESC
  --priority 0-4                        0=none, 1=urgent, 4=low
  --label NAME
  --project NAME                        Project name (fuzzy match)
  --assignee NAME                       Assignee name (fuzzy match)
  --parent IDENTIFIER                   Parent issue for sub-issues
update-issue <IDENTIFIER> [options]     Update an existing issue
  --title TITLE                         New title
  --description DESC                    New description
  --priority 0-4                        New priority
  --label NAME                          Set label
  --project NAME                        Set project (fuzzy match)
  --assignee NAME                       Set assignee (fuzzy match)
update-status <IDENTIFIER> <STATE>      Move issue to workflow state
add-comment <IDENTIFIER> <body>         Add comment to issue
```

All output is JSON to stdout. Errors go to stderr with non-zero exit codes.

### Direct Usage

You can also use the script standalone, outside of Claude Code:

```bash
# List your teams
bun ~/.claude/skills/linear/scripts/linear-api.ts list-teams

# Find urgent bugs
bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team ENG --label "Bug" --limit 10

# Get full details on an issue
bun ~/.claude/skills/linear/scripts/linear-api.ts get-issue ENG-42
```

## Workflow

```
/linear
  │
  ├─ "Browse my backlog" ──→ Triage subagent ──→ User picks issues
  │                                                      │
  ├─ "Suggest improvements" ──→ Propose subagent ──→ User approves ──→ Issues created
  │                                                                          │
  └─ "Work on ENG-42, ENG-57" ──────────────────────────────────────────────┘
                                                                             │
                                                                 Plan subagent(s)
                                                              (parallel if independent)
                                                                             │
                                                                 User reviews plans
                                                                             │
                                                              Implement subagent(s)
                                                              (parallel if independent)
                                                                             │
                                                                 Summary of changes
```

## Customization

These are markdown files — edit them to match your workflow. Some ideas:

- Change the planning format to match your team's conventions
- Add a code review step between plan and implement
- Modify the triage table to show different fields
- Add custom filters for your team's label taxonomy
- Change status transitions to match your workflow states

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- A [Linear](https://linear.app) account with API access

## License

MIT
