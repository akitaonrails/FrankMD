import { describe, it, expect } from "vitest"
import { ICON_DATA, getIconMap } from "../../../app/javascript/lib/icon_data.js"

// Guards the curated Phosphor subset (issue #137). The extract script
// (scripts/extract_phosphor_icons.mjs) regenerates this data file; these
// checks catch a regeneration that drops icons, malforms an entry, or loses
// the getIconMap() helper the marked pipeline depends on.
describe("icon_data", () => {
  it("holds a well-formed [name, path, viewBox, keywords] tuple per icon", () => {
    expect(ICON_DATA.length).toBeGreaterThanOrEqual(190)
    for (const entry of ICON_DATA) {
      const [name, path, viewBox, keywords] = entry
      expect(typeof name).toBe("string")
      expect(name.length).toBeGreaterThan(0)
      expect(typeof path).toBe("string")
      expect(path.length).toBeGreaterThan(0)
      expect(viewBox).toBe("0 0 256 256")
      expect(typeof keywords).toBe("string")
    }
  })

  it("has no duplicate icon names", () => {
    const names = ICON_DATA.map(([name]) => name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("includes icons from the expanded editor/dev/media batch", () => {
    const map = getIconMap()
    for (const name of ["rocket", "git-branch", "text-b", "paperclip", "seal-check", "play"]) {
      expect(map[name], `expected :ph-${name}: to resolve`).toBeDefined()
      expect(map[name].path.length).toBeGreaterThan(0)
      expect(map[name].viewBox).toBe("0 0 256 256")
    }
  })

  it("getIconMap() returns a stable cached map keyed by icon name", () => {
    const first = getIconMap()
    expect(first).toBe(getIconMap())
    expect(first.heart).toEqual({ path: expect.any(String), viewBox: "0 0 256 256" })
    expect(Object.keys(first).length).toBe(ICON_DATA.length)
  })
})
