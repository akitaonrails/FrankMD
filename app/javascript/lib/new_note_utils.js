// Mirrors the server-side note creation rules (NotesController#create and
// HugoService.generate_blog_post) so the New Note dialog can preview the exact
// path that will be created, and gate the Create button on the same rules.
// Keep in sync with the Ruby side if creation behavior changes.

// Map of accented characters to ASCII equivalents — mirrors HugoService::ACCENT_MAP
const ACCENT_MAP = {
  "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "æ": "ae",
  "ç": "c", "č": "c", "ć": "c",
  "è": "e", "é": "e", "ê": "e", "ë": "e", "ě": "e",
  "ì": "i", "í": "i", "î": "i", "ï": "i",
  "ð": "d", "ď": "d",
  "ñ": "n", "ň": "n",
  "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o",
  "ù": "u", "ú": "u", "û": "u", "ü": "u", "ů": "u",
  "ý": "y", "ÿ": "y",
  "ž": "z", "ź": "z", "ż": "z",
  "ß": "ss", "þ": "th",
  "š": "s", "ś": "s",
  "ř": "r",
  "ł": "l"
}

// Generate a URL-safe slug from text — mirrors HugoService.slugify
export function slugify(text) {
  const mapped = [...(text || "").toLowerCase()]
    .map(c => ACCENT_MAP[c] || c)
    .join("")

  return mapped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-+/g, "-")
}

// Hugo dated-path segment, e.g. "2026/08/18" (browser-local date).
// The server uses its own timezone (Time.current); across timezones around
// midnight the preview may be off by a day, which is acceptable for a preview.
export function hugoDatePath(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}/${month}/${day}`
}

// A note name is valid when it is non-empty (after trimming) and does not try
// to sneak path segments into the name (slashes, "." or "..").
export function isValidNoteName(name) {
  const trimmed = (name || "").trim()
  if (!trimmed) return false
  if (trimmed.includes("/")) return false
  if (trimmed === "." || trimmed === "..") return false
  return true
}

// Whether the Create action is allowed for the given name and template.
// Guards the submit path (Enter key) in addition to the disabled button.
export function canCreateNote(name, template = "empty") {
  const trimmed = (name || "").trim()
  if (!isValidNoteName(trimmed)) return false
  if (template === "hugo") {
    return slugify(trimmed.replace(/\.md$/, "")).length > 0
  }
  return true
}

// Compute the live path preview for the New Note dialog.
//
// options:
//   name            - raw value from the name input
//   parent          - parent folder path ("" for root)
//   template        - "empty" (plain markdown) or "hugo" (page bundle)
//   date            - Date used for the Hugo date segment (injectable for tests)
//   namePlaceholder - localized slot shown in the path while the name is empty
//   rootSegment     - localized "root" label shown when creating at the root
//
// Returns { valid, empty, path }:
//   valid - false when the current name cannot be used to create a note
//   empty - true when the name is blank (preview shows the muted slot)
//   path  - the full path string to display
export function previewNotePath({ name, parent = "", template = "empty", date = new Date(), namePlaceholder = "name", rootSegment = "root" }) {
  const trimmed = (name || "").trim()
  const empty = !trimmed
  const where = parent || rootSegment

  if (template === "hugo") {
    const slug = slugify(trimmed.replace(/\.md$/, ""))
    const slot = slug || trimmed || namePlaceholder
    return {
      valid: canCreateNote(trimmed, "hugo"),
      empty,
      path: `${where}/${hugoDatePath(date)}/${slot}/index.md`
    }
  }

  const fileName = trimmed
    ? (trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`)
    : `${namePlaceholder}.md`

  return { valid: canCreateNote(trimmed, "empty"), empty, path: `${where}/${fileName}` }
}
