---
name: linear-propose
description: Analyze codebase to propose improvements, features, and fixes as Linear issues.
---

# Linear Propose

## Overview

Explore the project codebase to identify improvements, missing features, bugs, and tech debt. Present proposals to the user and create approved ones as Linear issues.

## API Script

```bash
bun ~/.claude/skills/linear/scripts/linear-api.ts <command>
```

## Process

### 1. Understand Scope

Check if the user specified a focus area (e.g., "performance", "UX", "security", a specific directory). If not, do a broad sweep.

### 2. Explore the Codebase

Systematically scan:

- **Structure**: `package.json`, directory layout, config files, routing
- **Entry points**: pages, routes, API endpoints
- **Components & hooks**: reusability, consistency, missing abstractions
- **Error handling**: missing try/catch, unhandled promise rejections, missing error boundaries
- **Test coverage**: untested critical paths, missing edge case tests
- **Performance**: heavy renders, missing memoization, N+1 queries, large bundles, unnecessary re-renders
- **Security**: exposed secrets, missing input validation, XSS/injection vectors, auth gaps
- **Accessibility**: missing ARIA attributes, keyboard navigation, screen reader support
- **UX patterns**: missing loading states, error states, empty states, optimistic updates
- **Code quality**: duplication, dead code, outdated dependencies, inconsistent patterns

Use Glob, Grep, and Read tools to explore. Be thorough but focused.

### 3. Cross-Reference Existing Issues

Fetch existing issues to avoid proposing duplicates:

```bash
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts list-issues --team <KEY> --limit 50
source ~/.bashrc && bun ~/.claude/skills/linear/scripts/linear-api.ts search-issues "<keyword>"
```

Skip proposals that overlap with existing issues.

### 4. Categorize & Prioritize Proposals

Group findings into categories:

| Category | Label | Description |
|----------|-------|-------------|
| Bug | Bug | Something broken or behaving incorrectly |
| Performance | Performance | Optimization opportunities |
| Feature | Feature | Missing functionality the architecture suggests |
| Tech Debt | Tech Debt | Code quality, duplication, outdated patterns |
| Security | Security | Vulnerabilities or hardening opportunities |
| Accessibility | Accessibility | A11y improvements |
| UX | UX | User experience gaps |

For each proposal, include:

```markdown
### <Title> [<Category>]

**Priority**: 1-Urgent / 2-High / 3-Medium / 4-Low
**Effort**: S / M / L
**Files**: `path/to/file.ts`, `path/to/other.ts`

**Problem**: What's wrong or missing — be specific, reference code locations.
**Suggestion**: Recommended approach to fix/improve.
```

### 5. Return Proposals

Return all proposals as a structured list to the orchestrator. The orchestrator will present them and let the user pick which to create as Linear issues.

## Key Principles

- **Be specific**: Reference exact file paths, function names, and line numbers
- **Be actionable**: Each proposal should be implementable as a single Linear issue
- **Avoid noise**: Don't propose trivial style nits or subjective preferences
- **Respect existing patterns**: Proposals should work within the project's conventions, not against them
- **Deduplicate**: Always check existing Linear issues before proposing
