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
`

const outPath = path.join(scriptDir, "..", "app", "javascript", "lib", "icon_data.js")
writeFileSync(outPath, output)
console.log(`Wrote ${results.length} icons to ${outPath}`)
