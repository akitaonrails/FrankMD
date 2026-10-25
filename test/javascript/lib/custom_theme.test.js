/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"
import { COLOR_KEYS, normalizeColor, themeColor, contrastRatio, applyCustomColors, clearCustomColors } from "../../../app/javascript/lib/custom_theme"

afterEach(() => { clearCustomColors(); document.documentElement.style.removeProperty("--editor-width") })

describe("custom palette", () => {
  it("accepts hex colors and rejects CSS expressions", () => {
    expect(normalizeColor(" #AABBCC ")).toBe("#aabbcc")
    for (const color of [null, "#abc", "red", "url(https://example.com)", "#ffffff;display:none"]) {
      expect(normalizeColor(color)).toBeNull()
    }
  })

  it("applies only known color tokens and cleans up without touching layout", () => {
    document.documentElement.style.setProperty("--editor-width", "72ch")
    applyCustomColors({ accent: "#112233", "bg-primary": "url(secret)", "font-family": "#abcdef" })
    expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("#112233")
    expect(document.documentElement.style.getPropertyValue("--theme-bg-primary")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--theme-font-family")).toBe("")
    clearCustomColors()
    for (const key of COLOR_KEYS) expect(document.documentElement.style.getPropertyValue(`--theme-${key}`)).toBe("")
    expect(document.documentElement.style.getPropertyValue("--editor-width")).toBe("72ch")
  })

  it("computes contrast using linearized color channels", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBe(21)
    expect(contrastRatio("#123456", "#123456")).toBe(1)
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.478, 2)
    expect(contrastRatio("", "#ffffff")).toBeNull()
  })

  it("expands minified base colors without allowing incomplete user hex input", () => {
    const styles = { getPropertyValue: () => " #fff " }
    expect(themeColor(styles, "accent-text")).toBe("#ffffff")
    expect(normalizeColor("#fff")).toBeNull()
  })
})
