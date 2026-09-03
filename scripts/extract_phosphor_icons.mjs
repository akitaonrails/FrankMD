import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// One-off dev script: extracts a curated subset of Phosphor Icons (regular
// style, MIT licensed) from the @phosphor-icons/core package into a plain
// JS data file, so the app has zero runtime dependency on the package.
// Run: node scripts/extract_phosphor_icons.mjs
// Requires: npm install --no-save @phosphor-icons/core (temporary, dev-only)

const ICON_NAMES = [
  ["check", "confirm done yes"],
  ["x", "close cancel remove"],
  ["warning", "alert caution"],
  ["warning-circle", "alert caution info"],
  ["info", "information details"],
  ["question", "help unknown"],
  ["star", "favorite important"],
  ["heart", "love like favorite"],
  ["bookmark", "save mark"],
  ["push-pin", "pin attach"],
  ["tag", "label category"],
  ["folder", "directory files"],
  ["folder-open", "directory open"],
  ["file", "document"],
  ["file-text", "document note"],
  ["note", "sticky memo"],
  ["notepad", "notes list"],
  ["pencil", "edit write"],
  ["pencil-simple", "edit write"],
  ["trash", "delete remove"],
  ["magnifying-glass", "search find"],
  ["calendar", "date schedule"],
  ["clock", "time"],
  ["link", "url hyperlink"],
  ["link-break", "unlink disconnect"],
  ["lock", "secure private"],
  ["lock-open", "unlock public"],
  ["eye", "view show visible"],
  ["eye-slash", "hide invisible"],
  ["arrow-right", "next forward"],
  ["arrow-left", "previous back"],
  ["arrow-up", "top increase"],
  ["arrow-down", "bottom decrease"],
  ["arrow-square-out", "external open"],
  ["caret-right", "expand collapse"],
  ["caret-down", "expand collapse"],
  ["caret-left", "expand collapse"],
  ["caret-up", "expand collapse"],
  ["plus", "add new"],
  ["minus", "subtract remove"],
  ["gear", "settings configure"],
  ["sliders", "settings adjust"],
  ["house", "home"],
  ["user", "person account"],
  ["users", "people team"],
  ["bell", "notification alert"],
  ["bell-slash", "mute notification"],
  ["chat-circle", "message comment"],
  ["chats", "conversation messages"],
  ["envelope", "email mail"],
  ["envelope-open", "email read"],
  ["phone", "call telephone"],
  ["image", "picture photo"],
  ["images", "gallery photos"],
  ["camera", "photo capture"],
  ["video-camera", "video record"],
  ["music-note", "audio song"],
  ["speaker-high", "sound volume"],
  ["speaker-x", "mute silent"],
  ["download-simple", "save export"],
  ["upload-simple", "import send"],
  ["share", "send export"],
  ["share-network", "share social"],
  ["copy", "duplicate clipboard"],
  ["clipboard-text", "paste copy"],
  ["scissors", "cut trim"],
  ["arrows-clockwise", "refresh reload sync"],
  ["arrow-counter-clockwise", "undo revert"],
  ["arrow-clockwise", "redo repeat"],
  ["list", "menu items"],
  ["list-bullets", "bullet list"],
  ["list-numbers", "ordered list"],
  ["list-checks", "checklist todo"],
  ["check-circle", "done success"],
  ["x-circle", "error cancel"],
  ["circle", "dot bullet"],
  ["circle-half", "half toggle"],
  ["square", "box shape"],
  ["squares-four", "grid apps"],
  ["table", "grid data"],
  ["code", "programming syntax"],
  ["terminal", "console command"],
  ["bug", "error debug"],
  ["wrench", "tools repair"],
  ["hammer", "build tools"],
  ["flag", "milestone marker"],
  ["flag-checkered", "finish done"],
  ["target", "goal aim"],
  ["lightbulb", "idea tip"],
  ["fire", "hot trending"],
  ["sparkle", "new magic highlight"],
  ["sun", "light day"],
  ["moon", "dark night"],
  ["cloud", "weather storage"],
  ["cloud-arrow-up", "upload backup"],
  ["cloud-arrow-down", "download sync"],
  ["wifi-high", "network connection"],
  ["wifi-slash", "offline disconnected"],
  ["globe", "world international"],
  ["map-pin", "location place"],
  ["compass", "navigate direction"],
  ["book", "read learn"],
  ["book-open", "read reading"],
  ["bookmarks", "saved favorites"],
  ["graduation-cap", "education learn"],
  ["briefcase", "work business"],
  ["shopping-cart", "purchase buy"],
  ["credit-card", "payment card"],
  ["currency-dollar", "money price"],
  ["chart-bar", "statistics graph"],
  ["chart-line", "trend graph"],
  ["chart-pie", "statistics graph"],
  ["funnel", "filter sort"],
  ["sort-ascending", "order sort"],
  ["sort-descending", "order sort"],
  ["shield-check", "security verified"],
  ["shield-warning", "security alert"],
  ["key", "password access"],
  ["fingerprint", "biometric identity"],
  ["hourglass", "loading waiting"],
  ["timer", "countdown clock"],
  ["alarm", "reminder clock"],
  ["thumbs-up", "like approve"],
  ["thumbs-down", "dislike reject"],
  ["smiley", "emoji happy"],
  ["confetti", "celebrate party"],
  ["skull", "danger death"],
  // --- v0.8.12 expansion (issue #137 follow-up): common editor/dev/media icons ---
  ["text-b", "bold strong"],
  ["text-italic", "italic emphasis"],
  ["text-strikethrough", "strike delete"],
  ["text-underline", "underline"],
  ["text-align-left", "align paragraph"],
  ["text-align-center", "align center"],
  ["quotes", "quote blockquote citation"],
  ["highlighter", "highlight mark"],
  ["eraser", "erase remove"],
  ["paint-brush", "draw paint"],
  ["palette", "colors theme"],
  ["file-plus", "new document add"],
  ["file-pdf", "pdf document"],
  ["file-zip", "archive compressed"],
  ["file-code", "source code"],
  ["file-csv", "spreadsheet data"],
  ["files", "documents multiple"],
  ["folder-plus", "new folder add"],
  ["floppy-disk", "save store"],
  ["printer", "print"],
  ["export", "share out"],
  ["at", "mention email"],
  ["hash", "hashtag tag number"],
  ["paperclip", "attach attachment"],
  ["microphone", "record audio"],
  ["microphone-slash", "mute record"],
  ["paper-plane-tilt", "send message submit"],
  ["megaphone", "announce broadcast"],
  ["play", "start media"],
  ["pause", "pause media"],
  ["stop", "stop media"],
  ["skip-back", "previous track"],
  ["skip-forward", "next track"],
  ["repeat", "loop replay"],
  ["shuffle", "random mix"],
  ["user-circle", "account profile"],
  ["user-plus", "add member invite"],
  ["user-gear", "account settings"],
  ["address-book", "contacts"],
  ["handshake", "deal agreement partner"],
  ["git-branch", "branch version"],
  ["git-commit", "commit version"],
  ["git-merge", "merge version"],
  ["git-pull-request", "pull request pr"],
  ["database", "storage data"],
  ["cpu", "processor chip"],
  ["stack", "layers pile"],
  ["plug", "connect plugin"],
  ["rocket", "launch deploy fast"],
  ["trophy", "award win achievement"],
  ["medal", "award rank"],
  ["crown", "premium royal"],
  ["gift", "present reward"],
  ["package", "box shipment delivery"],
  ["coffee", "break cafe drink"],
  ["cloud-rain", "weather rain"],
  ["lightning", "flash bolt power"],
  ["drop", "water liquid"],
  ["tree", "nature forest"],
  ["leaf", "nature eco plant"],
  ["dots-three", "more menu ellipsis"],
  ["dots-three-vertical", "more menu ellipsis"],
  ["arrow-bend-up-left", "reply back"],
  ["arrows-out", "expand fullscreen"],
  ["arrows-in", "collapse minimize"],
  ["magnifying-glass-plus", "zoom in"],
  ["magnifying-glass-minus", "zoom out"],
  ["sidebar", "panel layout"],
  ["gauge", "speed dashboard meter"],
  ["trend-up", "growth increase up"],
  ["trend-down", "decline decrease down"],
  ["prohibit", "forbidden blocked no"],
  ["seal-check", "verified approved badge"],
]

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
// Source of the extracted SVGs: the @phosphor-icons/core package installed
// temporarily (npm install --no-save @phosphor-icons/core). Pass the assets
// directory as the first argument or via PHOSPHOR_SVG_DIR; the default
// covers a local install in this checkout.
// Example (Windows): node scripts/extract_phosphor_icons.mjs "C:/Users/you/AppData/Local/Temp/phosphor-extract/node_modules/@phosphor-icons/core/assets/regular"
// Example (Linux):   node scripts/extract_phosphor_icons.mjs ./node_modules/@phosphor-icons/core/assets/regular
const svgDir =
  process.argv[2] ||
  process.env.PHOSPHOR_SVG_DIR ||
  path.join(scriptDir, "..", "node_modules", "@phosphor-icons", "core", "assets", "regular")

const results = []
const missing = []

for (const [name, keywords] of ICON_NAMES) {
  const filePath = path.join(svgDir, `${name}.svg`)
  try {
    const svg = readFileSync(filePath, "utf8")
    const pathMatch = svg.match(/<path d="([^"]+)"/)
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/)
    if (!pathMatch || !viewBoxMatch) {
      missing.push(name)
      continue
    }
    results.push([name, pathMatch[1], viewBoxMatch[1], keywords])
  } catch {
    missing.push(name)
  }
}

if (missing.length) {
  console.error("Missing icons (skipped):", missing.join(", "))
}

const output = `// Phosphor Icons (regular style) data — curated subset.
// Source: https://github.com/phosphor-icons/core (MIT License)
// Format: [name, svgPathData, viewBox, keywords]
// Regenerate with: node scripts/extract_phosphor_icons.mjs [svgDir]

export const ICON_DATA = ${JSON.stringify(results, null, 2)}

// Lazy-loaded icon map cache (name -> { path, viewBox })
let iconMapCache = null

// Get icon map (name -> { path, viewBox }), used by marked extensions
// to render \`:ph-name:\` shorthand as inline SVG
export function getIconMap() {
  if (iconMapCache) {
    return iconMapCache
  }

  iconMapCache = {}
  ICON_DATA.forEach(([name, path, viewBox]) => {
    iconMapCache[name] = { path, viewBox }
  })

  return iconMapCache
}
`

const outPath = path.join(scriptDir, "..", "app", "javascript", "lib", "icon_data.js")
writeFileSync(outPath, output)
console.log(`Wrote ${results.length} icons to ${outPath}`)
