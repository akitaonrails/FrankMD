# AGENTS.md

> Contributor guide for AI coding agents (and humans). Tool-agnostic.

## Project Overview

FrankMD is a self-hosted markdown note-taking app built with Ruby on Rails 8. Notes are plain `.md` files on the filesystem; there is **no database**. The editor uses CodeMirror 6 with Stimulus controllers.

## Commands

```bash
# Setup
bin/setup --skip-server

# Run dev server
bin/dev

# Full CI pipeline (lint + security + tests)
bin/ci

# Ruby tests only
bin/rails test

# JavaScript tests only
npx vitest run

# Linting
bin/rubocop

# Security
bin/bundler-audit
bin/importmap audit
bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error
```

Always run `bin/rails test` and `npx vitest run` before submitting changes.

## Architecture

### Backend (Rails 8)

```
app/
  controllers/     # Thin controllers, REST endpoints
  models/          # Note, Folder, Config: filesystem-backed, no ActiveRecord/DB
  services/        # Business logic (AiService, ImagesService, NotesService)
  views/           # ERB templates, partials for dialogs
config/
  routes.rb        # All API endpoints
  fed/fed.sh       # Shell function for Docker-based desktop usage
```

**Key models:**
- `Note`: reads/writes `.md` files from `NOTES_PATH`
- `Folder`: manages directories under `NOTES_PATH`
- `Config`: reads `.fed` config file; priority: `.fed` file > ENV > default

**Config pattern:** Always use `Config.new.get("key_name")` at runtime, never read `ENV` directly for configurable values. See `app/models/config.rb` for the SCHEMA.

### Frontend (Stimulus + CodeMirror 6)

```
app/javascript/
  controllers/     # Stimulus controllers (one per UI concern)
  lib/             # Pure utility modules (no DOM dependencies where possible)
  controllers/image_sources/  # Stimulus controllers for image picker tabs
  lib/image_sources/          # Image source classes (local, folder, web, etc.)
```

**Key patterns:**
- Each dialog/feature has its own Stimulus controller
- CodeMirror extensions are in `lib/codemirror_extensions.js`
- CodeMirror theme is in `lib/codemirror_theme.js`
- Markdown preview rendering pipeline: `lib/markdown_line_mapper.js` (uses marked.js)
- CSS lives in `app/assets/tailwind/components/` (component-scoped)
- Themes in `app/assets/tailwind/themes/` (CSS variables)

### Tests

```
test/
  controllers/     # Controller integration tests
  models/          # Model unit tests
  services/        # Service unit tests
  system/          # Capybara system tests
  javascript/      # Vitest unit tests (mirrors app/javascript/ structure)
```

**Testing patterns:**
- Ruby: Minitest + Mocha for stubs
- JavaScript: Vitest + jsdom
- Use `Config.stubs(:new).returns(@config_stub)` for Config in unit tests
- Use `ENV["KEY"]` manipulation in system tests (stubs don't work in full app context)
- Permission tests use Mocha stubs raising `Errno::EACCES`, not `chmod`

## Do

- Keep diffs small and focused on the issue at hand
- Run both Ruby and JS test suites before proposing changes
- Follow existing patterns (Stimulus controllers, service objects, Config usage)
- Use theme CSS variables (`--theme-*`) for all colors and styling
- Add tests for new functionality
- Use `Config.new.get("key")` for any configurable value

## Don't

- Don't add a database; the app is intentionally filesystem-only
- Don't read `ENV` directly for configurable values; use `Config.new.get()`
- Don't name controller actions `config`; it conflicts with Rails' internal `AbstractController::Base#config` method
- Don't add dependencies without justification
- Don't refactor code unrelated to your change
- Don't skip linting or tests
- Don't mock the filesystem with `chmod` in tests; use Mocha stubs instead

## PR Checklist

- [ ] `bin/rails test` passes (420+ tests)
- [ ] `npx vitest run` passes (1370+ tests)
- [ ] `bin/rubocop` passes
- [ ] Changes are focused and minimal
- [ ] New features include tests
- [ ] CSS uses theme variables, not hardcoded colors
