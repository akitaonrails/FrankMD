import { Controller } from "@hotwired/stimulus"
import { destroy, get } from "@rails/request.js"
import { appConfirm } from "lib/app_prompt"
import { escapeHtml } from "lib/text_utils"
import { encodePath } from "lib/url_utils"

export default class extends Controller {
  static targets = [
    "imagesTab", "videosTab", "count", "error", "loading", "status", "grid", "search", "sort",
    "previewDialog", "previewName", "previewMetadata", "previewMedia", "usageDialog", "usageDialogTitle",
    "usageDialogClose", "usageNotes"
  ]

  connect() {
    this.category = "images"
    this.items = []
    this.previewItem = null
    this.requestGeneration = 0
    this.usageGeneration = (this.usageGeneration || 0) + 1
    this.usageCounts = null
    this.usageNotes = null
    this.usageStatus = "idle"
    this.usageRequest = null
    this.visibleUsageCards = new Set()
    this.usageDialogPath = null
    this.usageDialogTrigger = null
    this.createUsageObserver()
    this.load()
  }

  disconnect() {
    this.requestGeneration += 1
    this.usageGeneration += 1
    this.usageObserver?.disconnect()
    this.usageObserver = null
    this.visibleUsageCards.clear()
  }

  createUsageObserver() {
    if (typeof IntersectionObserver !== "function") return
    this.usageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.visibleUsageCards.add(entry.target)
          this.updateUsageLabel(entry.target)
          if (this.usageStatus === "idle") this.loadUsageIndex()
        } else {
          this.visibleUsageCards.delete(entry.target)
        }
      })
    }, { root: this.element })
  }

  resetUsageForLibraryOpen() {
    this.usageGeneration += 1
    this.usageCounts = null
    this.usageNotes = null
    this.usageStatus = "idle"
    this.usageRequest = null
    this.visibleUsageCards.clear()
    this.gridTarget.querySelectorAll(".library-card").forEach((card) => this.updateUsageLabel(card))
    this.observeUsageCards()
  }

  observeUsageCards() {
    if (!this.usageObserver) return
    this.usageObserver.disconnect()
    this.visibleUsageCards.clear()
    this.gridTarget.querySelectorAll(".library-card").forEach((card) => this.usageObserver.observe(card))
  }

  async loadUsageIndex() {
    if (this.usageRequest) return this.usageRequest

    const generation = this.usageGeneration
    this.usageStatus = "checking"
    this.usageRequest = (async () => {
      try {
        const response = await get("/library/usage", { responseKind: "json" })
        if (generation !== this.usageGeneration) return
        if (!response.ok) throw new Error("Media usage request failed")

        const data = await response.json
        if (generation !== this.usageGeneration) return
        const usageCounts = data?.usage_counts
        const usageNotes = data?.usage_notes
        if (!usageCounts || typeof usageCounts !== "object" || Array.isArray(usageCounts) ||
          !usageNotes || typeof usageNotes !== "object" || Array.isArray(usageNotes) ||
          Object.values(usageNotes).some((paths) => !Array.isArray(paths) || paths.some((path) => typeof path !== "string"))) {
          throw new Error("Media usage response was invalid")
        }
        this.usageCounts = usageCounts
        this.usageNotes = usageNotes
        this.usageStatus = "loaded"
      } catch (_error) {
        if (generation !== this.usageGeneration) return
        this.usageCounts = null
        this.usageNotes = null
        this.usageStatus = "unknown"
      }

      if (generation === this.usageGeneration) {
        this.visibleUsageCards.forEach((card) => this.updateUsageLabel(card))
      }
    })()
    return this.usageRequest
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
    this.usageObserver?.disconnect()
    this.visibleUsageCards.clear()
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
    this.observeUsageCards()
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
      <article class="library-card" data-usage-path="${path}">
        <button type="button" class="library-card-preview" data-path="${path}" data-action="click->library#openPreview" aria-label="${escapeHtml(window.t("library.preview_item", { name: item.name }))}">
          ${preview}
        </button>
        <div class="library-card-details">
          <p class="truncate text-sm font-medium" title="${name}">${name}</p>
          <p class="mt-1 text-xs text-[var(--theme-text-muted)]">${size} <span aria-hidden="true">·</span> ${date}</p>
          <p class="library-usage mt-1 text-xs text-[var(--theme-text-muted)]" data-library-usage-label data-usage-state="checking" aria-live="polite">${escapeHtml(window.t("library.usage_checking"))}</p>
          <div class="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" data-path="${path}" data-action="click->library#deleteItem" class="rounded-md border border-[var(--theme-error)] px-3 py-2 text-sm text-[var(--theme-error)] hover:bg-[var(--theme-bg-hover)]">${escapeHtml(window.t("library.delete"))}</button>
            <button type="button" data-path="${path}" data-action="click->library#insertItem" class="rounded-md bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-[var(--theme-accent-text)] hover:opacity-90">${escapeHtml(window.t("library.insert"))}</button>
          </div>
        </div>
      </article>
    `
  }

  updateUsageLabel(card) {
    const label = card.querySelector("[data-library-usage-label]")
    if (!label) return

    if (this.usageStatus === "unknown") {
      label.textContent = window.t("library.usage_unknown")
      label.dataset.usageState = "unknown"
      return
    }

    if (this.usageStatus !== "loaded") {
      label.textContent = window.t("library.usage_checking")
      label.dataset.usageState = "checking"
      return
    }

    const path = card.dataset.usagePath
    if (Object.prototype.hasOwnProperty.call(this.usageCounts, path)) {
      const count = Number(this.usageCounts[path])
      if (Number.isFinite(count) && count > 0) {
        const text = escapeHtml(window.t("library.usage_used", { count }))
        const safePath = escapeHtml(path)
        label.innerHTML = `<button type="button" class="cursor-pointer text-[var(--theme-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]" data-path="${safePath}" data-action="click->library#openUsage" aria-haspopup="dialog" aria-controls="library-usage-dialog">${text}</button>`
        label.dataset.usageState = "used"
        return
      }
    }

    label.textContent = window.t("library.usage_unused")
    label.dataset.usageState = "unused"
  }

  openUsage(event) {
    const path = event.currentTarget.dataset.path
    const item = this.itemForPath(path)
    if (!item || this.usageStatus !== "loaded") return

    const notePaths = this.usageNotes?.[path]
    if (!Array.isArray(notePaths)) return

    this.usageDialogPath = path
    this.usageDialogTrigger = event.currentTarget
    this.usageDialogTitleTarget.textContent = window.t("library.usage_dialog_title")
    const safeNotePaths = [...new Set(notePaths)].filter((notePath) => this.isValidUsageNotePath(notePath))
    this.usageNotesTarget.innerHTML = safeNotePaths.length
      ? safeNotePaths.map((notePath) => {
        const safePath = escapeHtml(notePath)
        const label = escapeHtml(window.t("library.usage_open_note", { path: notePath }))
        return `<li><button type="button" class="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--theme-accent)] hover:bg-[var(--theme-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]" data-note-path="${safePath}" data-action="click->library#openUsageNote" aria-label="${label}">${safePath}</button></li>`
      }).join("")
      : `<li class="px-3 py-2 text-sm text-[var(--theme-text-muted)]">${escapeHtml(window.t("library.usage_dialog_empty"))}</li>`
    this.usageDialogTarget.classList.remove("hidden")
    this.usageDialogTarget.classList.add("flex")
    this.usageDialogCloseTarget.focus()
  }

  closeUsageDialog(event) {
    event?.stopPropagation?.()
    if (this.usageDialogTarget.classList.contains("hidden")) return

    this.usageDialogTarget.classList.add("hidden")
    this.usageDialogTarget.classList.remove("flex")
    this.usageDialogPath = null
    const trigger = this.usageDialogTrigger
    this.usageDialogTrigger = null
    trigger?.focus?.()
  }

  closeUsageDialogOnBackdrop(event) {
    if (event.target === this.usageDialogTarget) this.closeUsageDialog(event)
  }

  openUsageNote(event) {
    const path = event.currentTarget.dataset.notePath
    if (!this.isValidUsageNotePath(path) || !this.usageNotes?.[this.usageDialogPath]?.includes(path)) return

    this.closeUsageDialog()
    this.dispatch("open-note", { detail: { path } })
  }

  isValidUsageNotePath(path) {
    if (typeof path !== "string" || path.startsWith("/") || !path.endsWith(".md")) return false
    return path.split("/").every((segment) => segment && segment !== "." && segment !== ".." && !segment.includes("\\"))
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
    if (event?.currentTarget && event.currentTarget.tagName !== "BUTTON") return
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
    if (event?.currentTarget && event.currentTarget.tagName !== "BUTTON") return
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

  closeLibrary() {
    if (this.element.classList.contains("hidden")) return
    if (!this.previewDialogTarget.classList.contains("hidden")) this.closePreview()
    if (!this.usageDialogTarget.classList.contains("hidden")) this.closeUsageDialog()
    this.dispatch("close")
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
