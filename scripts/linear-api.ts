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

async function gql(
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
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

  const json = (await res.json()) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };
  if (json.errors) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  return json.data;
}

// --- Helpers ---

function getFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

function parseIdentifier(identifier: string): { teamKey: string; number: number } {
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    console.error(
      `Invalid identifier format: "${identifier}". Expected format: TEAM-123`
    );
    process.exit(1);
  }
  return { teamKey: match[1], number: parseInt(match[2]) };
}

async function resolveIssueId(identifier: string): Promise<string> {
  const { teamKey, number } = parseIdentifier(identifier);
  const data = (await gql(
    `query($teamKey: String!, $number: Float!) {
      issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }) {
        nodes { id }
      }
    }`,
    { teamKey, number }
  )) as { issues: { nodes: Array<{ id: string }> } };

  const issue = data.issues.nodes[0];
  if (!issue) {
    console.error(`Issue "${identifier}" not found.`);
    process.exit(1);
  }
  return issue.id;
}

// --- Commands ---

async function listTeams() {
  const data = (await gql(`
    query { teams { nodes { id name key } } }
  `)) as { teams: { nodes: unknown[] } };
  console.log(JSON.stringify(data.teams.nodes, null, 2));
}

async function listStates(args: string[]) {
  const teamKey = getFlag(args, "--team");

  if (teamKey) {
    const data = (await gql(
      `query($teamKey: String!) {
        teams(filter: { key: { eq: $teamKey } }) {
          nodes { states { nodes { id name type position } } }
        }
      }`,
      { teamKey }
    )) as {
      teams: {
        nodes: Array<{
          states: {
            nodes: Array<{ id: string; name: string; type: string; position: number }>;
          };
        }>;
      };
    };
    const team = data.teams.nodes[0];
    if (!team) {
      console.error(`Team "${teamKey}" not found.`);
      process.exit(1);
    }
    console.log(JSON.stringify(team.states.nodes, null, 2));
  } else {
    const data = (await gql(`
      query { workflowStates { nodes { id name type team { key } } } }
    `)) as { workflowStates: { nodes: unknown[] } };
    console.log(JSON.stringify(data.workflowStates.nodes, null, 2));
  }
}

async function listIssues(args: string[]) {
  const team = getFlag(args, "--team");
  const status = getFlag(args, "--status");
  const assignee = getFlag(args, "--assignee");
  const label = getFlag(args, "--label");
  const limit = getFlag(args, "--limit") || "25";

  const filters: string[] = [];
  if (team) filters.push(`team: { key: { eq: "${team}" } }`);
  if (status) filters.push(`state: { name: { eq: "${status}" } }`);
  if (assignee)
    filters.push(
      `assignee: { name: { containsIgnoreCase: "${assignee}" } }`
    );
  if (label) filters.push(`labels: { some: { name: { eq: "${label}" } } }`);

  const filterClause =
    filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

  const data = (await gql(`
    query {
      issues(first: ${parseInt(limit)}, ${filterClause} orderBy: updatedAt) {
        nodes {
          id identifier title priority priorityLabel
          state { name type }
          assignee { name }
          labels { nodes { name } }
          createdAt updatedAt
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

  const { teamKey, number } = parseIdentifier(identifier);

  const data = (await gql(
    `query($teamKey: String!, $number: Float!) {
      issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }) {
        nodes {
          id identifier title description
          priority priorityLabel
          state { id name type }
          assignee { id name }
          labels { nodes { name } }
          comments { nodes { body user { name } createdAt } }
          parent { identifier title }
          children { nodes { identifier title state { name } } }
          relations { nodes { type relatedIssue { identifier title } } }
          createdAt updatedAt dueDate estimate url
        }
      }
    }`,
    { teamKey, number }
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
    `query($query: String!) {
      searchIssues(query: $query, first: 20) {
        nodes {
          id identifier title priority priorityLabel
          state { name }
          assignee { name }
          labels { nodes { name } }
          updatedAt
        }
      }
    }`,
    { query }
  )) as { searchIssues: { nodes: unknown[] } };

  console.log(JSON.stringify(data.searchIssues.nodes, null, 2));
}

async function createIssue(args: string[]) {
  const title = getFlag(args, "--title");
  const description = getFlag(args, "--description") || "";
  const teamKey = getFlag(args, "--team");
  const priority = getFlag(args, "--priority");
  const labelName = getFlag(args, "--label");

  if (!title || !teamKey) {
    console.error(
      "Usage: create-issue --title <title> --team <KEY> [--description <desc>] [--priority <0-4>] [--label <name>]"
    );
    process.exit(1);
  }

  // Resolve team key to ID
  const teamData = (await gql(
    `query($key: String!) {
      teams(filter: { key: { eq: $key } }) { nodes { id } }
    }`,
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
      `query($name: String!) {
        issueLabels(filter: { name: { eq: $name } }) { nodes { id } }
      }`,
      { name: labelName }
    )) as { issueLabels: { nodes: Array<{ id: string }> } };

    if (labelData.issueLabels.nodes.length > 0) {
      input.labelIds = [labelData.issueLabels.nodes[0].id];
    }
  }

  const data = (await gql(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }`,
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

  const { teamKey, number } = parseIdentifier(identifier);

  // Get the issue ID and its team's workflow states
  const issueData = (await gql(
    `query($teamKey: String!, $number: Float!) {
      issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }) {
        nodes {
          id
          team { states { nodes { id name } } }
        }
      }
    }`,
    { teamKey, number }
  )) as {
    issues: {
      nodes: Array<{
        id: string;
        team: { states: { nodes: Array<{ id: string; name: string }> } };
      }>;
    };
  };

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
    console.error(
      `State "${stateName}" not found. Available: ${available}`
    );
    process.exit(1);
  }

  const data = (await gql(
    `mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { identifier state { name } }
      }
    }`,
    { id: issue.id, input: { stateId: state.id } }
  )) as { issueUpdate: { success: boolean; issue: unknown } };

  console.log(JSON.stringify(data.issueUpdate, null, 2));
}

async function addComment(args: string[]) {
  const identifier = args[0];
  const body = args.slice(1).join(" ");

  if (!identifier || !body) {
    console.error("Usage: add-comment <IDENTIFIER> <comment body>");
    process.exit(1);
  }

  const issueId = await resolveIssueId(identifier);

  const data = (await gql(
    `mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id body createdAt }
      }
    }`,
    { input: { issueId, body } }
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
  list-issues [filters]              List issues with filters
    --team KEY                       Filter by team key
    --status NAME                    Filter by status name
    --assignee NAME                  Filter by assignee name
    --label NAME                     Filter by label name
    --limit N                        Max results (default: 25)
  get-issue <IDENTIFIER>             Get full issue details (e.g., BLU-42)
  search-issues <query>              Full-text search issues
  create-issue [options]             Create a new issue
    --title TITLE                    Issue title (required)
    --team KEY                       Team key (required)
    --description DESC               Issue description
    --priority 0-4                   Priority (0=none, 1=urgent, 4=low)
    --label NAME                     Label name
  update-status <ID> <STATE>         Update issue workflow state
  add-comment <ID> <body>            Add comment to issue`);
  process.exit(1);
}

commands[command](args);
