# MemoClaw CLI

Memory-as-a-Service for AI agents. 100 free calls per wallet, then x402 micropayments (USDC on Base).

## Install

```bash
npm install -g memoclaw
```

## Setup

```bash
export MEMOCLAW_PRIVATE_KEY=0x...  # Your wallet private key
```

## Quick Start

```bash
# Store a memory
memoclaw store "learned that user prefers dark mode" --importance 0.8 --tags ui,preferences

# Recall memories by similarity
memoclaw recall "user preferences" --limit 5

# List all memories (pretty table)
memoclaw list

# Interactive browser
memoclaw browse
```

## Commands

### Core

```bash
memoclaw store "content"              # Store a memory (also accepts stdin)
memoclaw recall "query"               # Search by semantic similarity
memoclaw list                         # List memories in a table
memoclaw get <id>                     # Get a single memory
memoclaw update <id> --importance 0.9 # Update a memory
memoclaw delete <id>                  # Delete a memory
memoclaw count                        # Quick count (pipe-friendly)
```

### AI Features

```bash
memoclaw ingest --text "Meeting notes..."  # Auto-extract memories from text
cat transcript.txt | memoclaw ingest       # Pipe text to ingest
memoclaw extract "The deadline is March 15th"
memoclaw consolidate --dry-run             # Merge similar memories
memoclaw suggested --category stale        # Review suggested memories
```

### Relations

```bash
memoclaw relations list <memory-id>
memoclaw relations create <memory-id> <target-id> related_to
memoclaw relations delete <memory-id> <relation-id>
memoclaw graph <id>                        # ASCII tree visualization
```

Valid relation types: `related_to`, `derived_from`, `contradicts`, `supersedes`, `supports`

### Bulk Operations

```bash
memoclaw export > backup.json              # Export all memories
memoclaw export --namespace project1 > p1.json
memoclaw import --file backup.json         # Import from file
cat backup.json | memoclaw import          # Import from stdin
memoclaw purge --force                     # Delete ALL memories
memoclaw purge --namespace old --force     # Delete namespace
```

### Account & Config

```bash
memoclaw status                            # Free tier remaining
memoclaw stats                             # Memory statistics
memoclaw config show                       # Show configuration
memoclaw config check                      # Validate setup
```

### Interactive Browser

```bash
memoclaw browse                            # REPL for exploring memories
memoclaw browse --namespace project1
```

Inside the browser: `list`, `get <id>`, `recall <query>`, `store <text>`, `delete <id>`, `stats`, `next`, `prev`, `quit`

### Shell Completions

```bash
eval "$(memoclaw completions bash)"
eval "$(memoclaw completions zsh)"
memoclaw completions fish > ~/.config/fish/completions/memoclaw.fish
```

## Global Options

| Flag | Short | Description |
|------|-------|-------------|
| `--json` | `-j` | Machine-readable JSON output |
| `--quiet` | `-q` | Suppress non-essential output |
| `--namespace <name>` | `-n` | Filter/set namespace |
| `--limit <n>` | `-l` | Limit results |
| `--tags <a,b>` | `-t` | Comma-separated tags |
| `--raw` | | Content only (for piping) |
| `--force` | | Skip confirmation prompts |
| `--timeout <sec>` | | Request timeout (default: 30) |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |

Flags can be combined: `memoclaw list -jq -n myns -l 5`

## Piping

```bash
echo "meeting notes" | memoclaw store
echo "long text" | memoclaw ingest
memoclaw recall "query" --raw | head -1
memoclaw export | jq '.memories | length'
memoclaw count  # outputs just the number
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMOCLAW_PRIVATE_KEY` | Yes | Wallet private key for auth + payments |
| `MEMOCLAW_URL` | No | API endpoint (default: `https://api.memoclaw.com`) |
| `NO_COLOR` | No | Disable colored output |
| `DEBUG` | No | Enable debug logging |

## Free Tier

Every wallet gets **100 free API calls**. After that, x402 micropayments kick in automatically (USDC on Base). No signup, no API keys, just your wallet. See [memoclaw.com](https://memoclaw.com) for pricing details.

## Links

- Dashboard: [memoclaw.com](https://memoclaw.com)
- API: [api.memoclaw.com](https://api.memoclaw.com)
- Docs: [docs.memoclaw.com](https://docs.memoclaw.com)

## License

MIT
