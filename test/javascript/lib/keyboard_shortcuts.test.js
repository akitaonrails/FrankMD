/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import {
  SHORTCUTS,
  DEFAULT_SHORTCUTS,
  matchShortcut,
  formatShortcut,
  isMacOS,
  findMatchingAction,
  createKeyHandler,
  mergeShortcuts,
  getShortcutForAction
} from "../../../app/javascript/lib/keyboard_shortcuts"

describe("SHORTCUTS", () => {
  it("contains expected shortcut definitions", () => {
    expect(SHORTCUTS.newNote).toEqual({ key: "n", ctrl: true })
    expect(SHORTCUTS.save).toEqual({ key: "s", ctrl: true })
    // Note: bold and italic are handled by CodeMirror's keymap, not app shortcuts
    expect(SHORTCUTS.togglePreview).toEqual({ key: "V", ctrl: true, shift: true })
    expect(SHORTCUTS.findInFile).toEqual({ key: "f", ctrl: true })
    expect(SHORTCUTS.findReplace).toEqual({ key: "h", ctrl: true })
    expect(SHORTCUTS.help).toEqual({ key: "F1" })
  })
})

describe("matchShortcut", () => {
  // Helper to create a mock keyboard event
  function createEvent(key, { ctrl = false, shift = false, alt = false, meta = false } = {}) {
    return {
      key,
      ctrlKey: ctrl,
      shiftKey: shift,
      altKey: alt,
      metaKey: meta
    }
  }

  it("matches simple ctrl+key shortcuts", () => {
    const event = createEvent("s", { ctrl: true })
    expect(matchShortcut(event, SHORTCUTS.save)).toBe(true)
  })

  it("matches meta+key shortcuts (macOS cmd)", () => {
    const event = createEvent("s", { meta: true })
    expect(matchShortcut(event, SHORTCUTS.save)).toBe(true)
  })

  it("matches ctrl+shift+key shortcuts", () => {
    const event = createEvent("V", { ctrl: true, shift: true })
    expect(matchShortcut(event, SHORTCUTS.togglePreview)).toBe(true)
  })

  it("rejects wrong key", () => {
    const event = createEvent("x", { ctrl: true })
    expect(matchShortcut(event, SHORTCUTS.save)).toBe(false)
  })

  it("rejects missing ctrl modifier", () => {
    const event = createEvent("s", { ctrl: false })
    expect(matchShortcut(event, SHORTCUTS.save)).toBe(false)
  })

  it("rejects extra shift modifier", () => {
    const event = createEvent("s", { ctrl: true, shift: true })
    expect(matchShortcut(event, SHORTCUTS.save)).toBe(false)
  })

  it("rejects missing shift modifier", () => {
    const event = createEvent("V", { ctrl: true, shift: false })
    expect(matchShortcut(event, SHORTCUTS.togglePreview)).toBe(false)
  })

  it("matches function keys without modifiers", () => {
    const event = createEvent("F1")
    expect(matchShortcut(event, SHORTCUTS.help)).toBe(true)
  })

  it("rejects function key with extra modifiers", () => {
    const event = createEvent("F1", { ctrl: true })
    expect(matchShortcut(event, SHORTCUTS.help)).toBe(false)
  })

  it("returns false for null/undefined shortcut", () => {
    const event = createEvent("s", { ctrl: true })
    expect(matchShortcut(event, null)).toBe(false)
    expect(matchShortcut(event, undefined)).toBe(false)
  })

  it("returns false for shortcut without key", () => {
    const event = createEvent("s", { ctrl: true })
    expect(matchShortcut(event, {})).toBe(false)
    expect(matchShortcut(event, { ctrl: true })).toBe(false)
  })
})

describe("formatShortcut", () => {
  it("formats simple ctrl+key shortcuts", () => {
    expect(formatShortcut(SHORTCUTS.save)).toBe("Ctrl+S")
    expect(formatShortcut(SHORTCUTS.newNote)).toBe("Ctrl+N")
  })

  it("formats ctrl+shift+key shortcuts", () => {
    expect(formatShortcut(SHORTCUTS.togglePreview)).toBe("Ctrl+Shift+V")
    expect(formatShortcut(SHORTCUTS.contentSearch)).toBe("Ctrl+Shift+F")
  })

  it("formats function keys", () => {
    expect(formatShortcut(SHORTCUTS.help)).toBe("F1")
  })

  it("formats backslash key", () => {
    expect(formatShortcut(SHORTCUTS.typewriterMode)).toBe("Ctrl+\\")
  })

  it("uses Mac-style formatting when requested", () => {
    expect(formatShortcut(SHORTCUTS.save, true)).toBe("⌘S")
    expect(formatShortcut(SHORTCUTS.togglePreview, true)).toBe("⌘⇧V")
  })

  it("returns empty string for null/undefined", () => {
    expect(formatShortcut(null)).toBe("")
    expect(formatShortcut(undefined)).toBe("")
    expect(formatShortcut({})).toBe("")
  })
})

describe("isMacOS", () => {
  it("returns a boolean", () => {
    expect(typeof isMacOS()).toBe("boolean")
  })
})

describe("DEFAULT_SHORTCUTS", () => {
  it("is an alias for SHORTCUTS", () => {
    expect(DEFAULT_SHORTCUTS).toBe(SHORTCUTS)
  })

  it("includes closeDialogs with preventDefault disabled", () => {
    expect(DEFAULT_SHORTCUTS.closeDialogs).toEqual({
      key: "Escape",
      preventDefault: false
    })
  })

  it("includes toggleScrollSync on Ctrl+Shift+\\, distinct from typewriter's Ctrl+\\", () => {
    expect(DEFAULT_SHORTCUTS.toggleScrollSync).toEqual({
      key: "\\",
      ctrl: true,
      shift: true
    })
    expect(DEFAULT_SHORTCUTS.typewriterMode).toEqual({
      key: "\\",
      ctrl: true
    })
  })
})

describe("findMatchingAction", () => {
  function createEvent(key, { ctrl = false, shift = false, alt = false, meta = false } = {}) {
    return {
      key,
      ctrlKey: ctrl,
      shiftKey: shift,
      altKey: alt,
      metaKey: meta
    }
  }

  it("returns action name when shortcut matches", () => {
    const event = createEvent("s", { ctrl: true })
    expect(findMatchingAction(event, DEFAULT_SHORTCUTS)).toBe("save")
  })

  it("returns null when no shortcut matches", () => {
    const event = createEvent("x", { ctrl: true })
    expect(findMatchingAction(event, DEFAULT_SHORTCUTS)).toBeNull()
  })

  it("matches shift+ctrl shortcuts correctly", () => {
    const event = createEvent("V", { ctrl: true, shift: true })
    expect(findMatchingAction(event, DEFAULT_SHORTCUTS)).toBe("togglePreview")
  })

  it("matches Ctrl+Shift+\\ as toggleScrollSync (not typewriterMode)", () => {
    const event = createEvent("\\", { ctrl: true, shift: true })
    expect(findMatchingAction(event, DEFAULT_SHORTCUTS)).toBe("toggleScrollSync")

    const withoutShift = createEvent("\\", { ctrl: true })
    expect(findMatchingAction(withoutShift, DEFAULT_SHORTCUTS)).toBe("typewriterMode")
  })

  it("matches Escape key", () => {
    const event = createEvent("Escape")
    expect(findMatchingAction(event, DEFAULT_SHORTCUTS)).toBe("closeDialogs")
  })
})

describe("createKeyHandler", () => {
  function createEvent(key, { ctrl = false, shift = false, alt = false, meta = false } = {}) {
    return {
      key,
      ctrlKey: ctrl,
      shiftKey: shift,
      altKey: alt,
      metaKey: meta,
      preventDefault: vi.fn()
    }
  }

  it("calls action handler when shortcut matches", () => {
    const handler = vi.fn()
    const keyHandler = createKeyHandler(DEFAULT_SHORTCUTS, handler)
    const event = createEvent("s", { ctrl: true })

    keyHandler(event)

    expect(handler).toHaveBeenCalledWith("save", event)
  })

  it("calls preventDefault by default", () => {
    const handler = vi.fn()
    const keyHandler = createKeyHandler(DEFAULT_SHORTCUTS, handler)
    const event = createEvent("s", { ctrl: true })

    keyHandler(event)

    expect(event.preventDefault).toHaveBeenCalled()
  })

  it("does not call preventDefault when disabled for shortcut", () => {
    const handler = vi.fn()
    const keyHandler = createKeyHandler(DEFAULT_SHORTCUTS, handler)
    const event = createEvent("Escape")

    keyHandler(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith("closeDialogs", event)
  })

  it("does not call handler when no match", () => {
    const handler = vi.fn()
    const keyHandler = createKeyHandler(DEFAULT_SHORTCUTS, handler)
    const event = createEvent("x", { ctrl: true })

    keyHandler(event)

    expect(handler).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe("mergeShortcuts", () => {
  it("returns defaults when no user shortcuts provided", () => {
    const merged = mergeShortcuts(DEFAULT_SHORTCUTS)
    expect(merged).toEqual(DEFAULT_SHORTCUTS)
  })

  it("overrides defaults with user shortcuts", () => {
    const userShortcuts = {
      save: { key: "w", ctrl: true }
    }
    const merged = mergeShortcuts(DEFAULT_SHORTCUTS, userShortcuts)

    expect(merged.save).toEqual({ key: "w", ctrl: true })
    expect(merged.newNote).toEqual(DEFAULT_SHORTCUTS.newNote) // Other shortcuts unchanged
  })

  it("removes shortcuts set to null", () => {
    const userShortcuts = {
      save: null
    }
    const merged = mergeShortcuts(DEFAULT_SHORTCUTS, userShortcuts)

    expect(merged.save).toBeUndefined()
    expect(merged.newNote).toBeDefined()
  })

  it("adds new shortcuts from user config", () => {
    const userShortcuts = {
      customAction: { key: "q", ctrl: true, shift: true }
    }
    const merged = mergeShortcuts(DEFAULT_SHORTCUTS, userShortcuts)

    expect(merged.customAction).toEqual({ key: "q", ctrl: true, shift: true })
  })

  it("does not mutate original defaults", () => {
    const defaults = { save: { key: "s", ctrl: true } }
    const userShortcuts = { save: null }

    mergeShortcuts(defaults, userShortcuts)

    expect(defaults.save).toEqual({ key: "s", ctrl: true })
  })
})

describe("getShortcutForAction", () => {
  it("returns shortcut definition for known action", () => {
    expect(getShortcutForAction(DEFAULT_SHORTCUTS, "save")).toEqual({ key: "s", ctrl: true })
  })

  it("returns null for unknown action", () => {
    expect(getShortcutForAction(DEFAULT_SHORTCUTS, "unknownAction")).toBeNull()
  })
})
