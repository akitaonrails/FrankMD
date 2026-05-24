# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for the full contributor guide (architecture, commands, rules).

## Quick Reference

```bash
bin/rails test          # Ruby tests
npx vitest run          # JavaScript tests
bin/ci                  # Full CI pipeline
```

- No database; filesystem-only (Note, Folder, Config models)
- Use `Config.new.get("key")` for config values, never raw `ENV`
- Don't name controller actions `config` (conflicts with Rails internals)
- CSS uses `--theme-*` variables, not hardcoded colors
- Permission tests use Mocha stubs, not `chmod`
