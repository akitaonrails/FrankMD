import { describe, it, expect } from "vitest"
import { toggleTaskMarker, applyTaskToggle } from "../../../app/javascript/lib/task_utils.js"

describe("toggleTaskMarker", () => {
  it("checks an unchecked task", () => {
    expect(toggleTaskMarker("- [ ] buy milk")).toBe("- [x] buy milk")
  })

  it("unchecks a checked task", () => {
    expect(toggleTaskMarker("- [x] buy milk")).toBe("- [ ] buy milk")
  })

  it("handles * and + bullets", () => {
    expect(toggleTaskMarker("* [ ] a")).toBe("* [x] a")
    expect(toggleTaskMarker("+ [x] a")).toBe("+ [ ] a")
  })

  it("handles ordered task items", () => {
    expect(toggleTaskMarker("3. [ ] a")).toBe("3. [x] a")
    expect(toggleTaskMarker("1) [x] a")).toBe("1) [ ] a")
  })

  it("handles an uppercase X marker and end-of-line task", () => {
    expect(toggleTaskMarker("- [X] done")).toBe("- [ ] done")
    expect(toggleTaskMarker("- [x]")).toBe("- [ ]")
  })

  it("preserves indentation", () => {
    expect(toggleTaskMarker("  - [ ] nested")).toBe("  - [x] nested")
  })

  it("returns null for non-task lines", () => {
    expect(toggleTaskMarker("plain text")).toBeNull()
    expect(toggleTaskMarker("- no marker")).toBeNull()
    expect(toggleTaskMarker("- [y] not gfm")).toBeNull()
    expect(toggleTaskMarker("[ ] no bullet")).toBeNull()
    expect(toggleTaskMarker("")).toBeNull()
  })
})

describe("applyTaskToggle", () => {
  it("toggles an existing task", () => {
    expect(applyTaskToggle("- [ ] a")).toBe("- [x] a")
    expect(applyTaskToggle("- [x] a")).toBe("- [ ] a")
  })

  it("turns a plain line into an unchecked task", () => {
    expect(applyTaskToggle("buy milk")).toBe("- [ ] buy milk")
  })

  it("preserves indentation when creating a task", () => {
    expect(applyTaskToggle("  indented")).toBe("  - [ ] indented")
  })

  it("creates a bare marker on an empty line", () => {
    expect(applyTaskToggle("")).toBe("- [ ]")
    expect(applyTaskToggle("   ")).toBe("   - [ ]")
  })
})
