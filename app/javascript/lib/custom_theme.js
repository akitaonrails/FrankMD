export const COLOR_KEYS = [
  "bg-primary", "bg-secondary", "bg-tertiary", "bg-hover", "text-primary", "text-secondary",
  "text-muted", "text-faint", "border", "accent", "accent-hover", "accent-text", "selection",
  "selection-text", "scrollbar", "scrollbar-hover", "success", "warning", "error", "code-bg",
  "heading-1", "heading-2", "heading-3", "folder-icon", "file-icon", "config-icon",
  "syntax-keyword", "syntax-function", "syntax-type", "syntax-string", "syntax-number",
  "syntax-constant", "syntax-identifier", "syntax-property", "syntax-operator",
  "syntax-comment", "syntax-punctuation", "syntax-invalid"
]

export function normalizeColor(value) {
  if (typeof value !== "string") return null
  const color = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(color) ? color : null
}

// The CSS build compresses built-in colors such as #ffffff to #fff.
export function themeColor(styles, key) {
  const value = styles.getPropertyValue(`--theme-${key}`).trim()
  const expanded = /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map(char => char + char).join("")}` : value
  const hex = normalizeColor(expanded)
  if (hex || !globalThis.CSS?.supports("color", value)) return hex
  // The optimizer also emits short named colors, for example khaki and red.
  const context = document.createElement("canvas").getContext("2d")
  if (!context) return null
  context.fillStyle = value
  return normalizeColor(context.fillStyle)
}

export function applyCustomColors(colors) {
  for (const [key, value] of Object.entries(colors || {})) {
    if (COLOR_KEYS.includes(key) && typeof value === "string" && normalizeColor(value)) {
      document.documentElement.style.setProperty(`--theme-${key}`, normalizeColor(value))
    }
  }
}

export function clearCustomColors() {
  for (const key of COLOR_KEYS) document.documentElement.style.removeProperty(`--theme-${key}`)
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

export function contrastRatio(foreground, background) {
  if (!normalizeColor(foreground) || !normalizeColor(background)) return null
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}
