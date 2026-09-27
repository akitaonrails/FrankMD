import { Controller } from "@hotwired/stimulus"
import { destroy, get } from "@rails/request.js"
import { appConfirm } from "lib/app_prompt"
import { escapeHtml } from "lib/text_utils"
import { encodePath } from "lib/url_utils"

export default class extends Controller {
  static targets = [
    "imagesTab", "videosTab", "count", "error", "loading", "status", "grid", "search", "sort",
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
    this.clearError()
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
      this.showError(error.message || window.t("library.load_failed"))
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
    const query = this.hasSearchTarget ? this.searchTarget.value.trim().toLocaleLowerCase() : ""
    const sort = this.hasSortTarget ? this.sortTarget.value : "newest"
    const visible = this.items
      .filter((item) => item.path.startsWith(`${this.category}/`))
      .filter((item) => !query || `${item.name} ${item.path}`.toLocaleLowerCase().includes(query))
      .sort((first, second) => this.compareItems(first, second, sort))

    this.countTarget.textContent = window.t("library.item_count", { count: visible.length })

    if (visible.length === 0) {
      const emptyKey = query ? "library.no_search_results" : "library.empty"
      this.gridTarget.innerHTML = `<p class="col-span-full py-12 text-center text-sm text-[var(--theme-text-muted)]">${escapeHtml(window.t(emptyKey))}</p>`
      return
    }

    this.gridTarget.innerHTML = visible.map((item) => this.renderCard(item)).join("")
  }

  compareItems(first, second, sort) {
    if (sort === "name") return first.name.localeCompare(second.name, undefined, { sensitivity: "base", numeric: true })

    const firstTime = Date.parse(first.mtime) || 0
    const secondTime = Date.parse(second.mtime) || 0
    return sort === "oldest" ? firstTime - secondTime : secondTime - firstTime
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
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button type="button" data-path="${path}" data-action="click->library#insertItem" class="rounded px-2 py-1 text-xs text-[var(--theme-accent)] hover:bg-[var(--theme-bg-hover)]">${escapeHtml(window.t("library.insert"))}</button>
            <button type="button" data-path="${path}" data-action="click->library#copyRelativePath" class="rounded px-2 py-1 text-xs text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-hover)]" aria-label="${escapeHtml(window.t("library.copy_path"))}">${escapeHtml(window.t("library.copy_path"))}</button>
            <button type="button" data-path="${path}" data-action="click->library#deleteItem" class="rounded px-2 py-1 text-xs text-[var(--theme-error)] hover:bg-[var(--theme-bg-hover)]">${escapeHtml(window.t("library.delete"))}</button>
          </div>
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

  insertPreviewItem(event) {
    this.insertItemFor(this.previewItem, event)
  }

  insertItem(event) {
    this.insertItemFor(this.itemForPath(event.currentTarget.dataset.path), event)
  }

  insertItemFor(item, event) {
    event?.stopPropagation?.()
    if (!item) return

    const insertEvent = this.dispatch("insert-media", { detail: { item, status: "pending" } })
    if (insertEvent.detail.status === "inserted") {
      this.closePreview()
    } else if (insertEvent.detail.status === "pending") {
      this.showError(window.t("library.insertion_failed"))
    }
  }

  async copyPreviewPath(event) {
    this.copyRelativePathFor(this.previewItem, event)
  }

  async copyRelativePath(event) {
    this.copyRelativePathFor(this.itemForPath(event.currentTarget.dataset.path), event)
  }

  async copyRelativePathFor(item, event) {
    event?.stopPropagation?.()
    if (!item) return

    this.clearError()
    try {
      if (!navigator.clipboard?.writeText) throw new Error(window.t("library.copy_failed"))
      // The API path is already relative to NOTES_PATH (images/... or videos/...).
      await navigator.clipboard.writeText(item.path)
      this.showStatus(window.t("library.copied"))
    } catch (error) {
      this.showError(error.message || window.t("library.copy_failed"))
    }
  }

  async deletePreviewItem(event) {
    this.deleteItemFor(this.previewItem, event)
  }

  async deleteItem(event) {
    this.deleteItemFor(this.itemForPath(event.currentTarget.dataset.path), event)
  }

  async deleteItemFor(item, event) {
    event?.stopPropagation?.()
    if (!item) return

    this.clearError()
    if (!await appConfirm(window.t("library.delete_confirm", { name: item.name }), {
      acceptLabel: window.t("library.delete"),
      destructive: true
    })) return

    try {
      const response = await destroy(`/library/file/${encodePath(item.path)}`, { responseKind: "json" })
      if (!response.ok) {
        const data = await response.json
        throw new Error(data.error || window.t("library.delete_failed"))
      }

      this.items = this.items.filter((entry) => entry.path !== item.path)
      if (this.previewItem?.path === item.path) this.closePreview()
      this.render()
      this.showStatus(window.t("library.deleted"))
    } catch (error) {
      this.showError(error.message || window.t("library.delete_failed"))
    }
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

  showError(message) {
    this.errorTarget.textContent = message
    this.errorTarget.classList.remove("hidden")
  }

  clearError() {
    if (!this.hasErrorTarget) return
    this.errorTarget.textContent = ""
    this.errorTarget.classList.add("hidden")
  }

  showStatus(message) {
    if (!this.hasStatusTarget) return
    this.statusTarget.textContent = message
    this.statusTarget.classList.remove("hidden")
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
