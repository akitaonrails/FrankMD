/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { imageFileFromClipboard, normalizeImageFile } from "../../../app/javascript/lib/clipboard_image.js"

function item(kind, type, file) {
  return { kind, type, getAsFile: () => file }
}

describe("imageFileFromClipboard()", () => {
  it("returns the image File when the clipboard carries one", () => {
    const png = new File(["x"], "shot.png", { type: "image/png" })
    const result = imageFileFromClipboard({ items: [item("file", "image/png", png)] })
    expect(result).toBeInstanceOf(File)
    expect(result.name).toBe("shot.png")
  })

  it("skips non-file and non-image items", () => {
    const items = [
      item("string", "text/plain", null),
      item("file", "application/pdf", new File(["x"], "doc.pdf", { type: "application/pdf" }))
    ]
    expect(imageFileFromClipboard({ items })).toBeNull()
  })

  it("returns null for empty or missing clipboard data", () => {
    expect(imageFileFromClipboard(null)).toBeNull()
    expect(imageFileFromClipboard({ items: [] })).toBeNull()
  })
})

describe("normalizeImageFile()", () => {
  it("synthesizes a filename with an extension from the MIME type", () => {
    const blob = new File(["x"], "", { type: "image/png" })
    const result = normalizeImageFile(blob)
    expect(result.name).toMatch(/^pasted-image-.*\.png$/)
    expect(result.type).toBe("image/png")
  })

  it("leaves a file that already has an extension untouched", () => {
    const named = new File(["x"], "photo.jpg", { type: "image/jpeg" })
    expect(normalizeImageFile(named)).toBe(named)
  })
})
