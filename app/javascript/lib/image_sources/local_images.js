// Local Server Images
// Handles loading and displaying images from the server's images directory

import { get, post } from "@rails/request.js"
import { escapeHtml } from "lib/text_utils"
import { encodePath } from "lib/url_utils"

export class LocalImageSource {
  constructor() {
    this.selectedPath = null
  }

  reset() {
    this.selectedPath = null
  }

  async load(search = "") {
    try {
      const url = search ? `/images?search=${encodeURIComponent(search)}` : "/images"
      const response = await get(url, { responseKind: "json" })

      if (!response.ok) {
        throw new Error("Failed to load images")
      }

      return await response.json
    } catch (error) {
      console.error("Error loading images:", error)
      return { error: "Error loading images" }
    }
  }

  renderGrid(images, container, onSelectAction) {
    if (!images || images.length === 0) {
      container.innerHTML = '<div class="image-grid-empty">No images found</div>'
      return
    }

    const html = images.map(image => {
      const dimensions = (image.width && image.height) ? `${image.width}x${image.height}` : ""
      return `
        <div
          class="image-grid-item ${this.selectedPath === image.path ? 'selected' : ''}"
          data-action="${onSelectAction}"
          data-path="${escapeHtml(image.path)}"
          data-name="${escapeHtml(image.name)}"
          title="${escapeHtml(image.name)}${dimensions ? ` (${dimensions})` : ''}"
        >
          <img src="/images/preview/${encodePath(image.path)}" alt="${escapeHtml(image.name)}" loading="lazy">
          ${dimensions ? `<div class="image-dimensions">${dimensions}</div>` : ''}
        </div>
      `
    }).join("")

    container.innerHTML = html
  }

  deselectAll(container) {
    if (container) {
      container.querySelectorAll(".image-grid-item").forEach(el => {
        el.classList.remove("selected")
      })
    }
  }

  async uploadToS3(path, resize, s3Key = "") {
    const body = { path, resize }
    if (s3Key) body.s3_key = s3Key
    const response = await post("/images/upload_to_s3", {
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
