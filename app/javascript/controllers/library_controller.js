import { Controller } from "@hotwired/stimulus"
import { get } from "@rails/request.js"
import { escapeHtml } from "lib/text_utils"
import { encodePath } from "lib/url_utils"

export default class extends Controller {
  static targets = [
    "imagesTab", "videosTab", "count", "error", "loading", "grid",
    "previewDialog", "previewName", "previewMetadata", "previewMedia"
  ]

  connect() {
    this.category = "images"
    this.items = []
    this.previewItem = null
    this.requestGeneration = 0
    this.load()
  }

  disconnect() {
    this.requestGeneration += 1
  }

  async load() {
    const generation = ++this.requestGeneration
    this.errorTarget.classList.add("hidden")
    this.loadingTarget.classList.remove("hidden")
    this.gridTarget.innerHTML = ""

    try {
      const response = await get("/library", { responseKind: "json" })
      if (generation !== this.requestGeneration) return
      if (!response.ok) throw new Error(window.t("library.load_failed"))

      const data = await response.json
      if (generation !== this.requestGeneration) return
      this.items = [
        ...(Array.isArray(data.images) ? data.images : []),
        ...(Array.isArray(data.videos) ? data.videos : [])
      ].filter((item) => this.isValidItem(item))
      this.render()
    } catch (error) {
      if (generation !== this.requestGeneration) return
      this.errorTarget.textContent = error.message || window.t("library.load_failed")
      this.errorTarget.classList.remove("hidden")
      this.items = []
      this.render()
    } finally {
      if (generation === this.requestGeneration) this.loadingTarget.classList.add("hidden")
    }
  }

  showImages() {
    this.category = "images"
    this.updateTabs()
    this.render()
  }

  showVideos() {
    this.category = "videos"
    this.updateTabs()
    this.render()
  }

  updateTabs() {
    this.imagesTabTarget.setAttribute("aria-pressed", String(this.category === "images"))
    this.videosTabTarget.setAttribute("aria-pressed", String(this.category === "videos"))
  }

  render() {
    const visible = this.items.filter((item) => item.path.startsWith(`${this.category}/`))
    this.countTarget.textContent = window.t("library.item_count", { count: visible.length })

    if (visible.length === 0) {
      this.gridTarget.innerHTML = `<p class="col-span-full py-12 text-center text-sm text-[var(--theme-text-muted)]">${escapeHtml(window.t("library.empty"))}</p>`
      return
    }

    this.gridTarget.innerHTML = visible.map((item) => this.renderCard(item)).join("")
  }

  renderCard(item) {
    const name = escapeHtml(item.name)
    const path = escapeHtml(item.path)
    const url = escapeHtml(this.mediaUrl(item))
    const date = escapeHtml(this.formatDate(item.mtime))
    const size = escapeHtml(this.formatBytes(item.size))
    const preview = item.type === "video"
      ? `<video src="${url}" muted preload="metadata" aria-hidden="true"></video><span class="library-card-play" aria-hidden="true">▶</span>`
      : `<img src="${url}" alt="${name}" loading="lazy">`

    return `
      <article class="library-card">
        <button type="button" class="library-card-preview" data-path="${path}" data-action="click->library#openPreview" aria-label="${escapeHtml(window.t("library.preview_item", { name: item.name }))}">
          ${preview}
        </button>
        <div class="library-card-details">
          <p class="truncate text-sm font-medium" title="${name}">${name}</p>
          <p class="mt-1 text-xs text-[var(--theme-text-muted)]">${size} <span aria-hidden="true">·</span> ${date}</p>
        </div>
      </article>
    `
  }

  openPreview(event) {
    const item = this.itemForPath(event.currentTarget.dataset.path)
    if (!item) return

    this.previewItem = item
    this.previewNameTarget.textContent = item.name
    this.previewMetadataTarget.textContent = `${this.formatBytes(item.size)} · ${this.formatDate(item.mtime)}`
    const url = escapeHtml(this.mediaUrl(item))

    if (item.type === "video") {
      this.previewMediaTarget.innerHTML = `<video controls autoplay src="${url}" aria-label="${escapeHtml(item.name)}"></video>`
    } else {
      this.previewMediaTarget.innerHTML = `<img src="${url}" alt="${escapeHtml(item.name)}">`
    }

    this.previewDialogTarget.classList.remove("hidden")
    this.previewDialogTarget.classList.add("flex")
  }

  closePreview(event) {
    event?.stopPropagation?.()
    this.previewDialogTarget.classList.add("hidden")
    this.previewDialogTarget.classList.remove("flex")
    this.previewMediaTarget.replaceChildren()
    this.previewItem = null
  }

  closePreviewOnBackdrop(event) {
    if (event.target === this.previewDialogTarget) this.closePreview()
  }

  itemForPath(path) {
    return this.items.find((item) => item.path === path) || null
  }

  isValidItem(item) {
    if (!item || typeof item.name !== "string" || typeof item.path !== "string") return false
    if (item.type !== "image" && item.type !== "video") return false
    const expectedRoot = item.type === "image" ? "images" : "videos"
    const segments = item.path.split("/")
    return segments[0] === expectedRoot && segments.length > 1 && segments.every((segment) => segment && segment !== "." && segment !== ".." && !segment.includes("\\"))
  }

  mediaUrl(item) {
    return `/notes/${encodePath(item.path)}`
  }

  formatBytes(value) {
    const bytes = Number(value)
    if (!Number.isFinite(bytes) || bytes < 0) return ""
    if (bytes < 1024) return `${bytes} B`
    const units = ["KB", "MB", "GB", "TB"]
    let amount = bytes / 1024
    let unit = 0
    while (amount >= 1024 && unit < units.length - 1) {
      amount /= 1024
      unit += 1
    }
    const display = Number.isInteger(amount) || amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)
    return `${display} ${units[unit]}`
  }

  formatDate(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString()
  }
}
