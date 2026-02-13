# Changelog

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
