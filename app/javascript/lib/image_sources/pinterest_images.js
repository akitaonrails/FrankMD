// Pinterest Image Search
// Handles searching for images via Pinterest scraping

import { get } from "@rails/request.js"
import { escapeHtml, isSafeImageUrl } from "lib/text_utils"

export class PinterestImageSource {
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
      const response = await get(`/images/search_pinterest?q=${encodeURIComponent(query)}`, { responseKind: "json" })
      const data = await response.json

      if (data.error) {
        this.results = []
        return { error: data.error }
      }

      this.results = data.images || []
      return {
        images: this.results,
        message: this.results.length === 0
          ? "No images found"
          : `Found ${this.results.length} images - click to select`
      }
    } catch (error) {
      console.error("Pinterest search error:", error)
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
      const width = Number(image.width)
      const height = Number(image.height)
      const dimensions = (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) ? `${width}x${height}` : ""
      const thumbnail = isSafeImageUrl(image.thumbnail || image.url) ? image.thumbnail || image.url : ""
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
            src="${escapeHtml(thumbnail)}"
            alt="${escapeHtml(image.title || 'Image')}"
            class="w-full h-full object-cover"
            loading="lazy"
          >
          ${dimensions ? `<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono">${dimensions}</div>` : ''}
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
            <div class="text-white text-xs truncate">${escapeHtml(image.source || '')}</div>
          </div>
        </button>
      `
    }).join("")

    container.querySelectorAll?.("img").forEach(image => {
      image.addEventListener("error", () => image.parentElement?.remove())
    })
  }

  deselectAll(container) {
    if (container) {
      container.querySelectorAll(".external-image-item").forEach(el => {
        el.classList.remove("ring-2", "ring-blue-500")
      })
    }
  }
}
