/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Vim } from "@replit/codemirror-vim"
import { vimCompartment, vimExtension, configureVimKeys, CONFLICTING_VIM_KEYS } from "lib/codemirror_vim"
import { createExtensions } from "lib/codemirror_extensions"

describe("vimExtension", () => {
  it("contributes nothing when vim mode is off", () => {
    expect(vimExtension(false)).toEqual([])
  })

  it("returns extensions when vim mode is on", () => {
    const ext = vimExtension(true)
    expect(Array.isArray(ext)).toBe(true)
    expect(ext.length).toBeGreaterThan(0)
  })
})

describe("configureVimKeys", () => {
  let unmapSpy

  beforeEach(() => {
    unmapSpy = vi.spyOn(Vim, "unmap").mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("unmaps the bindings that collide with app shortcuts", () => {
    // Fresh key list so the module-level "already configured" latch doesn't hide it
    const applied = configureVimKeys(["<C-f>"])

    // On macOS the app binds Cmd, so vim keeps its keymap and nothing is unmapped
    if (applied) {
      expect(unmapSpy).toHaveBeenCalledWith("<C-f>")
    } else {
      expect(unmapSpy).not.toHaveBeenCalled()
    }
  })

  it("lists the shortcuts the app itself binds", () => {
    // Ctrl+F/N/P/E are app shortcuts, Ctrl+B/I are the markdown keymap,
    // Ctrl+V is browser paste — all must be surrendered by vim.
    expect(CONFLICTING_VIM_KEYS).toEqual(
      expect.arrayContaining(["<C-f>", "<C-n>", "<C-p>", "<C-e>", "<C-b>", "<C-i>", "<C-v>"])
    )
  })
})

describe("extension ordering", () => {
  it("keeps the vim compartment first so vim wins the keydown race", () => {
    // Load-bearing: keymap's handler is registered at Prec.default, so
    // Prec.highest(keymap.of(...)) does NOT outrank vim — only array order does.
    // If this fails, vim's normal mode silently stops working.
    const extensions = createExtensions({})

    expect(extensions[0].compartment).toBe(vimCompartment)
  })
})
