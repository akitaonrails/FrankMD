/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { registerVimCommands, observeVimMode, EX_COMMANDS, _resetVimCommands } from "../../../app/javascript/lib/vim_mode.js"
import { __vimMock } from "@replit/codemirror-vim"

describe("vim_mode", () => {
  beforeEach(() => {
    __vimMock.reset()
    _resetVimCommands()
  })

  describe("registerVimCommands()", () => {
    it("defines one ex-command per entry, with its abbreviation prefix", () => {
      registerVimCommands({ onCommand: () => {} })

      expect(__vimMock.exCommands.length).toBe(EX_COMMANDS.length)
      const names = __vimMock.exCommands.map(c => c.name)
      expect(names).toContain("write")
      expect(names).toContain("quit")
      expect(names).toContain("Explore")
      // :noh is intentionally NOT overridden (library owns it).
      expect(names).not.toContain("nohlsearch")
    })

    it("invokes onCommand with the logical command name when an ex-command runs", () => {
      const onCommand = vi.fn()
      registerVimCommands({ onCommand })

      const write = __vimMock.exCommands.find(c => c.name === "write")
      write.fn({}, { args: [] })
      expect(onCommand).toHaveBeenCalledWith("save", expect.objectContaining({ args: [] }))

      const explore = __vimMock.exCommands.find(c => c.name === "Explore")
      explore.fn({}, {})
      expect(onCommand).toHaveBeenCalledWith("toggle-sidebar", expect.anything())
    })

    it("is idempotent — a second call does not double-register", () => {
      registerVimCommands({ onCommand: () => {} })
      registerVimCommands({ onCommand: () => {} })
      expect(__vimMock.exCommands.length).toBe(EX_COMMANDS.length)
    })
  })

  describe("observeVimMode()", () => {
    it("maps mode-change events to onModeChange, including visual submode", () => {
      const onModeChange = vi.fn()
      observeVimMode({}, { onModeChange })

      expect(__vimMock.modeChangeHandlers.length).toBe(1)
      const fire = __vimMock.modeChangeHandlers[0]

      fire({ mode: "normal" })
      expect(onModeChange).toHaveBeenCalledWith("normal")

      fire({ mode: "insert" })
      expect(onModeChange).toHaveBeenCalledWith("insert")

      fire({ mode: "visual", subMode: "linewise" })
      expect(onModeChange).toHaveBeenCalledWith("visual-linewise")
    })

    it("ignores events with no mode", () => {
      const onModeChange = vi.fn()
      observeVimMode({}, { onModeChange })
      __vimMock.modeChangeHandlers[0]({})
      expect(onModeChange).not.toHaveBeenCalled()
    })
  })
})

describe("nextNoteIndex()", () => {
  it("wraps forward and backward", async () => {
    const { nextNoteIndex } = await import("../../../app/javascript/lib/vim_mode.js")
    expect(nextNoteIndex(3, 0, 1)).toBe(1)
    expect(nextNoteIndex(3, 2, 1)).toBe(0)   // wrap to start
    expect(nextNoteIndex(3, 0, -1)).toBe(2)  // wrap to end
    expect(nextNoteIndex(3, 1, -1)).toBe(0)
  })

  it("starts at first (forward) or last (backward) when nothing is selected", async () => {
    const { nextNoteIndex } = await import("../../../app/javascript/lib/vim_mode.js")
    expect(nextNoteIndex(3, -1, 1)).toBe(0)
    expect(nextNoteIndex(3, -1, -1)).toBe(2)
  })

  it("returns -1 when there are no notes", async () => {
    const { nextNoteIndex } = await import("../../../app/javascript/lib/vim_mode.js")
    expect(nextNoteIndex(0, -1, 1)).toBe(-1)
  })
})
