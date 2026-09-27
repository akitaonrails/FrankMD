// Local Server Images
// Handles loading and displaying images from the server's images directory

import { get, post, destroy } from "@rails/request.js"
import { escapeHtml } from "lib/text_utils"
import { encodePath } from "lib/url_utils"
import { imagePickerText } from "lib/image_sources/image_picker_text"

export class LocalImageSource {
  constructor() {
    this.selectedPath = null
  }

  reset() {
    this.selectedPath = null
  }

  async load(search = "", { limit = 10, offset = 0 } = {}) {
    try {
      const params = []
      if (search) params.push(`search=${encodeURIComponent(search)}`)
      params.push(`limit=${encodeURIComponent(limit)}`)
      params.push(`offset=${encodeURIComponent(offset)}`)

      const response = await get(`/images?${params.join("&")}`, { responseKind: "json" })

      if (!response.ok) {
        const data = await response.json
        return { error: data.error || imagePickerText("image_load_failed", {}, "Error loading images") }
      }

      return await response.json
    } catch (error) {
      console.error("Error loading images:", error)
      return { error: imagePickerText("image_load_failed", {}, "Error loading images") }
    }
  }

  renderGrid(images, container, onSelectAction) {
    if (!images || images.length === 0) {
      container.innerHTML = `<div class="image-grid-empty">${escapeHtml(imagePickerText("no_images_found", {}, "No images found"))}</div>`
      return
    }

    const deleteLabel = (typeof window !== "undefined" && window.t) ? window.t("dialogs.image_picker.delete_image") : "Delete"

    const html = images.map(image => {
      const width = Number(image.width)
      const height = Number(image.height)
      const dimensions = (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) ? `${width}x${height}` : ""
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
          <button
            type="button"
            class="image-grid-delete"
            data-action="click->local-images#deleteImage"
            data-path="${escapeHtml(image.path)}"
            data-name="${escapeHtml(image.name)}"
            title="${escapeHtml(deleteLabel)}"
            aria-label="${escapeHtml(deleteLabel)}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" width="16" height="16">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
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

  async deleteImage(path) {
    const response = await destroy(`/images/file/${encodePath(path)}`, { responseKind: "json" })

    if (!response.ok) {
      const data = await response.json
      throw new Error(data.error || imagePickerText("image_delete_failed", {}, "Failed to delete image"))
    }

    return await response.json
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
      throw new Error(data.error || imagePickerText("image_upload_failed", {}, "Failed to upload to S3"))
    }

    return await response.json
  }
}
