import DOMPurify from "dompurify"

// HTML sanitizer for the rendered markdown preview.
//
// marked passes raw HTML through by design, and the preview is injected with
// innerHTML, so a note containing <script> or an onerror handler would execute
// in the app origin with access to the whole notes API. Note content is not
// necessarily authored here — vaults get synced, cloned, and downloaded — so it
// is treated as untrusted input.

// Hosts allowed as <iframe> sources. The video dialog only emits YouTube
// embeds; the others are common providers kept for hand-written notes.
const ALLOWED_EMBED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.vimeo.com"
])

// DOMPurify drops <iframe> by default, which would silently break every video
// embed already in people's notes. Allow the tag plus the attributes the video
// dialog emits — but never "srcdoc", which is an XSS vector in itself.
const SANITIZE_CONFIG = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "referrerpolicy"]
}

let purifier = null

function getPurifier() {
  if (purifier) return purifier

  // Use an isolated instance so the src hook below never touches the shared
  // DOMPurify singleton.
  purifier = DOMPurify(globalThis.window)

  purifier.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return

    let allowed = false
    try {
      const url = new URL(node.getAttribute("src") || "", globalThis.window.location.href)
      allowed = url.protocol === "https:" && ALLOWED_EMBED_HOSTS.has(url.hostname)
    } catch {
      allowed = false
    }

    if (!allowed) node.parentNode?.removeChild(node)
  })

  return purifier
}

// Sanitize rendered markdown HTML before it is assigned to innerHTML.
// Deliberately has no "pass the input through if DOMPurify is missing" branch:
// failing loudly is correct, since a silent passthrough would reopen the hole.
export function sanitizeHtml(html) {
  if (!html) return ""
  return getPurifier().sanitize(html, SANITIZE_CONFIG)
}
