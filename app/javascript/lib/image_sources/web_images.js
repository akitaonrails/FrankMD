// Web Image Search (DuckDuckGo/Bing)
// Handles searching for images via web search API

import { get, post } from "@rails/request.js"
import { escapeHtml } from "lib/text_utils"

export class WebImageSource {
  constructor() {
    this.results = []
  }

  reset() {
    this.results = []
  }

  async search(query) {
    if (!query) {
      return { error: "Please enter search keywords" }
    }

    try {
      const response = await get(`/images/search_web?q=${encodeURIComponent(query)}`, { responseKind: "json" })
      const data = await response.json

      if (data.error) {
        this.results = []
        return { error: data.error }
      }

      this.results = data.images || []
      return {
        images: this.results,
        message: this.results.length === 0
          ? (data.note || "No images found")
          : `Found ${this.results.length} images - click to select`
      }
    } catch (error) {
      console.error("Web search error:", error)
      this.results = []
      return { error: "Search failed. Please try again." }
    }
  }

  renderGrid(container, onSelectAction) {
    if (!this.results || this.results.length === 0) {
      container.innerHTML = '<div class="col-span-4 text-center text-[var(--theme-text-muted)] py-8">No images found</div>'
      return
    }

    container.innerHTML = this.results.map((image, index) => {
      const dimensions = (image.width && image.height) ? `${image.width}x${image.height}` : ""
      return `
        <button
          type="button"
          data-index="${index}"
          data-url="${escapeHtml(image.url)}"
          data-thumbnail="${escapeHtml(image.thumbnail || image.url)}"
          data-title="${escapeHtml(image.title || '')}"
          data-source="${escapeHtml(image.source || '')}"
          data-action="${onSelectAction}"
          class="external-image-item relative aspect-square rounded-lg overflow-hidden bg-[var(--theme-bg-tertiary)] hover:ring-2 hover:ring-[var(--theme-accent)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
          title="${escapeHtml(image.title || 'Image')}${dimensions ? ` (${dimensions})` : ''}"
        >
          <img
            src="${escapeHtml(image.thumbnail || image.url)}"
            alt="${escapeHtml(image.title || 'Image')}"
            class="w-full h-full object-cover"
            loading="lazy"
            onerror="this.parentElement.remove()"
          >
          ${dimensions ? `<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">${dimensions}</div>` : ''}
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
            <div class="text-white text-xs truncate">${escapeHtml(image.source || '')}</div>
          </div>
        </button>
      `
    }).join("")
  }

  deselectAll(container) {
    if (container) {
      container.querySelectorAll(".external-image-item").forEach(el => {
        el.classList.remove("ring-2", "ring-blue-500")
      })
    }
  }

  async uploadToS3(url, resize, s3Prefix = "") {
    const body = { url, resize }
    if (s3Prefix) body.s3_prefix = s3Prefix
    const response = await post("/images/upload_external_to_s3", {
      body,
      responseKind: "json"
    })

    if (!response.ok) {
      const data = await response.json
      throw new Error(data.error || "Failed to upload to S3")
    }

    return await response.json
  }
}
