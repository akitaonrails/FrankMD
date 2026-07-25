<p align="center">
  <img src="public/icon.svg" width="200" height="200" alt="FrankMD icon">
</p>

<h1 align="center">FrankMD</h1>

<p align="center">
  <strong>FrankMD</strong> (Frank Markdown) is a self-hosted markdown note-taking app built with Ruby on Rails 8.<br>
  The name honors Frank Rosenblatt, inventor of the Perceptron, an early neural network.<br>
  <strong>fed</strong> (frank editor) is the command-line alias.
</p>

<p align="center">
  <a href="https://github.com/akitaonrails/FrankMD">
    <img src="https://img.shields.io/badge/GitHub-akitaonrails%2FFrankMD-blue?logo=github" alt="GitHub">
  </a>
</p>

## Why FrankMD?

- **No database** - Notes are plain markdown files on your filesystem
- **Self-hosted** - Your data stays on your machine or server
- **Docker-ready** - One command to start writing
- **Blog-friendly** - Draft posts with live preview

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_15-16-29.jpg" alt="FrankMD running as desktop app" width="800">
  <br>
  <em>FrankMD running as a desktop app with <code>fed .</code> command</em>
</p>

## Features

### Editor
- Clean, distraction-free writing interface
- Syntax highlighting for markdown
- Auto-save with visual feedback
- Typewriter mode for focused writing (cursor stays centered)
- Customizable fonts and sizes
- Multiple color themes (light/dark variants)

### Data Safety
- **Offline detection**: When the server becomes unreachable, FrankMD disables the editor and shows a warning banner to prevent edits that can't be saved. A "Retry" button lets you manually re-check. The editor re-enables automatically once the connection is restored.
- **Content loss protection**: If you accidentally delete a large portion of your note (more than 20% and 50+ characters), a warning banner appears with "Undo" and "Save Anyway" buttons, giving you a chance to recover before the deletion is saved.
- **Offline backup**: While you're editing, FrankMD periodically saves your work to the browser's local storage as a safety net.
- **Recovery dialog**: If the app detects that a local backup differs from the saved version (e.g., after a crash or lost connection), it shows a side-by-side diff so you can choose to keep the server version or restore the backup.

### Organization
- Nested folder structure with context menu (right-click to create new notes or folders)
- Drag and drop files and folders
- Quick file finder (`Ctrl+P`) sorted by recency
- Full-text search with regex support (`Ctrl+Shift+F`)
- Find and replace with regex support (`Ctrl+H`)
- **Hugo blog post support** - Create posts with proper directory structure
- **Wikilinks and backlinks** - `[[Note Title]]` syntax links to other notes; each note lists which other notes link back to it

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_15-24-36.jpg" alt="File finder" width="600">
  <br>
  <em>Quick file finder with fuzzy search (Ctrl+P)</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_15-25-59.jpg" alt="Content search" width="600">
  <br>
  <em>Full-text search with regex support (Ctrl+Shift+F)</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_15-22-35.jpg" alt="Find and replace" width="600">
  <br>
  <em>Find and replace with regex support (Ctrl+H)</em>
</p>

### Preview
- Live markdown preview panel
- Synchronized scrolling (including typewriter mode)
- Zoom controls
- GitHub-flavored markdown support
- Copy button on rendered code blocks

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-13-29.jpg" alt="Preview panel" width="700">
  <br>
  <em>Live preview with synchronized scrolling</em>
</p>

### Media
- **Images**: Browse local images, search web (DuckDuckGo), Google Images, Pinterest, or generate with AI
- **Videos**: Embed YouTube videos with search, or local video files
- **Tables**: Visual table editor with drag-and-drop rows/columns
- **Code blocks**: Language selection with autocomplete
- **Emoji & Emoticons**: Quick picker with search

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-03-02.jpg" alt="Local image picker" width="600">
  <br>
  <em>Browse local images from your filesystem</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-06-07.jpg" alt="Web image search" width="600">
  <br>
  <em>Search images from the web (DuckDuckGo, Google, Pinterest)</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-10-24.jpg" alt="AI image generation" width="600">
  <br>
  <em>Generate images with AI (requires configured AI provider)</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/ai_1769965759787.png" alt="AI generated image example" width="400">
  <br>
  <em>Example AI-generated image: "nano banana"</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-12-34.jpg" alt="YouTube search" width="600">
  <br>
  <em>Search and embed YouTube videos</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-28-00.jpg" alt="Table editor" width="600">
  <br>
  <em>Visual markdown table editor</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-30-19.jpg" alt="Emoji picker" width="500">
  <br>
  <em>Emoji picker with search</em>
</p>

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-30-40.jpg" alt="Emoticon picker" width="500">
  <br>
  <em>Emoticon picker</em>
</p>

### AI Features
- **Grammar Check**: AI-powered grammar, spelling, and typo correction
- Side-by-side diff view with original and corrected text
- Editable corrections before accepting changes
- Supports Ollama (local), OpenAI, Anthropic, Gemini, and OpenRouter

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-22-28.jpg" alt="AI grammar checker" width="700">
  <br>
  <em>AI grammar checker with side-by-side diff view</em>
</p>

### Internationalization
- **7 languages**: English, Português (Brasil), Português (Portugal), Español, עברית (Hebrew), 日本語 (Japanese), 한국어 (Korean)
- Language picker in the header
- Persistent preference saved to configuration

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-34-30.jpg" alt="Japanese interface" width="700">
  <br>
  <em>Full interface localization (Japanese example)</em>
</p>

### Integrations
- AWS S3 for image hosting (optional)
- YouTube API for video search (optional)
- Google Custom Search for image search (optional)
- AI/LLM providers for grammar checking (optional)

## Quick Start

### 1. Install

```bash
curl -sL https://raw.githubusercontent.com/akitaonrails/FrankMD/master/install.sh | bash
```

Then add to your shell config:

```bash
# bash/zsh - add to ~/.bashrc or ~/.zshrc
source ~/.config/frankmd/fed.sh

# fish - add to ~/.config/fish/config.fish
source ~/.config/frankmd/fed.fish
```

To update, run the curl command again.

### 2. Run

```bash
fed ~/my-notes    # open a specific directory
fed .             # open current directory
fed               # open current directory (same as above)
```

**Available commands:**
- `fed [path]` - Open FrankMD with notes directory
- `fed-update` - Check for and download updates
- `fed-stop` - Stop the container

### 3. Configure API Keys (Optional)

For AI features, image hosting, and related integrations, create an env file:

```bash
cp ~/.config/frankmd/env.example ~/.config/frankmd/env
# Edit ~/.config/frankmd/env with your API keys

# bash/zsh - add to ~/.bashrc or ~/.zshrc
export FRANKMD_ENV=~/.config/frankmd/env

# fish - add to ~/.config/fish/config.fish
set -gx FRANKMD_ENV ~/.config/frankmd/env
```

### 4. Browser (Optional)

FrankMD checks for browsers in this order: **Chromium** -> Firefox -> Brave -> Chrome -> Edge. The first one found is used. On Linux it looks for PATH commands; on macOS it also checks the matching `.app` bundles under `/Applications/`.

To override, set `FRANKMD_BROWSER` in your shell config:

```bash
# bash/zsh - add to ~/.bashrc or ~/.zshrc
export FRANKMD_BROWSER=brave           # or chromium, google-chrome, microsoft-edge, firefox

# fish - add to ~/.config/fish/config.fish
set -gx FRANKMD_BROWSER brave

# macOS - point at the binary inside the .app bundle if auto-detection misses it
export FRANKMD_BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Firefox opens in a regular browser window (it has no Chromium-style app-window mode); use a Chromium-based browser for the borderless app experience.

### Running in Background

To run as a persistent service:

```bash
# Create notes directory on the host
mkdir -p ~/notes

# Start in background
docker run -d --name frankmd -p 7591:80 \
  -v ~/notes:/rails/notes \
  --restart unless-stopped \
  akitaonrails/frankmd:latest

# Stop
docker stop frankmd

# Start again
docker start frankmd

# Remove
docker rm -f frankmd
```

Tip: If you hit permission errors, run the container as your user (`--user "$(id -u):$(id -g)"`) or rebuild the image with matching UID/GID.

### Using Docker Compose

For a more permanent setup, use the `docker-compose.yml` in this repo:

Quick reference (full file in `docker-compose.yml`):

```yaml
services:
  frankmd:
    image: akitaonrails/frankmd:latest
    container_name: frankmd
    restart: unless-stopped
    ports:
      - "7591:80"
    volumes:
      - ./notes:/rails/notes
    environment:
      - SECRET_KEY_BASE=${SECRET_KEY_BASE}
```

```bash
# Copy defaults and set required values
cp .env.example .env
# Set in .env:
# SECRET_KEY_BASE=$(openssl rand -hex 64)
# UID=$(id -u)
# GID=$(id -g)

# Ensure notes directory exists (or create your NOTES_PATH target)
mkdir -p notes

# Start
docker compose up -d
```

**Note:** The host directory in `NOTES_PATH` must exist and be writable by the UID/GID in `.env`. Avoid `sudo docker`, which creates root-owned bind mounts; if that happens, fix ownership with `chown -R UID:GID <path>`.

## Configuration

FrankMD uses a `.fed` configuration file in your notes directory. This file is automatically created on first run with all options commented out as documentation.

### The .fed File

When you open a notes directory for the first time, FrankMD creates a `.fed` configuration file with all available options commented out. You can uncomment and modify any setting:

```ini
# UI Settings
theme = gruvbox
locale = en
editor_font = fira-code
editor_font_size = 16
preview_zoom = 100
sidebar_visible = true
typewriter_mode = false
vim_mode = false

# Local images path
images_path = /home/user/Pictures

# AWS S3 (overrides environment variables)
aws_access_key_id = your-key
aws_secret_access_key = your-secret
aws_s3_bucket = your-bucket
aws_region = us-east-1

# API Keys
youtube_api_key = your-youtube-key
google_api_key = your-google-key
google_cse_id = your-cse-id

# AI/LLM (configure one or more providers)
# ai_provider = auto
# ollama_api_base = http://localhost:11434/v1
# ollama_model = llama3.2:latest
# openrouter_api_key = sk-or-...
# openrouter_model = openai/gpt-4o-mini
# anthropic_api_key = sk-ant-...
# anthropic_model = claude-sonnet-4-20250514
# gemini_api_key = ...
# gemini_model = gemini-2.0-flash
# openai_api_key = sk-...
# openai_model = gpt-4o-mini
```

**Priority order:** File settings override environment variables. Environment variables override defaults.

That lets you:
- Set global defaults via environment variables
- Override per-folder using `.fed` (e.g., different AWS bucket for different projects)
- Save UI changes (theme, font) back to the file

**Note:** AI credentials behave differently. If ANY AI key is set in `.fed`, ALL AI environment variables are ignored. See [Per-Folder AI Configuration](#per-folder-ai-configuration) for details.

### Editing .fed in the App

The `.fed` file appears in the explorer panel with a gear icon. You can click it to edit directly in FrankMD:

- The toolbar and preview panel are hidden when editing config files (they only appear for markdown files)
- Changes are auto-saved like any other file
- **Live reload**: When you save `.fed`, the UI immediately applies your changes (theme, font, etc.)

### Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `theme` | string | (system) | Color theme: light, dark, gruvbox, tokyo-night, etc. |
| `locale` | string | en | Language: en, pt-BR, pt-PT, es, he, ja, ko |
| `editor_font` | string | cascadia-code | Editor font family |
| `editor_font_size` | integer | 14 | Font size in pixels (8-32) |
| `preview_zoom` | integer | 100 | Preview zoom percentage (50-200) |
| `sidebar_visible` | boolean | true | Show explorer panel on startup |
| `typewriter_mode` | boolean | false | Enable typewriter mode on startup |
| `vim_mode` | boolean | false | Vim keybindings in the editor |
| `images_path` | string | - | Local images directory path |
| `image_upload_extensions` | string | `.jpg,.jpeg,.png,.gif,.webp,.bmp` | Comma-separated file extensions accepted by the image drag-and-drop upload |
| `video_upload_extensions` | string | `.mp4,.webm,.mkv,.mov,.avi,.m4v,.ogv` | Comma-separated file extensions accepted by the video drag-and-drop upload |
| `aws_access_key_id` | string | - | AWS access key for S3 |
| `aws_secret_access_key` | string | - | AWS secret key for S3 |
| `aws_s3_bucket` | string | - | S3 bucket name |
| `aws_region` | string | - | AWS region |
| `youtube_api_key` | string | - | YouTube Data API key |
| `google_api_key` | string | - | Google API key |
| `google_cse_id` | string | - | Google Custom Search Engine ID |
| `ai_provider` | string | auto | AI provider: auto, ollama, openrouter, anthropic, gemini, openai |
| `ai_model` | string | (per provider) | Override model for any provider |
| `ollama_api_base` | string | - | Ollama API base URL (e.g., http://localhost:11434/v1) |
| `ollama_model` | string | llama3.2:latest | Ollama model |
| `openrouter_api_key` | string | - | OpenRouter API key |
| `openrouter_model` | string | openai/gpt-4o-mini | OpenRouter model |
| `anthropic_api_key` | string | - | Anthropic API key |
| `anthropic_model` | string | claude-sonnet-4-20250514 | Anthropic model |
| `gemini_api_key` | string | - | Google Gemini API key |
| `gemini_model` | string | gemini-2.0-flash | Gemini model |
| `openai_api_key` | string | - | OpenAI API key |
| `openai_model` | string | gpt-4o-mini | OpenAI model |

### Vim Mode

Set `vim_mode = true` in `.fed` for vim keybindings in the editor. It applies
immediately on save, like the other editor settings — no restart needed.

Two things behave differently with vim mode on:

- **Escape is two-stage while typing.** In normal mode Escape still closes
  dialogs and the find bar as usual. In insert or visual mode the first Escape
  leaves that mode (vim owns the key there) and a second one reaches the app.
- **Some Ctrl bindings stay with the app on Windows/Linux.** `Ctrl+F`, `Ctrl+N`,
  `Ctrl+P`, `Ctrl+E`, `Ctrl+B`, `Ctrl+I` and `Ctrl+V` keep their FrankMD/browser
  meaning rather than vim's, so the app shortcuts keep working. `Ctrl+D`/`Ctrl+U`
  still page, and `Ctrl+Q` gives blockwise visual in place of `Ctrl+V`. macOS is
  unaffected, since app shortcuts use Cmd there.

### Environment Variables

Environment variables are global defaults. Use them for Docker deployments or when all notes directories should share the same config.

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTES_PATH` | Directory where notes are stored (must be writable by UID/GID when using Docker) | `./notes` |
| `IMAGES_PATH` | Directory for local images | (disabled) |
| `IMAGE_UPLOAD_EXTENSIONS` | Comma-separated file extensions accepted by the image drag-and-drop upload | `.jpg,.jpeg,.png,.gif,.webp,.bmp` |
| `VIDEO_UPLOAD_EXTENSIONS` | Comma-separated file extensions accepted by the video drag-and-drop upload | `.mp4,.webm,.mkv,.mov,.avi,.m4v,.ogv` |
| `FRANKMD_LOCALE` | Default language (en, pt-BR, pt-PT, es, he, ja, ko) | en |
| `SECRET_KEY_BASE` | Rails secret key (required in production) | - |

### Optional: Image Hosting (AWS S3)

To upload images to S3 instead of using local paths:

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |
| `AWS_S3_BUCKET` | S3 bucket name |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |

### Optional: YouTube Search

To enable YouTube video search in the video dialog:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable "YouTube Data API v3"
3. Create an API key under Credentials

| Variable | Description |
|----------|-------------|
| `YOUTUBE_API_KEY` | Your YouTube Data API key |

**In-app setup:** You can also configure this directly in the `.fed` file:
```ini
youtube_api_key = your-youtube-api-key
```

When not configured, the YouTube Search tab shows setup instructions with a link to this documentation.

### Optional: Google Image Search

To enable Google Images tab (in addition to the free web search):

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable "Custom Search API"
3. Create an API key under Credentials
4. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
5. Create a search engine with "Search the entire web" enabled
6. Enable "Image search" in settings
7. Copy the Search Engine ID (cx value)

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` | Your Google API key |
| `GOOGLE_CSE_ID` | Your Custom Search Engine ID |

**In-app setup:** You can also configure this directly in the `.fed` file:
```ini
google_api_key = your-google-api-key
google_cse_id = your-custom-search-engine-id
```

When not configured, the Google Images tab shows setup instructions with a link to this documentation.

Note: Google Custom Search has a free tier of 100 queries/day.

### Optional: AI Grammar Checking

FrankMD has an AI grammar and spelling checker. Click the "AI" button in the editor toolbar to check your text. It fixes grammar errors, spelling mistakes, typos, and punctuation while keeping your writing style and markdown formatting.

**Supported Providers** (priority order in auto mode):
1. **OpenAI** - GPT models
2. **Anthropic** - Claude models
3. **Google Gemini** - Gemini models
4. **OpenRouter** - Multiple providers, pay-per-use
5. **Ollama** - Local, free, private

When multiple providers are configured, FrankMD uses the first available one in the priority order above. You can override this with `ai_provider = <provider>`.

#### Option 1: Ollama (Local, Free, Recommended)

Run AI models locally on your machine with no API costs:

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2:latest`
3. Configure in `.fed`:

```ini
ollama_api_base = http://localhost:11434/v1
ollama_model = llama3.2:latest
```

**Note for Docker users:** Use `host.docker.internal` instead of `localhost`:
```ini
ollama_api_base = http://host.docker.internal:11434/v1
```

#### Option 2: OpenRouter

Access multiple AI providers through one API:

1. Get an API key from [openrouter.ai](https://openrouter.ai/keys)
2. Configure in `.fed`:

```ini
openrouter_api_key = sk-or-...
openrouter_model = openai/gpt-4o-mini
```

#### Option 3: Anthropic (Claude)

Use Anthropic's Claude models:

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)
2. Configure in `.fed`:

```ini
anthropic_api_key = sk-ant-...
anthropic_model = claude-sonnet-4-20250514
```

#### Option 4: Google Gemini

Use Google's Gemini models:

1. Get an API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. Configure in `.fed`:

```ini
gemini_api_key = ...
gemini_model = gemini-2.0-flash
```

#### Option 5: OpenAI

Use OpenAI's GPT models:

1. Get an API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Configure in `.fed`:

```ini
openai_api_key = sk-...
openai_model = gpt-4o-mini
```

#### Provider Selection

By default, FrankMD uses the first configured provider in priority order (OpenAI -> Anthropic -> Gemini -> OpenRouter -> Ollama). To force a specific provider:

```ini
ai_provider = anthropic
```

To override the model for any provider:

```ini
ai_model = claude-3-opus-20240229
```

#### Per-Folder AI Configuration

**Important:** If you set ANY AI credential in `.fed`, ALL AI-related environment variables are ignored for that folder. This gives each folder its own AI configuration and bypasses your global ENV settings.

For example, if you have `OPENAI_API_KEY` and `OPENROUTER_API_KEY` set as environment variables, but add this to `.fed`:

```ini
anthropic_api_key = sk-ant-your-key
```

FrankMD will:
- Use **only** Anthropic (ignoring OpenAI and OpenRouter from ENV)
- Pick up changes immediately when you save `.fed` from the editor

This is useful for:
- Using different AI providers for different projects
- Testing new providers without changing your global config
- Overriding ENV vars set in Docker/shell profiles

#### Default Models

| Provider | Default Model |
|----------|---------------|
| Ollama | llama3.2:latest |
| OpenRouter | openai/gpt-4o-mini |
| Anthropic | claude-sonnet-4-20250514 |
| Gemini | gemini-2.0-flash |
| OpenAI | gpt-4o-mini |

**Usage:**
- Click the "AI" button in the toolbar while editing a note
- Review the side-by-side diff showing original and corrected text
- Edit the corrected text if needed
- Click "Accept Changes" to apply corrections

## Keyboard Shortcuts

### File Operations
| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New note |
| `Ctrl+S` | Save now |
| `Ctrl+P` | Find file by path |
| `Ctrl+Shift+F` | Search in file contents |
| `Ctrl+F` | Find in file |
| `Ctrl+H` | Find and replace |
| `Ctrl+G` | Go to line |

### Editor
| Shortcut | Action |
|----------|--------|
| `Ctrl+E` | Toggle sidebar |
| `Ctrl+Shift+V` | Toggle preview panel |
| `Ctrl+\` | Toggle typewriter mode |
| `Ctrl+L` | Toggle line numbers |
| `Ctrl+Shift++` | Increase editor width |
| `Ctrl+Shift+-` | Decrease editor width |
| `Tab` | Indent line/block |
| `Shift+Tab` | Unindent block |

### Text Formatting
| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+M` | Open text format menu |
| `Ctrl+Shift+E` | Emoji picker |

### Help
| Shortcut | Action |
|----------|--------|
| `F1` | Open help dialog |
| `Escape` | Close dialogs |

## Typewriter Mode

Typewriter mode (`Ctrl+\`) keeps the editor centered for long writing sessions:

**Normal mode (default):**
- Explorer panel visible on the left
- Preview panel available
- Editor uses normal scrolling

**Typewriter mode:**
- Explorer panel hidden
- Preview panel closed
- Editor centered horizontally on the screen
- Cursor stays centered in the middle of the editor (50% viewport height)
- As you type, the text scrolls to keep your writing position fixed
- Adjust editor width with `Ctrl+Shift++` and `Ctrl+Shift+-`

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-17-37.jpg" alt="Typewriter mode" width="700">
  <br>
  <em>Typewriter mode: distraction-free writing with centered cursor</em>
</p>

This keeps your typing position steady on the page, which reduces eye movement during longer writing sessions.

## Hugo Blog Post Support

FrankMD can create Hugo-compatible blog posts. When you click the "New Note" button (or press `Ctrl+N`), you can choose between:

- **Empty Document** - A plain markdown file
- **Hugo Blog Post** - A Hugo post with frontmatter

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-39-53.jpg" alt="New note dialog" width="500">
  <br>
  <em>New note dialog with Hugo blog post option</em>
</p>

### Hugo Post Structure

When you create a Hugo blog post with a title like "My Amazing Post Title", FrankMD will:

1. Create the directory structure: `YYYY/MM/DD/my-amazing-post-title/`
2. Create `index.md` inside with Hugo frontmatter:

```yaml
---
title: "My Amazing Post Title"
slug: "my-amazing-post-title"
date: 2026-01-30T14:30:00-0300
draft: true
tags: []
---
```

#### Custom Frontmatter Template

To customize the generated frontmatter (add tags, extra fields, change formatting), create a `.hugo_template.md` file at the root of your notes directory. When present, its contents replace the built-in frontmatter. The following placeholders are substituted on each new post:

- `{{title}}`: the post title (quotes escaped for use inside `"..."`)
- `{{slug}}`: the generated slug
- `{{date}}`: the ISO 8601 creation date with timezone offset

```yaml
---
title: "{{title}}"
slug: "{{slug}}"
date: {{date}}
draft: true
author: "Your Name"
tags:
  - uncategorized
categories: []
---
```

The file is hidden (dot-prefixed) so it won't appear in the notes tree. Remove it to fall back to the built-in template.

#### Flat Path Style

If you prefer to keep all posts in a single folder without date-based nesting, set `hugo_path_style = flat` in your `.fed` file:

```ini
hugo_path_style = flat
```

With flat style, creating a post titled "My Amazing Post Title" produces `my-amazing-post-title.md` in the current folder instead of the nested `YYYY/MM/DD/slug/index.md` structure. The frontmatter content remains the same.

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-38-55.jpg" alt="Hugo post with frontmatter" width="700">
  <br>
  <em>Hugo blog post with generated frontmatter</em>
</p>

### Slug Generation

The slug is automatically generated from the title:
- Converts to lowercase
- Replaces accented characters (a->a, e->e, c->c, n->n, etc.)
- Removes special characters
- Replaces spaces with hyphens

Examples:
- "Conexao a Internet" -> `conexao-a-internet`
- "What's New in 2026?" -> `whats-new-in-2026`
- "Codigo & Programacao" -> `codigo-programacao`

### Hugo YouTube Shortcode

When embedding YouTube videos, FrankMD can insert a Hugo shortcode (`{{< youtube >}}`) instead of raw HTML. Check the **"Use Hugo shortcode"** checkbox in the video dialog to enable this.

The inserted shortcode looks like:

```
{{< youtube id="dQw4w9WgXcQ" title="Video Title" >}}
```

To use this in your Hugo blog, create the shortcode file at `layouts/shortcodes/youtube.html` in your Hugo project:

```html
<div class="embed-container">
  <iframe
    src="https://www.youtube.com/embed/{{ .Get "id" }}"
    title="{{ with .Get "title" }}{{ . }}{{ else }}YouTube video player{{ end }}"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen>
  </iframe>
</div>
```

Then add the responsive CSS to your stylesheet (e.g. `assets/css/custom.css` or your theme's styles):

```css
.embed-container {
  position: relative;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  height: 0;
  overflow: hidden;
  max-width: 100%;
}

.embed-container iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
```

**Note:** Hugo ships with a built-in `youtube` shortcode, but it uses a different syntax (`{{< youtube dQw4w9WgXcQ >}}` with a positional parameter). The custom shortcode above matches the named-parameter format (`id="..."`, `title="..."`) that FrankMD generates, and gives you full control over the markup and styling.

## Themes

FrankMD ships with 18 built-in color themes, plus [Omarchy](https://omarchy.org) theme sync:

<p align="center">
  <img src="https://new-uploads-akitaonrails.s3.us-east-2.amazonaws.com/frankmd/2026/02/screenshot-2026-02-01_14-37-05.jpg" alt="Theme picker" width="300">
  <br>
  <em>Theme picker dropdown</em>
</p>

| Theme | Description |
|-------|-------------|
| Light | Clean light theme |
| Dark | Standard dark theme |
| Catppuccin | Pastel dark theme |
| Catppuccin Latte | Pastel light theme |
| Ethereal | Soft colors |
| Everforest | Warm green nature theme |
| Flexoki Light | Inky light theme |
| Gruvbox | Retro groove color scheme |
| Hackerman | Matrix-style green on black |
| Kanagawa | Inspired by Katsushika Hokusai's art |
| Matte Black | Pure dark minimal theme |
| Nord | Arctic, north-bluish palette |
| Osaka Jade | Japanese-inspired jade colors |
| Ristretto | Deep coffee tones |
| Rose Pine | All natural pine, faux fur and mystery |
| Solarized Dark | Classic dark color scheme |
| Solarized Light | Classic light color scheme |
| Tokyo Night | High-contrast night theme |

**Omarchy sync:** If you run the [Omarchy](https://omarchy.org) desktop environment, FrankMD detects your terminal theme and adds it as a selectable "Omarchy" option. Switching your terminal theme updates FrankMD in real time.

Change themes from the dropdown in the top-right corner. Your preference is saved to the `.fed` file.

## Remote Access with Cloudflare Tunnel

For remote access without opening ports:

1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/

2. Authenticate:
   ```bash
   cloudflared tunnel login
   ```

3. Create a tunnel:
   ```bash
   cloudflared tunnel create frankmd
   ```

4. Add to your `docker-compose.yml`:
   ```yaml
   services:
     frankmd:
       # ... existing config ...

     cloudflared:
       image: cloudflare/cloudflared:latest
       container_name: cloudflared
       restart: unless-stopped
       command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
       environment:
         - CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
       depends_on:
         - frankmd
   ```

5. Configure the tunnel in Cloudflare Zero Trust dashboard to point to `http://frankmd:80`

6. Add your tunnel token to `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token
   ```

7. Access via your configured domain (e.g., `notes.yourdomain.com`)

**Security Note**: Consider adding Cloudflare Access policies to restrict who can access your notes.

## Development

### Requirements

- Ruby 3.4+
- Node.js 20+ (for Tailwind CSS)
- Bundler

### Setup

```bash
# Clone the repository
git clone https://github.com/akitaonrails/FrankMD.git
cd FrankMD

# Install Ruby dependencies
bundle install

# Start development server (includes Tailwind watcher)
bin/dev
```

Visit `http://localhost:3000`

### Running Tests

```bash
# Run ALL checks (lint + security + tests) - same as CI
bin/ci

# Run Ruby tests only
bin/rails test

# Run JavaScript tests only
npx vitest run

# Run specific test file
bin/rails test test/controllers/notes_controller_test.rb

# Run with verbose output
bin/rails test -v
```

Always run `bin/ci` before pushing so CI has already run locally.

### Project Structure

```
app/
├── controllers/
│   ├── notes_controller.rb        # Note CRUD operations
│   ├── folders_controller.rb      # Folder management
│   ├── images_controller.rb       # Image browsing & S3 upload
│   ├── youtube_controller.rb      # YouTube search API
│   ├── ai_controller.rb           # AI grammar checking API
│   ├── config_controller.rb       # .fed configuration
│   └── translations_controller.rb # i18n API for JavaScript
├── models/
│   ├── note.rb                # Note ActiveModel
│   ├── folder.rb              # Folder ActiveModel
│   └── config.rb              # Configuration management
├── services/
│   ├── notes_service.rb           # File system operations
│   ├── images_service.rb          # Image handling & S3
│   ├── ai_service.rb              # AI/LLM integration
│   └── omarchy_theme_service.rb   # Omarchy desktop theme sync
├── javascript/
│   └── controllers/
│       ├── app_controller.js          # Main Stimulus controller
│       ├── theme_controller.js        # Theme management
│       ├── locale_controller.js       # Language/i18n management
│       └── table_editor_controller.js # Table editing
└── views/
    └── notes/
        ├── index.html.erb     # Single-page app
        ├── _header.html.erb   # Top bar with GitHub link
        ├── _sidebar.html.erb  # File explorer
        ├── _editor_panel.html.erb
        ├── _preview_panel.html.erb
        └── dialogs/           # Modal dialogs
```

### Building Docker Image

```bash
# Build locally
docker build -t frankmd .

# Run locally
mkdir -p notes
docker run -p 7591:80 -v $(pwd)/notes:/rails/notes frankmd
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

### Getting Started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the guidelines below
4. Run `bin/ci` to verify everything passes
5. Commit (`git commit -m 'Add amazing feature'`)
6. Push (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### PR Requirements

Before submitting a PR:

- **Rebase from master** - rebase on the latest `master` before opening a PR. Merge commits are not accepted.
- **`bin/ci` passes** - run it locally. This checks rubocop style, brakeman security scan, bundler-audit, importmap audit, Ruby tests, and JavaScript tests. PRs that fail CI will not be reviewed.
- **Tests included** - every new feature or bug fix must include tests. Ruby tests go in `test/`, JavaScript tests go in `test/javascript/`. Untested PRs will be sent back.
- **Focused scope** - one PR should do one thing. Don't mix unrelated changes (e.g., a new feature + linter fixes + refactoring). If you spot something unrelated to fix, open a separate PR.

### Architecture Guidelines

This is a Rails 8 app. Follow Rails 8 idioms and conventions:

- **Turbo Streams for server-rendered updates** - file tree updates, CRUD operations on files/folders, and any server-driven DOM update must use Turbo Stream responses. Do not build HTML in JavaScript from JSON API responses.
- **`@rails/request.js` for fetch calls** - use `get`, `post`, `patch`, `destroy` from `@rails/request.js` instead of raw `fetch()`. It handles CSRF tokens and Turbo Stream content negotiation automatically.
- **Stimulus Outlets for controller communication** - use Stimulus Outlets (`static outlets = [...]`) instead of manual `querySelector` + `getControllerForElementAndIdentifier` lookups.
- **Config via `Config.get()`** - never read `ENV["KEY"]` directly in controllers or services. Use `Config.new.get("key_name")` which respects the `.fed` file > ENV > default priority chain. See `app/models/config.rb` for the schema.
- **No sessions** - this app is sessionless. Do not use `session[]` for state. All persistent state goes through the `.fed` config file.

### Code Style

- Ruby follows the project's `.rubocop.yml`. Run `bin/rubocop -a` to auto-fix most issues.
- JavaScript has no linter configured, but follow the existing patterns: ES module imports, Stimulus controller conventions, no semicolons.
- Keep changes minimal. Don't add extra error handling, comments, or abstractions beyond what's needed for the task.

## Stats

### Memory Footprint

| Component | Memory |
|-----------|--------|
| Rails container (Puma + Thruster) | ~115 MiB |
| Browser tab (Brave/Chrome) | ~340 MB |
| **Total** | **~455 MB** |

### Codebase (from `bin/rails stats`)

| Type | Lines | LOC |
|------|-------|-----|
| JavaScript | 13,793 | 10,081 |
| Views (ERB) | 2,953 | 2,633 |
| Models | 904 | 706 |
| Controllers | 850 | 652 |
| **Total source** | **~18,500** | **~14,100** |

### Test Coverage

| Type | Tests |
|------|-------|
| JavaScript (Vitest) | 1,379 |
| Ruby (Minitest) | 425 |
| **Total** | **1,804** |
