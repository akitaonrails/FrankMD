import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const themesDirectory = fileURLToPath(new URL("../../../app/assets/tailwind/themes/", import.meta.url))
const proseStyles = readFileSync(new URL("../../../app/assets/tailwind/components/prose.css", import.meta.url), "utf8")
const syntaxRoles = [
  "keyword",
  "function",
  "type",
  "string",
  "number",
  "constant",
  "identifier",
  "property",
  "operator",
  "comment",
  "punctuation",
  "invalid"
]

const channels = hex => hex.match(/[\da-f]{2}/gi).map(channel => parseInt(channel, 16) / 255)
const linearize = channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
const luminance = hex => {
  const [red, green, blue] = channels(hex).map(linearize)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
const contrastRatio = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

describe("built-in syntax palettes", () => {
  const themeFiles = readdirSync(themesDirectory).filter(file => file.endsWith(".css")).sort()

  it("covers all built-in themes", () => {
    expect(themeFiles).toHaveLength(18)
  })

  for (const file of themeFiles) {
    it(`${file} defines every syntax role with readable contrast`, () => {
      const source = readFileSync(new URL(file, `file://${themesDirectory}/`), "utf8")
      const codeBackground = source.match(/--theme-code-bg:\s*(#[\da-f]{6})/i)?.[1]

      expect(codeBackground, `${file} must define --theme-code-bg`).toBeTruthy()

      for (const role of syntaxRoles) {
        const color = source.match(new RegExp(`--theme-syntax-${role}:\\s*(#[\\da-f]{6})`, "i"))?.[1]

        expect(color, `${file} must define --theme-syntax-${role}`).toBeTruthy()
        expect(
          contrastRatio(color, codeBackground),
          `${file} --theme-syntax-${role} must meet 4.5:1 contrast`
        ).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  it("renders syntax roles without borrowing heading or accent colors", () => {
    for (const role of syntaxRoles) {
      expect(proseStyles).toContain(`var(--theme-syntax-${role},`)
    }

    expect(proseStyles).not.toMatch(/--theme-syntax-[\w-]+,\s*var\(--theme-(?:heading-[1-3]|accent)/)
  })
})
