# Changelog

## 1.7.0

### New Commands
- `memoclaw graph <id>` — ASCII tree visualization of memory relations (color-coded by relation type)
- `memoclaw purge` — Delete all memories with confirmation prompt (or `--force` to skip)
- `memoclaw count` — Quick memory count, pipe-friendly (just prints the number)

### Improvements
- **Network error handling** — Friendly messages for DNS failures, connection refused, timeouts instead of raw stack traces
- **`--force` flag** — Skip confirmation prompts (for `purge` and future destructive commands)
- **`--timeout` flag** — Configurable request timeout (default: 30s)
- **21 commands total** — Up from 18; shell completions updated

### Testing
- 53 tests (up from 46), covering new commands, graph helpers, boolean flags

## 1.6.0

### New Commands
- `memoclaw get <id>` — Retrieve and display a single memory with formatted output
- `memoclaw config [show|check]` — Show current configuration or validate setup

### New Features
- **Short flags** — `-n` (namespace), `-l` (limit), `-t` (tags), `-o` (output)
- **`--key=value` syntax** — Alternative to `--key value` for all flags
- **`--no-color` flag** — Disable colored output programmatically
- **`--raw` flag for `recall`** — Outputs content only, one per line (pipe-friendly)

### Refactoring
- **Shared arg parser** — Extracted `parseArgs` to `src/args.ts`; tests import the real parser instead of duplicating logic
- Shell completions updated (17 commands)

### Testing
- 39 tests (up from 33), all using shared `src/args.ts`
- New coverage: short flags, `--key=value`, `get`, `config`, `BOOLEAN_FLAGS`

## 1.5.0

### New Commands
- `memoclaw export` — Export all memories as JSON (supports `--namespace`, pagination)
- `memoclaw import` — Import memories from JSON file or stdin (`--file` or pipe)
- `memoclaw stats` — Memory statistics and account overview
- `memoclaw completions <bash|zsh|fish>` — Generate shell completion scripts
- `memoclaw help <command>` — Per-command detailed help

### New Features
- **`--json` / `-j` global flag** — Machine-readable JSON output for all commands
- **`--quiet` / `-q` global flag** — Suppress non-essential output
- **Colored output** — Similarity scores, categories, success/error messages (respects `NO_COLOR`)
- **Pretty table output** — `list` and `relations list` now display formatted tables
- **Stdin piping for `store`** — `echo "content" | memoclaw store` now works
- **Stdin piping for `extract`** — `echo "text" | memoclaw extract` now works
- **`--` separator** — Stop flag parsing for edge cases
- **Progress indicators** — Export/import show progress on stderr

### Bug Fixes
- **Version mismatch** — `--version` now reads from single source of truth
- **`--dry-run` flag consumed next arg** — Boolean flags no longer eat the following argument
- **`update` with no fields** — Now shows clear error instead of sending empty PATCH
- **Relation type validation** — Invalid types rejected with helpful message before API call
- **Consistent output** — All commands respect `--json` flag; no more mixed raw/pretty output

### Testing
- Added comprehensive test suite (30 tests) covering arg parsing, formatting, validation

## 1.4.0

### Improvements
- `-h`/`--help` and `-v`/`--version` flags now work
- `memoclaw --help` works without `MEMOCLAW_PRIVATE_KEY` set (lazy auth)
- Unknown commands show a clear error message instead of silently printing help
- `recall` and `suggested` show "No memories found" instead of blank output
- Fixed `suggested` truncation always appending `...` even for short content
- Added `MEMOCLAW_URL` to help text
- Short flag parsing (`-h`, `-v`) support

## 1.3.0

### Initial standalone release
- Extracted from monorepo (`packages/cli`)
- Auto-publish to npm on version bump
- Full CLI: store, recall, list, update, delete, ingest, extract, consolidate, relations, suggested, status

## 1.2.0

- Original monorepo version
