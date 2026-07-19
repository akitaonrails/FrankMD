// Folder Images (File System Access API)
// Handles browsing and selecting images from local filesystem folders

import { post } from "@rails/request.js"
import { escapeHtml } from "lib/text_utils"

// Fallback when no config-driven list is provided (e.g. direct API use).
export const DEFAULT_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]

// Trailing extension of a filename (".png"), or a readable label when absent.
export function extOf(filename) {
  const match = filename.toLowerCase().match(/\.[^.]+$/)
  return match ? match[0] : "no extension"
}

export class FolderImageSource {
  constructor() {
    this.displayedImages = []  // Images currently shown (with object URLs)
    this.allImages = []        // All image metadata from folder
  }

  get isSupported() {
    return "showDirectoryPicker" in window
  }

  reset() {
    this.cleanup()
  }

  cleanup() {
    for (const image of this.displayedImages) {
      if (image.objectUrl) {
        URL.revokeObjectURL(image.objectUrl)
      }
    }
    this.displayedImages = []
    this.allImages = []
  }

  async browse(allowedExtensions = DEFAULT_IMAGE_EXTENSIONS) {
    if (!this.isSupported) {
      return { error: "File System Access API not supported" }
    }

    try {
      const dirHandle = await window.showDirectoryPicker()
      return await this.loadFromDirectory(dirHandle, allowedExtensions)
    } catch (err) {
      if (err.name === "AbortError") {
        return { cancelled: true }
      }
      console.error("Error accessing folder:", err)
      return { error: "Error accessing folder" }
    }
  }

  async loadFromDirectory(dirHandle, allowedExtensions = DEFAULT_IMAGE_EXTENSIONS) {
    this.cleanup()

    const imageExtensions = allowedExtensions.map(ext => ext.toLowerCase())

    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === "file") {
          const name = entry.name.toLowerCase()
          if (imageExtensions.some(ext => name.endsWith(ext))) {
            const file = await entry.getFile()
            this.allImages.push({
              name: entry.name,
              file: file,
              lastModified: file.lastModified,
              size: file.size
            })
          }
        }
      }

      // Sort by most recent first
      this.allImages.sort((a, b) => b.lastModified - a.lastModified)

      // Display images
      await this.filter("")

      return { count: this.allImages.length }
    } catch (err) {
      console.error("Error reading folder:", err)
      return { error: "Error reading folder" }
    }
  }

  // Ingest dropped File objects (drag-and-drop). Reuses all folder machinery.
  // Returns { count, rejected: [{ name, reason }] } so the caller can tell the
  // user why any file was skipped instead of silently dropping it.
  async ingest(fileList, allowedExtensions = DEFAULT_IMAGE_EXTENSIONS) {
    this.cleanup()

    const allowed = allowedExtensions.map(ext => ext.toLowerCase())
    const rejected = []

    for (const file of fileList) {
      if (allowed.some(ext => file.name.toLowerCase().endsWith(ext))) {
        this.allImages.push({
          name: file.name,
          file: file,
          lastModified: file.lastModified,
          size: file.size
        })
      } else {
        rejected.push({ name: file.name, ext: extOf(file.name) })
      }
    }

    this.allImages.sort((a, b) => b.lastModified - a.lastModified)
    await this.filter("")

    return { count: this.allImages.length, rejected }
  }

  async filter(searchTerm) {
    const maxImages = 10
    const term = searchTerm.toLowerCase().trim()

    let filtered = this.allImages
    if (term) {
      filtered = this.allImages.filter(img =>
        img.name.toLowerCase().includes(term)
      )
    }

    // Revoke previous object URLs
    for (const img of this.displayedImages) {
      if (img.objectUrl) {
        URL.revokeObjectURL(img.objectUrl)
      }
    }

    // Take top N and create object URLs with dimensions
    const topImages = filtered.slice(0, maxImages)
    this.displayedImages = await Promise.all(topImages.map(async (img) => {
      const objectUrl = URL.createObjectURL(img.file)
      const dimensions = await this.getImageDimensions(objectUrl)
      return {
        name: img.name,
        file: img.file,
        objectUrl: objectUrl,
        size: img.size,
        lastModified: img.lastModified,
        width: dimensions.width,
        height: dimensions.height
      }
    }))

    return { displayed: this.displayedImages.length, total: filtered.length }
  }

  getImageDimensions(url) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        resolve({ width: null, height: null })
      }
      img.src = url
    })
  }

  renderGrid(container, statusContainer, onSelectAction, totalCount = null) {
    if (!container) return

    if (this.displayedImages.length === 0) {
      container.innerHTML = '<div class="col-span-5 text-center text-[var(--theme-text-muted)] py-8">No images found in folder</div>'
      if (statusContainer) {
        statusContainer.textContent = "No images found"
      }
      return
    }

    if (statusContainer) {
      const shown = this.displayedImages.length
      if (totalCount && totalCount > shown) {
        statusContainer.textContent = `Showing ${shown} most recent of ${totalCount} images`
      } else {
        statusContainer.textContent = `${shown} image${shown !== 1 ? "s" : ""} found`
      }
    }

    const html = this.displayedImages.map((image, index) => {
      const sizeKb = Math.round(image.size / 1024)
      const dimensions = (image.width && image.height) ? `${image.width}x${image.height}` : ""
      return `
        <div
          class="image-grid-item"
          data-action="${onSelectAction}"
          data-index="${index}"
          title="${escapeHtml(image.name)}${dimensions ? ` (${dimensions})` : ''} - ${sizeKb} KB"
        >
          <img src="${image.objectUrl}" alt="${escapeHtml(image.name)}">
          ${dimensions ? `<div class="image-dimensions">${dimensions}</div>` : ''}
        </div>
      `
    }).join("")

    container.innerHTML = html
  }

  getImage(index) {
    return this.displayedImages[index]
  }

  deselectAll(container) {
    if (container) {
      container.querySelectorAll(".image-grid-item").forEach(el => {
        el.classList.remove("selected")
      })
    }
  }

  async upload(file, resize, uploadToS3, s3Key = "") {
    const formData = new FormData()
    formData.append("file", file)
    if (resize) formData.append("resize", resize)
    if (uploadToS3) formData.append("upload_to_s3", "true")
    if (uploadToS3 && s3Key) formData.append("s3_key", s3Key)

    const response = await post("/images/upload", {
      body: formData,
      responseKind: "json"
    })

    if (!response.ok) {
      const data = await response.json
      throw new Error(data.error || "Upload failed")
    }

    return await response.json
  }
}
