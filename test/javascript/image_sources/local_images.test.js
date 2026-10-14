/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { LocalImageSource } from "../../../app/javascript/lib/image_sources/local_images.js"

describe("LocalImageSource", () => {
  let source
  let originalFetch

  beforeEach(() => {
    source = new LocalImageSource()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe("constructor", () => {
    it("initializes with null selectedPath", () => {
      expect(source.selectedPath).toBeNull()
    })
  })

  describe("reset", () => {
    it("clears selectedPath", () => {
      source.selectedPath = "/images/photo.jpg"
      source.reset()
      expect(source.selectedPath).toBeNull()
    })
  })

  describe("load", () => {
    it("fetches all images when no search, defaulting to limit 10 offset 0", async () => {
      const mockData = {
        images: [
          { path: "photo1.jpg", name: "Photo 1" },
          { path: "photo2.jpg", name: "Photo 2" }
        ],
        total: 2,
        limit: 10,
        offset: 0
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData)
      })

      const result = await source.load()

      expect(global.fetch).toHaveBeenCalledWith("/images?limit=10&offset=0", expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Accept": "application/json" })
      }))
      expect(result).toEqual(mockData)
    })

    it("fetches images with search query", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ images: [], total: 0, limit: 10, offset: 0 })
      })

      await source.load("sunset")

      expect(global.fetch).toHaveBeenCalledWith("/images?search=sunset&limit=10&offset=0", expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Accept": "application/json" })
      }))
    })

    it("encodes search query", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ images: [], total: 0, limit: 10, offset: 0 })
      })

      await source.load("cats & dogs")

      expect(global.fetch).toHaveBeenCalledWith("/images?search=cats%20%26%20dogs&limit=10&offset=0", expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Accept": "application/json" })
      }))
    })

    it("passes custom limit and offset as query params", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ images: [], total: 0, limit: 25, offset: 25 })
      })

      await source.load("", { limit: 25, offset: 25 })

      expect(global.fetch).toHaveBeenCalledWith("/images?limit=25&offset=25", expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Accept": "application/json" })
      }))
    })

    it("handles failed response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false
      })

      const result = await source.load()

      expect(result.error).toBe("Error loading images")
    })

    it("handles network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      const result = await source.load()

      expect(result.error).toBe("Error loading images")
    })
  })

  describe("renderGrid", () => {
    it("renders empty state when no images", () => {
      const container = { innerHTML: "" }

      source.renderGrid([], container, "click->handler")

      expect(container.innerHTML).toContain("No images found")
      expect(container.innerHTML).toContain("image-grid-empty")
    })

    it("renders null images as empty", () => {
      const container = { innerHTML: "" }

      source.renderGrid(null, container, "click->handler")

      expect(container.innerHTML).toContain("No images found")
    })

    it("renders image grid items", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "photos/cat.jpg", name: "cat.jpg", width: 800, height: 600 }
      ]

      source.renderGrid(images, container, "click->image-picker#selectImage")

      expect(container.innerHTML).toContain('data-path="photos/cat.jpg"')
      expect(container.innerHTML).toContain('data-name="cat.jpg"')
      expect(container.innerHTML).toContain('data-action="click->image-picker#selectImage"')
      expect(container.innerHTML).toContain("800x600")
      expect(container.innerHTML).toContain("image-grid-item")
    })

    it("marks selected image", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "photos/cat.jpg", name: "cat.jpg" },
        { path: "photos/dog.jpg", name: "dog.jpg" }
      ]
      source.selectedPath = "photos/cat.jpg"

      source.renderGrid(images, container, "click->handler")

      expect(container.innerHTML).toContain('class="image-grid-item selected"')
    })

    it("generates preview URL with encoded path", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "photos/my cat.jpg", name: "my cat.jpg" }
      ]

      source.renderGrid(images, container, "click->handler")

      expect(container.innerHTML).toContain('/images/preview/photos/my%20cat.jpg')
    })

    it("escapes HTML in names", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "test.jpg", name: "<script>alert('xss')</script>" }
      ]

      source.renderGrid(images, container, "click->handler")

      expect(container.innerHTML).not.toContain("<script>")
    })

    it("does not allow a quoted filename to inject image attributes", () => {
      const container = document.createElement("div")
      source.renderGrid([{ path: "photo.jpg", name: 'photo" onerror="alert(1)' }], container, "click->handler")

      expect(container.querySelector("img").hasAttribute("onerror")).toBe(false)
    })

    it("handles images without dimensions", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "test.jpg", name: "test.jpg" }
      ]

      source.renderGrid(images, container, "click->handler")

      expect(container.innerHTML).toContain('title="test.jpg"')
      expect(container.innerHTML).not.toContain("image-dimensions")
    })
  })

  describe("deselectAll", () => {
    it("removes selected class from all items", () => {
      const mockElements = [
        { classList: { remove: vi.fn() } },
        { classList: { remove: vi.fn() } }
      ]
      const container = {
        querySelectorAll: vi.fn().mockReturnValue(mockElements)
      }

      source.deselectAll(container)

      expect(container.querySelectorAll).toHaveBeenCalledWith(".image-grid-item")
      mockElements.forEach(el => {
        expect(el.classList.remove).toHaveBeenCalledWith("selected")
      })
    })

    it("handles null container", () => {
      expect(() => source.deselectAll(null)).not.toThrow()
    })
  })

  describe("uploadToS3", () => {
    it("uploads image to S3", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "https://s3.example.com/image.jpg" })
      })

      const result = await source.saveCopy("photos/cat.jpg", "0.5")

      expect(global.fetch).toHaveBeenCalledWith("/images/import", expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Accept": "application/json"
        }),
        body: JSON.stringify({ path: "photos/cat.jpg", resize: "0.5" })
      }))
      expect(result.url).toBe("https://s3.example.com/image.jpg")
    })

    it("handles upload error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "S3 bucket not configured" })
      })

      await expect(source.saveCopy("test.jpg", ""))
        .rejects.toThrow("S3 bucket not configured")
    })

    it("handles generic upload error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({})
      })

      await expect(source.saveCopy("test.jpg", ""))
        .rejects.toThrow("Failed to upload to S3")
    })
  })

  describe("deleteImage", () => {
    it("sends a DELETE to the encoded file path", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      const result = await source.deleteImage("photos/cat.jpg")

      expect(global.fetch).toHaveBeenCalledWith("/images/file/photos/cat.jpg", expect.objectContaining({
        method: "DELETE"
      }))
      expect(result.success).toBe(true)
    })

    it("throws with the server error message on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Image not found or could not be deleted" })
      })

      await expect(source.deleteImage("gone.jpg"))
        .rejects.toThrow("Image not found or could not be deleted")
    })

    it("throws a generic error when the server gives none", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({})
      })

      await expect(source.deleteImage("gone.jpg"))
        .rejects.toThrow("Failed to delete image")
    })
  })
})
