/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { GoogleImageSource } from "../../../app/javascript/lib/image_sources/google_images.js"

describe("GoogleImageSource", () => {
  let source
  let originalFetch

  beforeEach(() => {
    source = new GoogleImageSource()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe("constructor", () => {
    it("initializes with default state", () => {
      expect(source.enabled).toBe(false)
      expect(source.results).toEqual([])
      expect(source.nextStart).toBe(0)
      expect(source.loading).toBe(false)
      expect(source.query).toBe("")
    })
  })

  describe("reset", () => {
    it("clears all state except enabled", () => {
      source.enabled = true
      source.results = [{ url: "test.jpg" }]
      source.nextStart = 10
      source.loading = true
      source.query = "cats"

      source.reset()

      expect(source.enabled).toBe(true) // should persist
      expect(source.results).toEqual([])
      expect(source.nextStart).toBe(0)
      expect(source.loading).toBe(false)
      expect(source.query).toBe("")
    })
  })

  describe("search", () => {
    it("returns error for empty query", async () => {
      const result = await source.search("")
      expect(result.error).toBe("Please enter search keywords")
    })

    it("resets state and calls loadMore", async () => {
      source.results = [{ url: "old.jpg" }]
      source.nextStart = 10

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          images: [{ url: "new.jpg" }],
          next_start: 11,
          total: 100
        })
      })

      await source.search("cats")

      expect(source.query).toBe("cats")
      expect(source.nextStart).toBe(11)
    })
  })

  describe("loadMore", () => {
    it("fetches images with pagination", async () => {
      source.query = "cats"
      source.nextStart = 1

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          images: [{ url: "http://example.com/1.jpg" }],
          next_start: 11,
          total: 50
        })
      })

      const result = await source.loadMore()

      expect(global.fetch).toHaveBeenCalledWith("/images/search_google?q=cats&start=1", expect.objectContaining({ method: "GET" }))
      expect(result.images).toHaveLength(1)
      expect(result.total).toBe(50)
      expect(source.nextStart).toBe(11)
    })

    it("appends to existing results", async () => {
      source.query = "cats"
      source.nextStart = 11
      source.results = [{ url: "first.jpg" }]

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          images: [{ url: "second.jpg" }],
          next_start: 21
        })
      })

      await source.loadMore()

      expect(source.results).toHaveLength(2)
      expect(source.results[0].url).toBe("first.jpg")
      expect(source.results[1].url).toBe("second.jpg")
    })

    it("prevents concurrent loading", async () => {
      source.loading = true
      source.results = [{ url: "existing.jpg" }]

      const mockFetch = vi.fn()
      global.fetch = mockFetch

      const result = await source.loadMore()

      expect(result.images).toEqual([{ url: "existing.jpg" }])
      expect(mockFetch).not.toHaveBeenCalled() // fetch not called
    })

    it("handles API error", async () => {
      source.query = "cats"
      source.nextStart = 1

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: "API key invalid" })
      })

      const result = await source.loadMore()

      expect(result.error).toBe("API key invalid")
      expect(source.loading).toBe(false)
    })

    it("handles network error", async () => {
      source.query = "cats"
      source.nextStart = 1

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      const result = await source.loadMore()

      expect(result.error).toBe("Search failed. Please try again.")
      expect(source.loading).toBe(false)
      expect(console.error).toHaveBeenCalledWith("Google search error:", expect.any(Error))
    })

    it("returns appropriate message for empty results", async () => {
      source.query = "cats"
      source.nextStart = 1

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ images: [] })
      })

      const result = await source.loadMore()

      expect(result.message).toBe("No images found")
    })

    it("returns count message for results", async () => {
      source.query = "cats"
      source.nextStart = 1

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          images: [{ url: "1.jpg" }, { url: "2.jpg" }],
          total: 150
        })
      })

      const result = await source.loadMore()

      expect(result.message).toBe("Found 150 images - click to select")
    })
  })

  describe("shouldLoadMore", () => {
    it("returns true when near bottom and not loading", () => {
      source.loading = false
      source.results = [{ url: "test.jpg" }]

      expect(source.shouldLoadMore(50)).toBe(true)
    })

    it("returns false when far from bottom", () => {
      source.loading = false
      source.results = [{ url: "test.jpg" }]

      expect(source.shouldLoadMore(200)).toBe(false)
    })

    it("returns false when loading", () => {
      source.loading = true
      source.results = [{ url: "test.jpg" }]

      expect(source.shouldLoadMore(50)).toBe(false)
    })

    it("returns false when no results", () => {
      source.loading = false
      source.results = []

      expect(source.shouldLoadMore(50)).toBe(false)
    })
  })

  describe("renderGrid", () => {
    it("renders empty state when no results", () => {
      const container = { innerHTML: "" }
      source.results = []

      source.renderGrid(container, "click->handler")

      expect(container.innerHTML).toContain("No images found")
    })

    it("renders image buttons with all data attributes", () => {
      const container = { innerHTML: "" }
      source.results = [
        {
          url: "http://example.com/full.jpg",
          thumbnail: "http://example.com/thumb.jpg",
          title: "Cat Photo",
          source: "example.com",
          width: 1024,
          height: 768
        }
      ]

      source.renderGrid(container, "click->image-picker#select")

      expect(container.innerHTML).toContain('data-url="http://example.com/full.jpg"')
      expect(container.innerHTML).toContain('data-thumbnail="http://example.com/thumb.jpg"')
      expect(container.innerHTML).toContain('data-title="Cat Photo"')
      expect(container.innerHTML).toContain('data-source="example.com"')
      expect(container.innerHTML).toContain('data-action="click->image-picker#select"')
      expect(container.innerHTML).toContain("1024x768")
    })

    it("removes broken thumbnails without an inline error handler", () => {
      const container = document.createElement("div")
      source.results = [{ url: "https://example.com/1.jpg", title: "Cat" }]

      source.renderGrid(container, "click->image-picker#select")

      const image = container.querySelector("img")
      expect(image.hasAttribute("onerror")).toBe(false)
      image.dispatchEvent(new Event("error"))
      expect(container.querySelector(".external-image-item")).toBeNull()
    })

    it("escapes HTML in content", () => {
      const container = { innerHTML: "" }
      source.results = [
        { url: "test.jpg", title: "<img onerror=alert(1)>" }
      ]

      source.renderGrid(container, "click->handler")

      expect(container.innerHTML).not.toContain("<img onerror")
    })
  })

  describe("deselectAll", () => {
    it("removes selection classes", () => {
      const mockElements = [{ classList: { remove: vi.fn() } }]
      const container = {
        querySelectorAll: vi.fn().mockReturnValue(mockElements)
      }

      source.deselectAll(container)

      expect(mockElements[0].classList.remove).toHaveBeenCalledWith("ring-2", "ring-blue-500")
    })

    it("handles null container gracefully", () => {
      expect(() => source.deselectAll(null)).not.toThrow()
    })
  })
})
