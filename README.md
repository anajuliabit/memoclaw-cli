# MemoClaw CLI

Memory-as-a-Service for AI agents. 1000 free calls per wallet, then x402 micropayments ($0.001/call USDC on Base).

## Install

```bash
npm install -g memoclaw
```

## Setup

```bash
export MEMOCLAW_PRIVATE_KEY=0x...  # Your wallet private key
```

## Usage

```bash
# Store a memory
memoclaw store "learned that user prefers dark mode" --importance 0.8 --tags ui,preferences

# Recall memories
memoclaw recall "user preferences" --limit 5

# List all memories
memoclaw list --limit 20

# Update a memory
memoclaw update <id> --importance 0.9 --pinned true

# Delete a memory
memoclaw delete <id>

# Ingest raw text (auto-extracts memories)
memoclaw ingest --text "Meeting notes: decided to use Rust for the backend..."
cat transcript.txt | memoclaw ingest

# Extract memories from text
memoclaw extract "The project deadline is March 15th and we need 3 engineers"

# Consolidate duplicate memories
memoclaw consolidate --dry-run
memoclaw consolidate --min-similarity 0.85

# Manage relations between memories
memoclaw relations list <memory-id>
memoclaw relations create <memory-id> <target-id> related_to
memoclaw relations delete <memory-id> <relation-id>

# Review suggested memories (stale, decaying, etc.)
memoclaw suggested --category stale
memoclaw suggested --raw

# Check free tier status
memoclaw status
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMOCLAW_PRIVATE_KEY` | Yes | Wallet private key for auth + payments |
| `MEMOCLAW_URL` | No | API endpoint (default: `https://api.memoclaw.com`) |
| `DEBUG` | No | Enable debug logging |

## Free Tier

Every wallet gets **1000 free API calls**. After that, x402 micropayments kick in automatically — $0.001/call in USDC on Base. No signup, no API keys, just your wallet.

## API

- Dashboard: [https://memoclaw.com](https://memoclaw.com)
- API: [https://api.memoclaw.com](https://api.memoclaw.com)
- Docs: [https://docs.memoclaw.com](https://docs.memoclaw.com)

## License

MIT
