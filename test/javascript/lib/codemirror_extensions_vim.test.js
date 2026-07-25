/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { createVimExtension, createExtensions, vimCompartment } from "../../../app/javascript/lib/codemirror_extensions.js"

describe("createVimExtension()", () => {
  it("returns the vim extension when enabled", () => {
    const ext = createVimExtension(true)
    // The vitest mock's vim() returns a marker object.
    expect(ext).toMatchObject({ __isVim: true })
    expect(ext.options).toMatchObject({ status: true })
  })

  it("returns nothing (empty) when disabled — editor is unchanged", () => {
    expect(createVimExtension(false)).toEqual([])
  })
})

describe("vim extension ordering", () => {
  it("keeps the vim compartment first in createExtensions()", () => {
    // Load-bearing, and it fails silently. keymap registers its key handler at
    // Prec.default, so Prec.highest(keymap.of(...)) does NOT outrank vim —
    // only position in this array decides who sees the keydown first. Move the
    // compartment below any keymap.of() and vim's normal mode quietly stops
    // working (Enter/Backspace/arrows get taken by defaultKeymap).
    const extensions = createExtensions({})

    expect(extensions[0].compartment).toBe(vimCompartment)
  })
})
