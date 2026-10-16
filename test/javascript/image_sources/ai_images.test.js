/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { AiImageSource } from "../../../app/javascript/lib/image_sources/ai_images.js"

describe("AiImageSource", () => {
  let source
  let originalFetch

  beforeEach(() => {
    source = new AiImageSource()
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe("constructor", () => {
    it("initializes with default state", () => {
      expect(source.enabled).toBe(false)
      expect(source.model).toBeNull()
      expect(source.generatedData).toBeNull()
      expect(source.abortController).toBeNull()
      expect(source.refImage).toBeNull()
      expect(source.refImageSearchTimeout).toBeNull()
    })
  })

  describe("reset", () => {
    it("clears generated data and ref image", () => {
      source.generatedData = { data: "base64..." }
      source.refImage = { path: "test.jpg" }

      source.reset()

      expect(source.generatedData).toBeNull()
      expect(source.refImage).toBeNull()
    })

    it("aborts pending request", () => {
      const mockAbort = vi.fn()
      source.abortController = { abort: mockAbort }

      source.reset()

      expect(mockAbort).toHaveBeenCalled()
      expect(source.abortController).toBeNull()
    })

    it("clears ref image search timeout", () => {
      vi.useFakeTimers()
      source.refImageSearchTimeout = setTimeout(() => {}, 1000)

      source.reset()

      expect(source.refImageSearchTimeout).toBeNull()
      vi.useRealTimers()
    })
  })

  describe("loadConfig", () => {
    it("loads config from API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ enabled: true, model: "imagen-3.0" })
      })

      const result = await source.loadConfig()

      expect(global.fetch).toHaveBeenCalledWith("/ai/image_config", expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Accept": "application/json" })
      }))
      expect(source.enabled).toBe(true)
      expect(source.model).toBe("imagen-3.0")
      expect(result).toEqual({ enabled: true, model: "imagen-3.0" })
    })

    it("handles failed response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })

      await source.loadConfig()

      expect(source.enabled).toBe(false)
    })

    it("handles network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      await source.loadConfig()

      expect(source.enabled).toBe(false)
    })
  })

  describe("generate", () => {
    it("returns error for empty prompt", async () => {
      const result = await source.generate("")
      expect(result.error).toBe("Please enter a prompt describing the image you want to generate")
    })

    it("returns error when not enabled", async () => {
      source.enabled = false

      const result = await source.generate("a cat")

      expect(result.error).toBe("AI image generation is not configured. Please add your Gemini API key to .fed")
    })

    it("generates image successfully", async () => {
      source.enabled = true

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          data: "base64imagedata",
          url: null,
          mime_type: "image/png",
          model: "imagen-3.0",
          revised_prompt: "A cute cat sitting"
        })
      })

      const result = await source.generate("a cat")

      expect(global.fetch).toHaveBeenCalledWith("/ai/generate_image", expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Accept": "application/json"
        }),
        body: JSON.stringify({ prompt: "a cat" }),
        signal: expect.any(AbortSignal)
      }))

      expect(result.success).toBe(true)
      expect(result.imageData.data).toBe("base64imagedata")
      expect(result.previewSrc).toBe("data:image/png;base64,base64imagedata")
      expect(source.generatedData).toBeDefined()
    })

    it("includes reference image in request", async () => {
      source.enabled = true
      source.refImage = { path: "ref/photo.jpg", name: "photo.jpg" }

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ data: "base64", mime_type: "image/png" })
      })

      await source.generate("a cat like this")

      const callArgs = global.fetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.reference_image_path).toBe("ref/photo.jpg")
    })

    it("handles URL-based response", async () => {
      source.enabled = true

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          url: "https://example.com/generated.jpg",
          data: null
        })
      })

      const result = await source.generate("a cat")

      expect(result.previewSrc).toBe("https://example.com/generated.jpg")
    })

    it("handles API error", async () => {
      source.enabled = true

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: "Content policy violation" })
      })

      const result = await source.generate("bad prompt")

      expect(result.error).toBe("Content policy violation")
    })

    it("handles abort", async () => {
      source.enabled = true

      const abortError = new Error("Aborted")
      abortError.name = "AbortError"

      global.fetch = vi.fn().mockRejectedValue(abortError)

      const result = await source.generate("a cat")

      expect(result.cancelled).toBe(true)
    })

    it("handles network error", async () => {
      source.enabled = true

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      const result = await source.generate("a cat")

      expect(result.error).toBe("Failed to generate image. Please try again.")
    })

    it("clears abort controller after completion", async () => {
      source.enabled = true

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ data: "base64", mime_type: "image/png" })
      })

      await source.generate("a cat")

      expect(source.abortController).toBeNull()
    })
  })

  describe("abort", () => {
    it("aborts pending request", () => {
      const mockAbort = vi.fn()
      source.abortController = { abort: mockAbort }

      source.abort()

      expect(mockAbort).toHaveBeenCalled()
    })

    it("handles no pending request", () => {
      source.abortController = null
      expect(() => source.abort()).not.toThrow()
    })
  })

  describe("setRefImage", () => {
    it("sets reference image", () => {
      source.setRefImage("/images/ref.jpg", "ref.jpg")

      expect(source.refImage).toEqual({ path: "/images/ref.jpg", name: "ref.jpg" })
    })
  })

  describe("clearRefImage", () => {
    it("clears reference image", () => {
      source.refImage = { path: "test.jpg", name: "test.jpg" }

      source.clearRefImage()

      expect(source.refImage).toBeNull()
    })
  })

  describe("loadRefImages", () => {
    it("loads images from API", async () => {
      const mockImages = [{ path: "a.jpg", name: "a.jpg" }]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockImages)
      })

      const result = await source.loadRefImages()

      expect(global.fetch).toHaveBeenCalledWith("/images", expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Accept": "application/json" })
      }))
      expect(result).toEqual(mockImages)
    })

    it("loads images with search", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([])
      })

      await source.loadRefImages("cat")

      expect(global.fetch).toHaveBeenCalledWith("/images?search=cat", expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Accept": "application/json" })
      }))
    })

    it("handles error", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })

      const result = await source.loadRefImages()

      expect(result.error).toBe("Error loading images")
    })
  })

  describe("renderRefImageGrid", () => {
    it("renders empty state when no images", () => {
      const container = { innerHTML: "" }

      source.renderRefImageGrid([], container, "click->handler")

      expect(container.innerHTML).toContain("No images found")
    })

    it("renders image buttons", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "photos/ref.jpg", name: "ref.jpg" }
      ]

      source.renderRefImageGrid(images, container, "click->image-picker#selectAiRefImage")

      expect(container.innerHTML).toContain('data-path="photos/ref.jpg"')
      expect(container.innerHTML).toContain('data-name="ref.jpg"')
      expect(container.innerHTML).toContain('data-action="click->image-picker#selectAiRefImage"')
    })

    it("marks selected reference image", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "photos/a.jpg", name: "a.jpg" },
        { path: "photos/b.jpg", name: "b.jpg" }
      ]
      source.refImage = { path: "photos/a.jpg" }

      source.renderRefImageGrid(images, container, "click->handler")

      expect(container.innerHTML).toContain("ring-2 ring-[var(--theme-accent)]")
    })

    it("escapes HTML", () => {
      const container = { innerHTML: "" }
      const images = [
        { path: "test.jpg", name: "<script>xss</script>" }
      ]

      source.renderRefImageGrid(images, container, "click->handler")

      expect(container.innerHTML).not.toContain("<script>")
    })
  })

  describe("save", () => {
    it("returns error when no generated data", async () => {
      source.generatedData = null

      const result = await source.save()

      expect(result.error).toBe("No generated image data available")
    })

    it("saves base64 image locally", async () => {
      source.generatedData = {
        data: "base64imagedata",
        mime_type: "image/png"
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "/images/ai_123.png" })
      })

      const result = await source.save()

      expect(global.fetch).toHaveBeenCalledWith("/images/upload_base64", expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Accept": "application/json"
        }),
        body: expect.stringContaining('"data":"base64imagedata"')
      }))
      expect(result.url).toBe("/images/ai_123.png")
    })

    it("saves base64 image to S3", async () => {
      source.generatedData = {
        data: "base64imagedata",
        mime_type: "image/png"
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "https://s3.example.com/ai_123.png" })
      })

      const result = await source.save()

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body).not.toHaveProperty("upload_to_s3")
      expect(result.url).toBe("https://s3.example.com/ai_123.png")
    })

    it("downloads URL results into the active provider", async () => {
      source.generatedData = { url: "https://ai-service.com/generated.jpg" }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true, json: () => Promise.resolve({ url: "images/generated.jpg" })
      })
      const result = await source.save()
      expect(global.fetch).toHaveBeenCalledWith("/images/import", expect.objectContaining({
        method: "POST", body: JSON.stringify({ url: source.generatedData.url })
      }))
      expect(result.url).toBe("images/generated.jpg")
    })

    it("uploads URL image to S3", async () => {
      source.generatedData = {
        url: "https://ai-service.com/generated.jpg",
        data: null
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "https://s3.example.com/ai_123.jpg" })
      })

      const result = await source.save()

      expect(global.fetch).toHaveBeenCalledWith("/images/import", expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Accept": "application/json"
        }),
        body: JSON.stringify({ url: "https://ai-service.com/generated.jpg" })
      }))
      expect(result.url).toBe("https://s3.example.com/ai_123.jpg")
    })

    it("handles save error for base64", async () => {
      source.generatedData = { data: "base64", mime_type: "image/png" }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Disk full" })
      })

      await expect(source.save()).rejects.toThrow("Disk full")
    })

    it("handles save error for S3 URL upload", async () => {
      source.generatedData = { url: "https://example.com/img.jpg" }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "S3 error" })
      })

      await expect(source.save()).rejects.toThrow("S3 error")
    })
  })
})
