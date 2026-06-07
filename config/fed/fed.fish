# FrankMD fish shell functions
# Source this file in your ~/.config/fish/config.fish:
#   source ~/.config/frankmd/fed.fish

function _fed_is_macos
    test (uname) = Darwin
end

# Detect the best available browser.
# Override with: set -gx FRANKMD_BROWSER brave  (PATH command or full path)
function _fed_find_browser
    if set -q FRANKMD_BROWSER; and test -n "$FRANKMD_BROWSER"
        # Accept either a PATH command or an absolute path to an executable
        # (the macOS .app workaround: full path to the binary inside the bundle).
        if command -q "$FRANKMD_BROWSER"
            echo "$FRANKMD_BROWSER"
            return 0
        end
        if test -x "$FRANKMD_BROWSER"
            echo "$FRANKMD_BROWSER"
            return 0
        end
        echo "[fed] Warning: FRANKMD_BROWSER='$FRANKMD_BROWSER' not found, auto-detecting..." >&2
    end

    set -l candidates \
        chromium chromium-browser \
        firefox firefox-esr \
        brave-browser brave \
        google-chrome-stable google-chrome \
        microsoft-edge-stable microsoft-edge

    for cmd in $candidates
        if command -q "$cmd"
            echo "$cmd"
            return 0
        end
    end

    # macOS: GUI browsers ship as .app bundles, not PATH commands (issue #86).
    # Match the order above; the binary inside the bundle accepts --app / --new-window
    # the same way as the Linux executable.
    if _fed_is_macos
        set -l mac_candidates \
            "/Applications/Chromium.app/Contents/MacOS/Chromium" \
            "/Applications/Firefox.app/Contents/MacOS/firefox" \
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        for path in $mac_candidates
            if test -x "$path"
                echo "$path"
                return 0
            end
        end
    end

    return 1
end

# Open FrankMD with a notes directory
function fed
    set -l target "."
    if test (count $argv) -gt 0
        set target "$argv[1]"
    end

    set -l notes (realpath "$target")
    set -l splash "$HOME/.config/frankmd/splash.html"

    # Ensure container is running with correct notes path
    if docker ps -q -f name=frankmd 2>/dev/null | grep -q .
        set -l current (docker inspect frankmd --format '{{range .Mounts}}{{if eq .Destination "/rails/notes"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
        if test "$current" != "$notes"
            docker stop frankmd >/dev/null 2>&1
        end
    end

    # Start container if not running
    if not docker ps -q -f name=frankmd 2>/dev/null | grep -q .
        docker rm frankmd 2>/dev/null

        # Forward host env vars if set (Config .fed file still overrides these)
        set -l env_flags
        set -l env_vars \
            AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_S3_BUCKET AWS_REGION \
            YOUTUBE_API_KEY \
            GOOGLE_API_KEY GOOGLE_CSE_ID \
            AI_PROVIDER AI_MODEL \
            OLLAMA_API_BASE OLLAMA_MODEL \
            OPENROUTER_API_KEY OPENROUTER_MODEL \
            ANTHROPIC_API_KEY ANTHROPIC_MODEL \
            GEMINI_API_KEY GEMINI_MODEL \
            OPENAI_API_KEY OPENAI_MODEL \
            IMAGE_GENERATION_MODEL \
            FRANKMD_LOCALE

        for var in $env_vars
            if printenv "$var" >/dev/null 2>&1
                set -a env_flags -e "$var="(printenv "$var")
            end
        end

        # Detect images directory to mount into container
        # Check: IMAGES_PATH env > .fed file > XDG_PICTURES_DIR > ~/Pictures
        set -l images_dir ""
        if set -q IMAGES_PATH; and test -n "$IMAGES_PATH"
            set images_dir "$IMAGES_PATH"
        end
        if test -z "$images_dir"; and test -f "$notes/.fed"
            set images_dir (grep -m1 '^images_path[[:space:]]*=' "$notes/.fed" | sed "s/^[^=]*=[[:space:]]*//" | sed "s/^[\"']//; s/[\"'][[:space:]]*\$//")
            set images_dir (string replace -r '^~' "$HOME" -- "$images_dir")
        end
        if test -z "$images_dir"; and set -q XDG_PICTURES_DIR; and test -n "$XDG_PICTURES_DIR"
            set images_dir "$XDG_PICTURES_DIR"
        end
        if test -z "$images_dir"; and test -d "$HOME/Pictures"
            set images_dir "$HOME/Pictures"
        end

        # Mount images directory into container at a fixed path (read-only)
        set -l images_mount
        if test -n "$images_dir"; and test -d "$images_dir"
            set images_dir (realpath "$images_dir")
            set images_mount --mount "type=bind,source=$images_dir,target=/data/images,readonly"
            # Override IMAGES_PATH inside container to match the mount point
            set -a env_flags -e "IMAGES_PATH=/data/images"
        else
            echo "[fed] Warning: no images directory found (set IMAGES_PATH or create ~/Pictures)"
        end

        set -l env_file_flag
        if set -q FRANKMD_ENV; and test -n "$FRANKMD_ENV"
            set env_file_flag --env-file "$FRANKMD_ENV"
        end

        set -l user_id (id -u)
        set -l group_id (id -g)

        docker run -d --name frankmd --rm \
            -p 7591:80 \
            --user "$user_id:$group_id" \
            -v "$notes:/rails/notes" \
            $images_mount \
            $env_flags \
            $env_file_flag \
            akitaonrails/frankmd:latest >/dev/null
    end

    # Detect browser
    set -l browser (_fed_find_browser)
    if test -z "$browser"
        echo "[fed] Error: no supported browser found." >&2
        echo "[fed] Linux: install chromium, firefox, brave, google-chrome, or microsoft-edge." >&2
        echo "[fed] macOS: install one of those .app bundles under /Applications/." >&2
        echo "[fed] Or set FRANKMD_BROWSER to a command on PATH or a full executable path." >&2
        return 1
    end

    # Open browser with splash (polls until Rails is ready).
    # Key off the basename so macOS bundle paths like
    # /Applications/Firefox.app/Contents/MacOS/firefox still match `firefox*`.
    set -l url "file://$splash"
    set -l browser_name (basename "$browser")
    switch "$browser_name"
        case 'firefox*'
            "$browser" --new-window "$url" >/dev/null 2>&1 &
            disown >/dev/null 2>&1
        case '*'
            "$browser" --app="$url" >/dev/null 2>&1 &
            disown >/dev/null 2>&1
    end
    return 0
end

# Update FrankMD Docker image
function fed-update
    echo "Checking for updates..."
    set -l old_digest (docker images --digests --format "{{.Digest}}" akitaonrails/frankmd:latest 2>/dev/null | head -1)
    docker pull akitaonrails/frankmd:latest
    set -l new_digest (docker images --digests --format "{{.Digest}}" akitaonrails/frankmd:latest 2>/dev/null | head -1)

    if test "$old_digest" != "$new_digest"
        echo "Updated! Restart FrankMD to use new version."
        docker stop frankmd 2>/dev/null
    else
        echo "Already up to date."
    end
end

# Stop FrankMD
function fed-stop
    if docker stop frankmd 2>/dev/null
        echo "Stopped."
    else
        echo "Not running."
    end
end
