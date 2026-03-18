/**
 * Help text for all commands
 */

import { c } from './colors.js';
import { VERSION } from './config.js';

export function printHelp(command?: string) {
  if (command) {
    const subHelp: Record<string, string> = {
      store: `${c.bold}memoclaw store${c.reset} "content" [options]

Store a memory. Content can be provided as a positional argument,
via --content flag, or piped via stdin.

  ${c.dim}memoclaw store "Hello world"${c.reset}
  ${c.dim}memoclaw store --content "Hello world"${c.reset}
  ${c.dim}echo "Hello world" | memoclaw store${c.reset}

Batch mode (pipe multiple memories):
  ${c.dim}echo -e "memory one\\nmemory two" | memoclaw store --batch${c.reset}
  ${c.dim}echo '["first","second"]' | memoclaw store --batch${c.reset}
  ${c.dim}cat memories.json | memoclaw store --batch${c.reset}  (JSON array of objects)

Options:
  --batch                Read multiple memories from stdin (one per line or JSON array)
  --content <text>       Memory content (alternative to positional arg)
  --importance <0-1>     Importance score (default: 0.5)
  --tags <tag1,tag2>     Comma-separated tags
  --namespace <name>     Memory namespace
  --memory-type <type>   Memory type (e.g. core, episodic, semantic)
  --immutable            Lock memory from future modifications
  --pinned               Pin the memory
  --session-id <id>      Session identifier for tracking
  --agent-id <id>        Agent identifier for multi-agent setups
  --expires-at <date>    Expiration date (ISO 8601)
  --file <path>          Read content from a file
  --id-only              Print only the memory ID (for scripting)`,

      search: `${c.bold}memoclaw search${c.reset} "query" [options]

Free text search (no embeddings cost). Use this for exact/keyword matching.
For semantic similarity search, use \`recall\` instead.

Options:
  --limit <n>            Max results (default: 10)
  --namespace <name>     Filter by namespace
  --tags <tag1,tag2>     Filter by tags
  --since <date>         Only memories created after date (ISO 8601 or 1h/7d/2w/1mo/1y)
  --until <date>         Only memories created before date
  --sort-by <field>      Sort by field (id, importance, created, updated)
  --reverse              Reverse sort order
  --format <fmt>         Output format: json, csv, tsv, yaml
  --raw                  Output content only (for piping)`,

      context: `${c.bold}memoclaw context${c.reset} "query" [options]

Get a GPT-powered contextual summary from your memories.
Uses GPT-4o-mini + embeddings. Costs $0.01 per call.

  ${c.dim}memoclaw context "What do I know about project X?"${c.reset}

Options:
  --namespace <name>     Filter by namespace
  --limit <n>            Max memories to consider`,

      recall: `${c.bold}memoclaw recall${c.reset} "query" [options]

Search memories by semantic similarity.

Options:
  --limit <n>            Max results (default: 10)
  --min-similarity <0-1> Similarity threshold (default: 0.5)
  --namespace <name>     Filter by namespace
  --tags <tag1,tag2>     Filter by tags
  --since <date>         Only memories created after date (ISO 8601 or 1h/7d/2w/1mo/1y)
  --until <date>         Only memories created before date
  --sort-by <field>      Sort by field (id, importance, created, updated, similarity)
  --reverse              Reverse sort order
  --raw                  Output content only (for piping)
  --watch                Watch for changes (continuous polling)
  --watch-interval <ms>  Polling interval (default: 5000)`,

      list: `${c.bold}memoclaw list${c.reset} [options]

List all memories in a table format.

Options:
  --limit <n>            Max results (default: 20)
  --offset <n>           Pagination offset
  --namespace <name>     Filter by namespace
  --since <date>         Only memories created after date (ISO 8601 or 1h/7d/2w/1mo/1y)
  --until <date>         Only memories created before date
  --sort-by <field>      Sort by field (id, importance, created, updated)
  --reverse              Reverse sort order
  --memory-type <type>   Filter by memory type
  --agent-id <id>        Filter by agent ID
  --session-id <id>      Filter by session ID
  --columns <cols>       Select columns (id,content,importance,tags,created)
  --wide                 Use wider columns in table output
  --pinned               Filter pinned memories only
  --immutable            Filter immutable memories only
  --raw                  Output content only (for piping)
  --watch                Watch for changes (continuous polling)
  --watch-interval <ms>  Polling interval (default: 5000)

Examples:
  ${c.dim}memoclaw list --since 7d${c.reset}              Last 7 days
  ${c.dim}memoclaw list --since 1h${c.reset}              Last hour
  ${c.dim}memoclaw list --since 2025-01-01${c.reset}      Since Jan 1, 2025
  ${c.dim}memoclaw list --since 7d --until 1d${c.reset}   Between 7 and 1 day ago`,

      export: `${c.bold}memoclaw export${c.reset} [options]

Export all memories as JSON. Useful for backups.

  ${c.dim}memoclaw export > backup.json${c.reset}
  ${c.dim}memoclaw export -O backup.json${c.reset}
  ${c.dim}memoclaw export --namespace project1 -O project1.json${c.reset}
  ${c.dim}memoclaw export --format csv -O backup.csv${c.reset}
  ${c.dim}memoclaw export --since 30d -O recent.json${c.reset}
  ${c.dim}memoclaw export --tags important,project-x -O tagged.json${c.reset}

Options:
  -O, --output <path>    Write directly to a file (instead of stdout)
  --namespace <name>     Filter by namespace
  --tags <tag1,tag2>     Filter by tags (comma-separated)
  --since <date>         Only memories created after date (ISO 8601 or 1h/7d/2w/1mo/1y)
  --until <date>         Only memories created before date
  --limit <n>            Max per page (default: 1000)
  --format <fmt>         Output format: json, csv, tsv, yaml`,

      import: `${c.bold}memoclaw import${c.reset} [options]

Import memories from JSON file or stdin.

  ${c.dim}memoclaw import --file backup.json${c.reset}
  ${c.dim}cat backup.json | memoclaw import${c.reset}
  ${c.dim}memoclaw import --file backup.json --concurrency 4${c.reset}

Options:
  --file <path>          JSON file to import
  --namespace <name>     Override namespace for all memories
  -c, --concurrency <n>  Parallel batch imports (default: 1)
  -q, --quiet            Suppress progress output`,

      stats: `${c.bold}memoclaw stats${c.reset} [options]

Show memory statistics and account info.

Options:
  --namespace <name>     Filter by namespace`,

      get: `${c.bold}memoclaw get${c.reset} <id> [options]

Retrieve a single memory by its ID.
Shows all fields including importance, tags, type, expiry, session/agent IDs.

  ${c.dim}memoclaw get abc123${c.reset}
  ${c.dim}memoclaw get abc123 --raw | wc -c${c.reset}
  ${c.dim}memoclaw get abc123 --raw | memoclaw update abc123${c.reset}

Options:
  --raw                  Output content only (for piping)`,

      config: `${c.bold}memoclaw config${c.reset} [show|check|init|path]

Show or validate your MemoClaw configuration.

Subcommands:
  show       Display current configuration (default)
  check      Validate configuration and test API connectivity
  init       Create a sample YAML config file at ~/.memoclaw/config
  path       Print the config file path`,

      update: `${c.bold}memoclaw update${c.reset} <id> [options]

Update a memory by ID.

  ${c.dim}memoclaw update abc123 --content "New content"${c.reset}
  ${c.dim}memoclaw update abc123 --file updated.txt${c.reset}
  ${c.dim}memoclaw update abc123 --importance 0.9 --tags "urgent,fix"${c.reset}
  ${c.dim}cat updated.txt | memoclaw update abc123${c.reset}

Options:
  --content <text>       New content
  --file <path>          Read new content from a file
  --importance <0-1>     New importance score
  --tags <tag1,tag2>     New tags
  --memory-type <type>   Memory type
  --namespace <name>     Move to namespace
  --expires-at <date>    Expiration date
  --pinned <true|false>  Pin/unpin memory
  --session-id <id>      Session identifier
  --agent-id <id>        Agent identifier`,

      delete: `${c.bold}memoclaw delete${c.reset} <id>

Delete a memory by ID.

  ${c.dim}memoclaw delete abc123${c.reset}`,

      pin: `${c.bold}memoclaw pin${c.reset} <id>

Pin a memory. Shorthand for: memoclaw update <id> --pinned true

  ${c.dim}memoclaw pin abc123${c.reset}
  ${c.dim}memoclaw pin abc123 --json${c.reset}`,

      unpin: `${c.bold}memoclaw unpin${c.reset} <id>

Unpin a memory. Shorthand for: memoclaw update <id> --pinned false

  ${c.dim}memoclaw unpin abc123${c.reset}
  ${c.dim}memoclaw unpin abc123 --json${c.reset}`,

      lock: `${c.bold}memoclaw lock${c.reset} <id>

Lock a memory (make immutable). Shorthand for: memoclaw update <id> --immutable true

  ${c.dim}memoclaw lock abc123${c.reset}
  ${c.dim}memoclaw lock abc123 --json${c.reset}`,

      unlock: `${c.bold}memoclaw unlock${c.reset} <id>

Unlock a memory (make mutable). Shorthand for: memoclaw update <id> --immutable false

  ${c.dim}memoclaw unlock abc123${c.reset}
  ${c.dim}memoclaw unlock abc123 --json${c.reset}`,

      edit: `${c.bold}memoclaw edit${c.reset} <id> [options]

Open a memory's content in your editor for interactive editing.
Uses $EDITOR, $VISUAL, or falls back to vi.

  ${c.dim}memoclaw edit abc123${c.reset}
  ${c.dim}memoclaw edit abc123 --editor vim${c.reset}
  ${c.dim}EDITOR=nano memoclaw edit abc123${c.reset}

Options:
  --editor <cmd>         Override editor (default: $EDITOR or vi)

Notes:
  - Refuses to edit immutable (locked) memories
  - Warns if memory is pinned (but allows editing)
  - Only updates if content actually changed`,

      watch: `${c.bold}memoclaw watch${c.reset} [options]

Watch for new memories in real-time. Polls the API and streams
new memories to stdout as they appear.

  ${c.dim}memoclaw watch${c.reset}
  ${c.dim}memoclaw watch --namespace myproject${c.reset}
  ${c.dim}memoclaw watch --tags important${c.reset}
  ${c.dim}memoclaw watch --interval 5${c.reset}
  ${c.dim}memoclaw watch --json | jq 'select(.importance > 0.8)'${c.reset}

Options:
  --namespace <ns>       Watch specific namespace
  --tags <tags>          Filter by tags (comma-separated)
  --interval <seconds>   Poll interval (default: 3)
  --json                 Output JSON lines (for piping)`,

      copy: `${c.bold}memoclaw copy${c.reset} <id> [options]

Duplicate an existing memory. The new memory gets a fresh ID and is mutable
by default, even if the source was immutable.

  ${c.dim}memoclaw copy abc123${c.reset}
  ${c.dim}memoclaw copy abc123 --namespace other-project${c.reset}
  ${c.dim}memoclaw copy abc123 --importance 0.9 --tags new-tag${c.reset}

Options:
  --namespace <name>     Target namespace (default: same as source)
  --importance <0-1>     Override importance score
  --tags <tag1,tag2>     Override tags
  --memory-type <type>   Override memory type
  --id-only              Print only the new memory ID (for scripting)`,

      move: `${c.bold}memoclaw move${c.reset} [<id> ...] --namespace <target> [filters]

Move one or more memories to a different namespace.
IDs can be provided as arguments, piped via stdin, or resolved from filter flags.

  ${c.dim}memoclaw move abc123 --namespace production${c.reset}
  ${c.dim}memoclaw move abc123 def456 --namespace archive${c.reset}
  ${c.dim}memoclaw move --from-namespace old-project --namespace archive${c.reset}
  ${c.dim}memoclaw move --tags stale --namespace archive${c.reset}
  ${c.dim}memoclaw move --from-namespace staging --since 30d --namespace recent${c.reset}
  ${c.dim}memoclaw list --namespace staging --json | jq -r '.memories[].id' | memoclaw move --namespace production${c.reset}

Options:
  --namespace <name>        Target namespace (required)
  --from-namespace <name>   Select memories from this namespace
  --tags <t1,t2>            Select memories matching these tags
  --since <date>            Select memories created after date (ISO 8601 or relative: 1h, 7d, 2w, 1mo, 1y)
  --until <date>            Select memories created before date`,

      'bulk-delete': `${c.bold}memoclaw bulk-delete${c.reset} <id1> <id2> ...

Delete multiple memories at once. IDs can be provided as arguments
or piped via stdin (newline, comma, or space-separated).

  ${c.dim}memoclaw bulk-delete abc123 def456 ghi789${c.reset}
  ${c.dim}echo "abc123,def456" | memoclaw bulk-delete${c.reset}
  ${c.dim}memoclaw list --json | jq -r '.memories[].id' | memoclaw bulk-delete${c.reset}`,

      ingest: `${c.bold}memoclaw ingest${c.reset} [options]

Ingest raw text and automatically extract memories from it.
Uses GPT-4o-mini + embeddings. Costs $0.01 per call.

  ${c.dim}echo "Meeting notes..." | memoclaw ingest${c.reset}
  ${c.dim}memoclaw ingest --text "Long text to extract memories from"${c.reset}
  ${c.dim}memoclaw ingest --file meeting-notes.txt${c.reset}

Options:
  --text <text>          Text to ingest (or pipe via stdin)
  --file <path>          Read text from a file
  --namespace <name>     Target namespace
  --session-id <id>      Session identifier
  --agent-id <id>        Agent identifier
  --auto-relate          Auto-create relations (default: true)`,

      extract: `${c.bold}memoclaw extract${c.reset} "text" [options]

Extract memories from text without storing them.
Uses GPT-4o-mini + embeddings. Costs $0.01 per call.

  ${c.dim}memoclaw extract "User prefers dark mode and uses vim"${c.reset}
  ${c.dim}memoclaw extract --file conversation.txt${c.reset}
  ${c.dim}echo "conversation..." | memoclaw extract${c.reset}

Options:
  --file <path>          Read text from a file
  --namespace <name>     Target namespace
  --session-id <id>      Session identifier
  --agent-id <id>        Agent identifier`,

      consolidate: `${c.bold}memoclaw consolidate${c.reset} [options]

Merge similar/duplicate memories. Costs $0.01 per call.

  ${c.dim}memoclaw consolidate${c.reset}
  ${c.dim}memoclaw consolidate --dry-run${c.reset}
  ${c.dim}memoclaw consolidate --min-similarity 0.9${c.reset}

Options:
  --namespace <name>     Filter by namespace
  --min-similarity <0-1> Similarity threshold for merging
  --mode <mode>          Consolidation mode
  --dry-run              Preview without applying changes`,

      relations: `${c.bold}memoclaw relations${c.reset} <list|create|delete> [args]

Manage memory relations.

  ${c.dim}memoclaw relations list <memory-id>${c.reset}
  ${c.dim}memoclaw relations create <memory-id> <target-id> <type>${c.reset}
  ${c.dim}memoclaw relations delete <memory-id> <relation-id>${c.reset}

Relation types: related_to, derived_from, contradicts, supersedes, supports`,

      suggested: `${c.bold}memoclaw suggested${c.reset} [options]

Get memories suggested for review (stale, decaying, etc.).

Options:
  --limit <n>            Max results
  --namespace <name>     Filter by namespace
  --category <name>      Filter by category (stale, fresh, hot, decaying)`,

      migrate: `${c.bold}memoclaw migrate${c.reset} <path> [options]

Import .md files as memories. Useful for migrating from MEMORY.md
or other markdown-based memory systems.

  ${c.dim}memoclaw migrate ~/notes/${c.reset}
  ${c.dim}memoclaw migrate MEMORY.md${c.reset}
  ${c.dim}memoclaw migrate . --namespace imported${c.reset}
  ${c.dim}memoclaw migrate ~/notes/ --concurrency 4${c.reset}

Automatically skips node_modules, .git, and other common directories.

Options:
  --namespace <name>     Target namespace for imported memories
  -c, --concurrency <n>  Parallel batch imports (default: 1)
  -q, --quiet            Suppress progress output`,

      init: `${c.bold}memoclaw init${c.reset} [options]

Generate a new wallet and initialize MemoClaw config.
Creates ~/.memoclaw/config.json with a fresh private key.

  ${c.dim}memoclaw init${c.reset}
  ${c.dim}memoclaw init --force${c.reset}
  ${c.dim}memoclaw init --url https://custom-api.example.com${c.reset}

Options:
  --force                Overwrite existing config
  --url <url>            Custom API URL`,

      browse: `${c.bold}memoclaw browse${c.reset} [options]

Interactive memory browser (REPL). Explore, search, and manage
memories in a persistent session.

Options:
  --namespace <name>     Filter by namespace

Commands inside browser: list, get, recall, store, delete, stats, next, prev`,

      graph: `${c.bold}memoclaw graph${c.reset} <id>

Show an ASCII tree of a memory and its relations.

Options:
  --json                 Output as JSON`,

      purge: `${c.bold}memoclaw purge${c.reset} [options]

Delete ALL memories. Requires confirmation or --force.

  ${c.dim}memoclaw purge --force${c.reset}
  ${c.dim}memoclaw purge --namespace old-project --force${c.reset}

Options:
  --force                Skip confirmation prompt
  --namespace <name>     Only purge memories in namespace`,

      count: `${c.bold}memoclaw count${c.reset} [options]

Print the total number of memories (pipe-friendly).

  ${c.dim}memoclaw count${c.reset}
  ${c.dim}memoclaw count --namespace project1${c.reset}

Options:
  --namespace <name>     Count only in namespace`,

      completions: `${c.bold}memoclaw completions${c.reset} <bash|zsh|fish>

Generate shell completion scripts.

  ${c.dim}eval "$(memoclaw completions bash)"${c.reset}
  ${c.dim}eval "$(memoclaw completions zsh)"${c.reset}
  ${c.dim}memoclaw completions fish > ~/.config/fish/completions/memoclaw.fish${c.reset}`,

      core: `${c.bold}memoclaw core${c.reset} [options]

List core memories (FREE — no embeddings cost).

Core memories are high-importance, foundational memories that define
key facts, preferences, or identity. This endpoint is free to call.

  ${c.dim}memoclaw core${c.reset}
  ${c.dim}memoclaw core --namespace project1${c.reset}
  ${c.dim}memoclaw core --limit 5 --json${c.reset}
  ${c.dim}memoclaw core --raw | head -5${c.reset}
  ${c.dim}memoclaw core --since 7d${c.reset}
  ${c.dim}memoclaw core --since 2025-01-01 --until 2025-06-01${c.reset}

Options:
  --limit <n>            Max results
  --namespace <name>     Filter by namespace
  --since <date>         Only memories after date (ISO or relative: 7d, 2w, 1mo)
  --until <date>         Only memories before date
  --raw                  Output content only (for piping)`,

      history: `${c.bold}memoclaw history${c.reset} <id>

View the change history for a memory (FREE).

  ${c.dim}memoclaw history 550e8400-e29b-41d4-a716-446655440000${c.reset}
  ${c.dim}memoclaw history abc123 --json${c.reset}`,

      diff: `${c.bold}memoclaw diff${c.reset} <id> [options]

Show content changes between memory versions (unified diff).
Uses the history endpoint (FREE — no cost).

  ${c.dim}memoclaw diff abc123${c.reset}                  Diff latest vs previous
  ${c.dim}memoclaw diff abc123 --revision 2${c.reset}     Show revision 2 changes
  ${c.dim}memoclaw diff abc123 --all${c.reset}            Show all diffs in sequence
  ${c.dim}memoclaw diff abc123 --json${c.reset}           Machine-readable output

Options:
  --revision <n>         Show specific revision diff
  --all                  Show all diffs in sequence
  --json                 JSON output`,

      whoami: `${c.bold}memoclaw whoami${c.reset}

Print your wallet address. Useful for scripting.

  ${c.dim}memoclaw whoami${c.reset}
  ${c.dim}WALLET=$(memoclaw whoami)${c.reset}
  ${c.dim}memoclaw whoami --json${c.reset}`,

      upgrade: `${c.bold}memoclaw upgrade${c.reset} [options]

Check for and install CLI updates from npm.

  ${c.dim}memoclaw upgrade${c.reset}              Check and prompt to install
  ${c.dim}memoclaw upgrade --yes${c.reset}         Auto-install without prompting
  ${c.dim}memoclaw upgrade --check${c.reset}       Check only, don't install

Options:
  --check                Just check for updates (don't install)
  --yes, -y              Auto-install without prompting
  --json                 Machine-readable output`,

      tags: `${c.bold}memoclaw tags${c.reset} [list]

List all unique tags across your memories (FREE — no cost).

  ${c.dim}memoclaw tags${c.reset}
  ${c.dim}memoclaw tags list${c.reset}
  ${c.dim}memoclaw tags --namespace project1${c.reset}
  ${c.dim}memoclaw tags --json${c.reset}

Options:
  --namespace <name>     Filter by namespace
  --format <fmt>         Output format: json, csv, tsv, yaml`,

      alias: `${c.bold}memoclaw alias${c.reset} <set|list|rm> [args]

Manage human-readable shortcuts for memory IDs.
Aliases are stored locally in ~/.memoclaw/aliases.json (free, no API calls).

Subcommands:
  set <name> <id>    Create or update an alias
  list               List all aliases with memory previews
  rm <name>          Remove an alias

  ${c.dim}memoclaw alias set project-ctx abc12345-6789-...${c.reset}
  ${c.dim}memoclaw alias list${c.reset}
  ${c.dim}memoclaw alias rm project-ctx${c.reset}

Use aliases anywhere a memory ID is expected:
  ${c.dim}memoclaw get @project-ctx${c.reset}
  ${c.dim}memoclaw update @project-ctx --content "updated context"${c.reset}
  ${c.dim}memoclaw history @project-ctx${c.reset}
  ${c.dim}memoclaw diff @project-ctx${c.reset}`,

      snapshot: `${c.bold}memoclaw snapshot${c.reset} <create|list|restore|delete> [options]

Point-in-time namespace backups. Create snapshots before destructive
operations like purge or consolidate.

Subcommands:
  create [--name <label>] [--namespace <ns>]   Create a snapshot
  list                                          List all snapshots
  restore <name> [--namespace <ns>] [--dry-run] Restore from a snapshot
  delete <name>                                 Delete a snapshot

Restore flags:
  --namespace <ns>   Remap all memories to a different namespace
  --dry-run, -d      Preview what would be restored without importing

  ${c.dim}memoclaw snapshot create${c.reset}
  ${c.dim}memoclaw snapshot create --name before-purge --namespace project1${c.reset}
  ${c.dim}memoclaw snapshot list${c.reset}
  ${c.dim}memoclaw snapshot restore before-purge${c.reset}
  ${c.dim}memoclaw snapshot restore before-purge --namespace staging${c.reset}
  ${c.dim}memoclaw snapshot restore before-purge --dry-run${c.reset}
  ${c.dim}memoclaw snapshot delete before-purge${c.reset}

Snapshots are stored locally at ~/.memoclaw/snapshots/.
Create is free (uses export). Restore uses the import path (paid).`,

      namespace: `${c.bold}memoclaw namespace${c.reset} [list|stats]

Manage and view namespaces.

Subcommands:
  list       List all unique namespaces (default)
  stats      Show memory counts per namespace

  ${c.dim}memoclaw namespace list${c.reset}
  ${c.dim}memoclaw namespace stats${c.reset}`,
    };

    if (subHelp[command]) {
      console.log(subHelp[command]);
    } else {
      console.log(`No detailed help for "${command}". Run ${c.dim}memoclaw --help${c.reset} for overview.`);
    }
    return;
  }

  console.log(`${c.bold}MemoClaw CLI${c.reset} ${c.dim}v${VERSION}${c.reset} — Memory-as-a-Service for AI agents

${c.bold}Usage:${c.reset}
  memoclaw <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}init${c.reset}                   Generate wallet & initialize config
  ${c.cyan}migrate${c.reset} <path>          Import .md files from OpenClaw/local
  ${c.cyan}store${c.reset} "content"        Store a memory (also accepts stdin)
  ${c.cyan}recall${c.reset} "query"         Search memories by similarity
  ${c.cyan}search${c.reset} "query"         Text search (free, no embeddings cost)
  ${c.cyan}list${c.reset}                   List memories in a table
  ${c.cyan}get${c.reset} <id>               Get a single memory by ID
  ${c.cyan}update${c.reset} <id>            Update a memory
  ${c.cyan}delete${c.reset} <id>            Delete a memory
  ${c.cyan}bulk-delete${c.reset} <ids>       Delete multiple memories at once
  ${c.cyan}pin${c.reset} <id>              Pin a memory
  ${c.cyan}unpin${c.reset} <id>            Unpin a memory
  ${c.cyan}lock${c.reset} <id>             Lock a memory (make immutable)
  ${c.cyan}unlock${c.reset} <id>           Unlock a memory (make mutable)
  ${c.cyan}edit${c.reset} <id>             Edit a memory in $EDITOR
  ${c.cyan}watch${c.reset}                  Watch for new memories in real-time
  ${c.cyan}copy${c.reset} <id>             Duplicate a memory
  ${c.cyan}move${c.reset} [id] --namespace  Move memories to another namespace (supports filters)
  ${c.cyan}ingest${c.reset}                 Ingest raw text into memories
  ${c.cyan}extract${c.reset} "text"         Extract memories from text
  ${c.cyan}context${c.reset} "query"        Get GPT-powered contextual summary ($0.01/call)
  ${c.cyan}consolidate${c.reset}            Merge similar memories
  ${c.cyan}relations${c.reset} <sub>        Manage memory relations
  ${c.cyan}core${c.reset}                   List core memories (free)
  ${c.cyan}suggested${c.reset}              Get suggested memories for review
  ${c.cyan}whoami${c.reset}                 Print your wallet address
  ${c.cyan}status${c.reset}                 Check account & free tier info
  ${c.cyan}stats${c.reset}                  Memory statistics
  ${c.cyan}export${c.reset}                 Export all memories as JSON
  ${c.cyan}import${c.reset}                 Import memories from JSON
  ${c.cyan}completions${c.reset} <shell>    Generate shell completions
  ${c.cyan}browse${c.reset}                 Interactive memory browser (REPL)
  ${c.cyan}config${c.reset} [show|check]    Show or validate configuration
  ${c.cyan}history${c.reset} <id>           View change history for a memory
  ${c.cyan}diff${c.reset} <id>              Show content diff between memory versions
  ${c.cyan}graph${c.reset} <id>             ASCII visualization of memory relations
  ${c.cyan}purge${c.reset}                  Delete ALL memories (requires --force or confirm)
  ${c.cyan}tags${c.reset} [list]            List all unique tags (free)
  ${c.cyan}namespace${c.reset} [list|stats] Manage and view namespaces
  ${c.cyan}count${c.reset}                  Quick memory count
  ${c.cyan}alias${c.reset} <set|list|rm>    Manage memory aliases (local shortcuts)
  ${c.cyan}snapshot${c.reset} <sub>          Point-in-time namespace backups
  ${c.cyan}upgrade${c.reset}                Check for and install CLI updates
  ${c.cyan}help${c.reset} [command]          Show help for a command

${c.bold}Global Options:${c.reset}
  -h, --help             Show help (use with command for details)
  -v, --version          Show version
  -j, --json             Output as JSON (machine-readable)
  -q, --quiet            Suppress non-essential output
  -n, --namespace <name> Filter/set namespace
  -l, --limit <n>        Limit results
  -o, --offset <n>      Pagination offset
  -t, --tags <a,b>       Comma-separated tags
  -f, --format <fmt>     Output format: json, table, csv, yaml
  -p, --pretty          Pretty-print JSON output
  -w, --watch            Watch for changes (continuous polling)
  --watch-interval <ms>  Polling interval for watch mode (default: 5000)
  -s, --truncate <n>     Truncate output to n characters
  --no-truncate         Disable truncation in output
  -c, --concurrency <n>  Number of parallel imports (default: 1)
  -y, --yes              Skip confirmation prompts (alias for --force)
  -O, --output <file>    Write output to file instead of stdout
  -F, --field <name>     Extract specific field from output
  -r, --reverse          Reverse sort order
  -m, --sort-by <field>  Sort by field (id, importance, created, updated)
  -k, --columns <cols>   Select columns (id,content,importance,tags,created)
  --raw                  Raw output (content only, for piping)
  --wide                 Use wider columns in table output
  --force                Skip confirmation prompts
  -M, --memory-type <t>  Memory type (core, episodic, semantic, procedural)
  -T, --timeout <sec>    Request timeout (default: 30)
  --retries <n>          Max retries on transient errors (default: 3)
  --no-retry             Disable retries (fail-fast mode)
  --since <date>         Filter by creation date (ISO 8601 or 1h/7d/2w/1mo/1y)
  --until <date>         Filter by creation date (upper bound)

${c.bold}Environment:${c.reset}
  MEMOCLAW_PRIVATE_KEY   Wallet private key for auth + payments
  MEMOCLAW_URL           API endpoint (default: https://api.memoclaw.com)
  NO_COLOR               Disable colored output
  DEBUG                  Enable debug logging

${c.bold}Piping:${c.reset}
  echo "meeting notes" | memoclaw store
  echo "long text" | memoclaw ingest
  memoclaw export | jq '.memories | length'
  cat backup.json | memoclaw import

${c.bold}Free Tier:${c.reset}
  Every wallet gets 100 free API calls. After that, x402
  micropayments kick in automatically (pay-per-use USDC on Base).

${c.dim}API: https://api.memoclaw.com${c.reset}`);
}
