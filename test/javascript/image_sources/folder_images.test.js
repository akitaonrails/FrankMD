/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { FolderImageSource } from "../../../app/javascript/lib/image_sources/folder_images.js"

describe("FolderImageSource", () => {
  let source
  let originalFetch
  let originalWindow

  beforeEach(() => {
    source = new FolderImageSource()
    originalFetch = global.fetch
    originalWindow = global.window

    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-url")
    global.URL.revokeObjectURL = vi.fn()

    // Mock Image for getImageDimensions
    global.Image = class {
      constructor() {
        setTimeout(() => {
          this.naturalWidth = 800
          this.naturalHeight = 600
          if (this.onload) this.onload()
        }, 0)
      }
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
    global.window = originalWindow
    vi.restoreAllMocks()
  })

  describe("constructor", () => {
    it("initializes with empty arrays", () => {
      expect(source.displayedImages).toEqual([])
      expect(source.allImages).toEqual([])
    })
  })

  describe("isSupported", () => {
    it("returns true when showDirectoryPicker is available", () => {
      global.window = { showDirectoryPicker: vi.fn() }
      expect(source.isSupported).toBe(true)
    })

    it("returns false when showDirectoryPicker is not available", () => {
      global.window = {}
      expect(source.isSupported).toBe(false)
    })
  })

  describe("reset", () => {
    it("calls cleanup", () => {
      const cleanupSpy = vi.spyOn(source, "cleanup")
      source.reset()
      expect(cleanupSpy).toHaveBeenCalled()
    })
  })

  describe("cleanup", () => {
    it("revokes object URLs", () => {
      source.displayedImages = [
        { objectUrl: "blob:url1" },
        { objectUrl: "blob:url2" },
        { objectUrl: null }
      ]

      source.cleanup()

      expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(2)
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:url1")
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:url2")
    })

    it("clears arrays", () => {
      source.displayedImages = [{ objectUrl: "blob:url" }]
      source.allImages = [{ name: "test.jpg" }]

      source.cleanup()

      expect(source.displayedImages).toEqual([])
      expect(source.allImages).toEqual([])
    })
  })

  describe("browse", () => {
    it("returns error when API not supported", async () => {
      global.window = {}

      const result = await source.browse()

      expect(result.error).toBe("File System Access API not supported")
    })

    it("returns cancelled when user cancels picker", async () => {
      const error = new Error("User cancelled")
      error.name = "AbortError"

      global.window = {
        showDirectoryPicker: vi.fn().mockRejectedValue(error)
      }

      const result = await source.browse()

      expect(result.cancelled).toBe(true)
    })

    it("returns error on other errors", async () => {
      global.window = {
        showDirectoryPicker: vi.fn().mockRejectedValue(new Error("Permission denied"))
      }

      const result = await source.browse()

      expect(result.error).toBe("Error accessing folder")
    })
  })

  describe("filter", () => {
    beforeEach(() => {
      source.allImages = [
        { name: "cat.jpg", file: new Blob(), lastModified: 1000, size: 1024 },
        { name: "dog.png", file: new Blob(), lastModified: 2000, size: 2048 },
        { name: "bird.jpg", file: new Blob(), lastModified: 3000, size: 512 }
      ]
    })

    it("returns all images when no search term", async () => {
      const result = await source.filter("")

      expect(result.total).toBe(3)
    })

    it("filters by name case-insensitively", async () => {
      const result = await source.filter("CAT")

      expect(result.total).toBe(1)
    })

    it("limits displayed images to 10", async () => {
      source.allImages = Array.from({ length: 15 }, (_, i) => ({
        name: `image${i}.jpg`,
        file: new Blob(),
        lastModified: i,
        size: 1024
      }))

      const result = await source.filter("")

      expect(result.displayed).toBe(10)
      expect(result.total).toBe(15)
    })

    it("revokes previous object URLs", async () => {
      source.displayedImages = [
        { objectUrl: "blob:old1" },
        { objectUrl: "blob:old2" }
      ]

      await source.filter("")

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:old1")
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:old2")
    })

    it("creates new object URLs", async () => {
      await source.filter("")

      expect(global.URL.createObjectURL).toHaveBeenCalledTimes(3)
    })
  })

  describe("getImageDimensions", () => {
    it("resolves with dimensions on load", async () => {
      const result = await source.getImageDimensions("blob:test")

      expect(result.width).toBe(800)
      expect(result.height).toBe(600)
    })

    it("resolves with null dimensions on error", async () => {
      global.Image = class {
        constructor() {
          setTimeout(() => {
            if (this.onerror) this.onerror()
          }, 0)
        }
      }

      const result = await source.getImageDimensions("blob:invalid")

      expect(result.width).toBeNull()
      expect(result.height).toBeNull()
    })
  })

  describe("renderGrid", () => {
    it("renders empty state when no images", () => {
      const container = { innerHTML: "" }
      source.displayedImages = []

      source.renderGrid(container, null, "click->handler")

      expect(container.innerHTML).toContain("No images found in folder")
    })

    it("renders images with data attributes", () => {
      const container = { innerHTML: "" }
      source.displayedImages = [
        {
          name: "photo.jpg",
          objectUrl: "blob:url",
          size: 102400,
          width: 800,
          height: 600
        }
      ]

      source.renderGrid(container, null, "click->image-picker#selectLocalFolderImage")

      expect(container.innerHTML).toContain('data-index="0"')
      expect(container.innerHTML).toContain('data-action="click->image-picker#selectLocalFolderImage"')
      expect(container.innerHTML).toContain('src="blob:url"')
      expect(container.innerHTML).toContain("800x600")
      expect(container.innerHTML).toContain("100 KB")
    })

    it("updates status container", () => {
      const container = { innerHTML: "" }
      const statusContainer = { textContent: "" }
      source.displayedImages = [
        { name: "a.jpg", objectUrl: "blob:a", size: 1024 },
        { name: "b.jpg", objectUrl: "blob:b", size: 1024 }
      ]

      source.renderGrid(container, statusContainer, "click->handler")

      expect(statusContainer.textContent).toBe("2 images found")
    })

    it("shows partial count when limited", () => {
      const container = { innerHTML: "" }
      const statusContainer = { textContent: "" }
      source.displayedImages = [
        { name: "a.jpg", objectUrl: "blob:a", size: 1024 }
      ]

      source.renderGrid(container, statusContainer, "click->handler", 50)

      expect(statusContainer.textContent).toBe("Showing 1 most recent of 50 images")
    })

    it("escapes HTML in names", () => {
      const container = { innerHTML: "" }
      source.displayedImages = [
        { name: "<script>xss</script>.jpg", objectUrl: "blob:url", size: 1024 }
      ]

      source.renderGrid(container, null, "click->handler")

      expect(container.innerHTML).not.toContain("<script>")
    })

    it("does not allow a quoted filename to inject image attributes", () => {
      const container = document.createElement("div")
      source.displayedImages = [{ name: 'photo" onerror="alert(1)', objectUrl: "blob:url", size: 1024 }]

      source.renderGrid(container, null, "click->handler")

      expect(container.querySelector("img").hasAttribute("onerror")).toBe(false)
    })
  })

  describe("getImage", () => {
    it("returns image at index", () => {
      source.displayedImages = [
        { name: "a.jpg" },
        { name: "b.jpg" }
      ]

      expect(source.getImage(1).name).toBe("b.jpg")
    })

    it("returns undefined for invalid index", () => {
      source.displayedImages = []

      expect(source.getImage(0)).toBeUndefined()
    })
  })

  describe("deselectAll", () => {
    it("removes selected class from all items", () => {
      const mockElements = [
        { classList: { remove: vi.fn() } }
      ]
      const container = {
        querySelectorAll: vi.fn().mockReturnValue(mockElements)
      }

      source.deselectAll(container)

      expect(container.querySelectorAll).toHaveBeenCalledWith(".image-grid-item")
      expect(mockElements[0].classList.remove).toHaveBeenCalledWith("selected")
    })

    it("handles null container", () => {
      expect(() => source.deselectAll(null)).not.toThrow()
    })
  })

  describe("upload", () => {
    it("uploads file with FormData", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "/images/uploaded.jpg" })
      })

      const file = new Blob(["test"], { type: "image/jpeg" })
      const result = await source.upload(file, "0.5", true)

      expect(global.fetch).toHaveBeenCalledWith("/images/upload", expect.objectContaining({
        method: "POST"
      }))

      // Check FormData contents
      const callArgs = global.fetch.mock.calls[0]
      const formData = callArgs[1].body
      expect(formData).toBeInstanceOf(FormData)

      expect(result.url).toBe("/images/uploaded.jpg")
    })

    it("handles upload error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "File too large" })
      })

      const file = new Blob(["test"])
      await expect(source.upload(file, "", false))
        .rejects.toThrow("File too large")
    })

    it("handles generic error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({})
      })

      const file = new Blob(["test"])
      await expect(source.upload(file, "", false))
        .rejects.toThrow("Upload failed")
    })
  })
})
