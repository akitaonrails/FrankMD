/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { FolderImageSource, extOf, DEFAULT_IMAGE_EXTENSIONS } from "../../../app/javascript/lib/image_sources/folder_images.js"

// The Drop tab reuses FolderImageSource.ingest() to turn dropped File objects
// into the same preview/upload machinery the Folder tab uses.
describe("FolderImageSource.ingest (drag-and-drop)", () => {
  let source

  beforeEach(() => {
    source = new FolderImageSource()

    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-url")
    global.URL.revokeObjectURL = vi.fn()

    global.Image = class {
      constructor() {
        setTimeout(() => {
          this.naturalWidth = 100
          this.naturalHeight = 100
          if (this.onload) this.onload()
        }, 0)
      }
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function file(name) {
    return { name, lastModified: 1, size: 10 }
  }

  it("accepts files whose extension is in the allowed list", async () => {
    const result = await source.ingest([file("a.png"), file("b.jpg")], DEFAULT_IMAGE_EXTENSIONS)

    expect(result.count).toBe(2)
    expect(result.rejected).toEqual([])
  })

  it("rejects disallowed files and reports the extension as the reason", async () => {
    const result = await source.ingest([file("a.png"), file("notes.txt")], DEFAULT_IMAGE_EXTENSIONS)

    expect(result.count).toBe(1)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].name).toBe("notes.txt")
    expect(result.rejected[0].ext).toBe(".txt")
  })

  it("labels files with no extension", async () => {
    const result = await source.ingest([file("README")], DEFAULT_IMAGE_EXTENSIONS)

    expect(result.count).toBe(0)
    expect(result.rejected[0].ext).toBe("no extension")
  })

  it("respects a custom (config-overridden) extension list", async () => {
    // Only .webp allowed -> a png is now rejected.
    const result = await source.ingest([file("a.png"), file("b.webp")], [".webp"])

    expect(result.count).toBe(1)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].name).toBe("a.png")
  })
})

describe("extOf", () => {
  it("returns the trailing extension", () => {
    expect(extOf("video.final.MP4")).toBe(".mp4")
  })

  it("returns a readable label when there is no extension", () => {
    expect(extOf("README")).toBe("no extension")
  })
})
