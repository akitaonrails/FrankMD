/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { PinterestImageSource } from "../../../app/javascript/lib/image_sources/pinterest_images.js"

describe("PinterestImageSource", () => {
  let source
  let originalFetch

  beforeEach(() => {
    source = new PinterestImageSource()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe("constructor", () => {
    it("initializes with empty results", () => {
      expect(source.results).toEqual([])
    })
  })

  describe("reset", () => {
    it("clears results", () => {
      source.results = [{ url: "test.jpg" }]
      source.reset()
      expect(source.results).toEqual([])
    })
  })

  describe("search", () => {
    it("returns error for empty query", async () => {
      const result = await source.search("")
      expect(result.error).toBe("Please enter search keywords")
    })

    it("returns error for null query", async () => {
      const result = await source.search(null)
      expect(result.error).toBe("Please enter search keywords")
    })

    it("fetches images from Pinterest API", async () => {
      const mockImages = [
        { url: "https://pinterest.com/1.jpg", title: "Pin 1" },
        { url: "https://pinterest.com/2.jpg", title: "Pin 2" }
      ]

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ images: mockImages })
      })

      const result = await source.search("home decor")

      expect(global.fetch).toHaveBeenCalledWith("/images/search_pinterest?q=home%20decor", expect.objectContaining({ method: "GET" }))
      expect(result.images).toEqual(mockImages)
      expect(result.message).toBe("Found 2 images - click to select")
      expect(source.results).toEqual(mockImages)
    })

    it("handles API error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: "Pinterest blocked" })
      })

      const result = await source.search("cats")

      expect(result.error).toBe("Pinterest blocked")
      expect(source.results).toEqual([])
    })

    it("handles empty results", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ images: [] })
      })

      const result = await source.search("xyznonexistent")

      expect(result.message).toBe("No images found")
      expect(source.results).toEqual([])
    })

    it("handles network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      const result = await source.search("cats")

      expect(result.error).toBe("Search failed. Please try again.")
      expect(source.results).toEqual([])
      expect(console.error).toHaveBeenCalledWith("Pinterest search error:", expect.any(Error))
    })
  })

  describe("renderGrid", () => {
    it("renders empty state when no results", () => {
      const container = { innerHTML: "" }
      source.results = []

      source.renderGrid(container, "click->handler")

      expect(container.innerHTML).toContain("No images found")
    })

    it("renders Pinterest image buttons", () => {
      const container = { innerHTML: "" }
      source.results = [
        {
          url: "https://pinterest.com/full.jpg",
          thumbnail: "https://pinterest.com/thumb.jpg",
          title: "DIY Project",
          source: "pinterest.com",
          width: 600,
          height: 800
        }
      ]

      source.renderGrid(container, "click->image-picker#selectExternalImage")

      expect(container.innerHTML).toContain('data-url="https://pinterest.com/full.jpg"')
      expect(container.innerHTML).toContain('data-thumbnail="https://pinterest.com/thumb.jpg"')
      expect(container.innerHTML).toContain('data-title="DIY Project"')
      expect(container.innerHTML).toContain('data-source="pinterest.com"')
      expect(container.innerHTML).toContain("600x800")
    })

    it("removes broken thumbnails without an inline error handler", () => {
      const container = document.createElement("div")
      source.results = [{ url: "https://pinterest.com/1.jpg", title: "Pin" }]

      source.renderGrid(container, "click->image-picker#selectExternalImage")

      const image = container.querySelector("img")
      expect(image.hasAttribute("onerror")).toBe(false)
      image.dispatchEvent(new Event("error"))
      expect(container.querySelector(".external-image-item")).toBeNull()
    })

    it("handles missing optional fields", () => {
      const container = { innerHTML: "" }
      source.results = [
        { url: "https://pinterest.com/image.jpg" }
      ]

      source.renderGrid(container, "click->handler")

      expect(container.innerHTML).toContain('data-url="https://pinterest.com/image.jpg"')
      expect(container.innerHTML).toContain('data-title=""')
      expect(container.innerHTML).toContain('data-source=""')
    })

    it("escapes HTML in titles", () => {
      const container = { innerHTML: "" }
      source.results = [
        { url: "test.jpg", title: "<script>alert('xss')</script>" }
      ]

      source.renderGrid(container, "click->handler")

      expect(container.innerHTML).not.toContain("<script>")
      expect(container.innerHTML).toContain("&lt;script&gt;")
    })
  })

  describe("deselectAll", () => {
    it("removes selection classes from all items", () => {
      const mockElements = [
        { classList: { remove: vi.fn() } },
        { classList: { remove: vi.fn() } }
      ]
      const container = {
        querySelectorAll: vi.fn().mockReturnValue(mockElements)
      }

      source.deselectAll(container)

      expect(container.querySelectorAll).toHaveBeenCalledWith(".external-image-item")
      mockElements.forEach(el => {
        expect(el.classList.remove).toHaveBeenCalledWith("ring-2", "ring-blue-500")
      })
    })

    it("handles null container", () => {
      expect(() => source.deselectAll(null)).not.toThrow()
    })
  })
})
