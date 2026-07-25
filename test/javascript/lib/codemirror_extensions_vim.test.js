/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { createVimExtension } from "../../../app/javascript/lib/codemirror_extensions.js"

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
