import { Controller } from "@hotwired/stimulus"
import { destroy, get } from "@rails/request.js"
import { appConfirm } from "lib/app_prompt"
import { escapeHtml } from "lib/text_utils"
import { encodePath } from "lib/url_utils"

export default class extends Controller {
  static targets = [
    "imagesTab", "videosTab", "count", "error", "loading", "status", "grid",
    "previewDialog", "previewDialogClose", "previewName", "previewUsage", "previewMetadata", "previewMedia",
    "usageDialog", "usageDialogTitle", "usageDialogClose", "usageNotes"
  ]

  connect() {
    this.category = "images"
    this.items = []
    this.previewItem = null
    this.previewDialogTrigger = null
    this.requestGeneration = 0
    this.usageGeneration = (this.usageGeneration || 0) + 1
    this.usageDetailGeneration = (this.usageDetailGeneration || 0) + 1
    this.usageCounts = null
    this.usageNotes = new Map()
    this.usageNoteRequests = new Map()
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
    this.usageDetailGeneration += 1
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
    this.usageDetailGeneration += 1
    this.usageCounts = null
    this.usageNotes.clear()
    this.usageNoteRequests.clear()
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
        if (!usageCounts || typeof usageCounts !== "object" || Array.isArray(usageCounts) ||
          Object.values(usageCounts).some((count) => !Number.isInteger(count) || count < 0)) {
          throw new Error("Media usage response was invalid")
        }
        this.usageCounts = usageCounts
        this.usageStatus = "loaded"
      } catch (_error) {
        if (generation !== this.usageGeneration) return
        this.usageCounts = null
        this.usageStatus = "unknown"
      }

      if (generation === this.usageGeneration) {
        this.visibleUsageCards.forEach((card) => this.updateUsageLabel(card))
        this.updatePreviewUsage()
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
    const visible = this.items
      .filter((item) => item.path.startsWith(`${this.category}/`))

    this.countTarget.textContent = window.t("library.item_count", { count: visible.length })

    if (visible.length === 0) {
      this.gridTarget.innerHTML = `<p class="col-span-full py-12 text-center text-sm text-[var(--theme-text-muted)]">${escapeHtml(window.t("library.empty"))}</p>`
      return
    }

    this.gridTarget.innerHTML = visible.map((item) => this.renderCard(item)).join("")
    this.observeUsageCards()
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
    const count = Number(this.usageCounts[path])
    if (Number.isFinite(count) && count > 0) {
      const text = escapeHtml(window.t("library.usage_used", { count }))
      const safePath = escapeHtml(path)
      label.innerHTML = `<button type="button" class="cursor-pointer text-[var(--theme-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]" data-path="${safePath}" data-action="click->library#openUsage" aria-haspopup="dialog" aria-controls="library-usage-dialog">${text}</button>`
      label.dataset.usageState = "used"
      return
    }

    label.textContent = window.t("library.usage_used", { count: 0 })
    label.dataset.usageState = "unused"
  }

  updatePreviewUsage() {
    const label = this.previewUsageTarget
    const item = this.previewItem
    if (!item) {
      label.replaceChildren()
      delete label.dataset.usageState
      return
    }

    if (this.usageStatus === "idle") this.loadUsageIndex()

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

    const count = Number(this.usageCounts[item.path])
    if (Number.isFinite(count) && count > 0) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "cursor-pointer text-[var(--theme-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
      button.dataset.path = item.path
      button.dataset.action = "click->library#openUsage"
      button.setAttribute("aria-haspopup", "dialog")
      button.setAttribute("aria-controls", "library-usage-dialog")
      button.textContent = window.t("library.usage_used", { count })
      label.replaceChildren(button)
      label.dataset.usageState = "used"
      return
    }

    label.textContent = window.t("library.usage_used", { count: 0 })
    label.dataset.usageState = "unused"
  }

  openUsage(event) {
    const path = event.currentTarget.dataset.path
    const item = this.itemForPath(path)
    if (!item || this.usageStatus !== "loaded") return

    this.usageDialogPath = path
    this.usageDialogTrigger = event.currentTarget
    this.usageDialogTitleTarget.textContent = window.t("library.usage_dialog_title")
    this.usageNotesTarget.innerHTML = `<li class="px-3 py-2 text-sm text-[var(--theme-text-muted)]">${escapeHtml(window.t("library.usage_checking"))}</li>`
    this.usageDialogTarget.classList.remove("hidden")
    this.usageDialogTarget.classList.add("flex")
    this.usageDialogCloseTarget.focus()

    const generation = this.usageDetailGeneration
    this.loadUsageNotes(path).then((notePaths) => {
      if (generation !== this.usageDetailGeneration || this.usageDialogPath !== path || !Array.isArray(notePaths)) return
      this.renderUsageNotes(notePaths)
    }).catch(() => {
      if (generation !== this.usageDetailGeneration || this.usageDialogPath !== path) return
      this.usageNotesTarget.textContent = window.t("library.usage_unknown")
    })
  }

  async loadUsageNotes(path) {
    if (this.usageNotes.has(path)) return this.usageNotes.get(path)
    if (this.usageNoteRequests.has(path)) return this.usageNoteRequests.get(path)

    const generation = this.usageDetailGeneration
    const request = (async () => {
      const response = await get(`/library/usage?path=${encodeURIComponent(path)}`, { responseKind: "json" })
      if (generation !== this.usageDetailGeneration) return null
      if (!response.ok) throw new Error("Media usage detail request failed")

      const data = await response.json
      if (generation !== this.usageDetailGeneration) return null
      const notePaths = data?.usage_notes
      if (!Array.isArray(notePaths) || notePaths.some((notePath) => typeof notePath !== "string")) {
        throw new Error("Media usage detail response was invalid")
      }
      this.usageNotes.set(path, notePaths)
      return notePaths
    })().finally(() => {
      if (this.usageNoteRequests.get(path) === request) this.usageNoteRequests.delete(path)
    })
    this.usageNoteRequests.set(path, request)
    return request
  }

  renderUsageNotes(notePaths) {
    const safeNotePaths = [...new Set(notePaths)].filter((notePath) => this.isValidUsageNotePath(notePath))
    this.usageNotesTarget.innerHTML = safeNotePaths.length
      ? safeNotePaths.map((notePath) => {
        const safePath = escapeHtml(notePath)
        const label = escapeHtml(window.t("library.usage_open_note", { path: notePath }))
        return `<li><button type="button" class="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--theme-accent)] hover:bg-[var(--theme-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]" data-note-path="${safePath}" data-action="click->library#openUsageNote" aria-label="${label}">${safePath}</button></li>`
      }).join("")
      : `<li class="px-3 py-2 text-sm text-[var(--theme-text-muted)]">${escapeHtml(window.t("library.usage_dialog_empty"))}</li>`
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

  trapDialogFocus(event) {
    if (event.key !== "Tab") return

    const dialog = event.currentTarget
    if (dialog.classList.contains("hidden")) return
    const openDialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .filter((candidate) => !candidate.classList.contains("hidden"))
    if (openDialogs.at(-1) !== dialog) return

    const focusable = [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], video[controls], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
    )].filter((candidate) => candidate.getAttribute("aria-hidden") !== "true" && !candidate.closest("[hidden]"))
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  openUsageNote(event) {
    const path = event.currentTarget.dataset.notePath
    if (!this.isValidUsageNotePath(path) || !this.usageNotes.get(this.usageDialogPath)?.includes(path)) return

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

    this.previewDialogTrigger = event.currentTarget
    this.previewItem = item
    this.previewNameTarget.textContent = item.name
    this.previewMetadataTarget.textContent = this.formatPreviewMetadata(item)
    this.updatePreviewUsage()
    const url = escapeHtml(this.mediaUrl(item))

    if (item.type === "video") {
      this.previewMediaTarget.innerHTML = `<video controls autoplay src="${url}" aria-label="${escapeHtml(item.name)}"></video>`
    } else {
      this.previewMediaTarget.innerHTML = `<img src="${url}" alt="${escapeHtml(item.name)}">`
      const image = this.previewMediaTarget.querySelector("img")
      const updateRatio = () => {
        if (this.previewItem?.path !== item.path) return

        const ratio = this.imageAspectRatio(image.naturalWidth, image.naturalHeight)
        if (ratio) this.previewMetadataTarget.textContent = this.formatPreviewMetadata(item, ratio)
      }
      image.addEventListener("load", updateRatio, { once: true })
      if (image.complete && image.naturalWidth > 0) updateRatio()
    }

    this.previewDialogTarget.classList.remove("hidden")
    this.previewDialogTarget.classList.add("flex")
    this.previewDialogCloseTarget.focus()
  }

  formatPreviewMetadata(item, ratio = null) {
    const metadata = [this.formatBytes(item.size), this.formatDate(item.mtime)]
    if (item.type === "image") {
      if (ratio) metadata.push(ratio)
      const format = item.name.match(/\.([a-z0-9]+)$/i)?.[1]
      if (format) metadata.push(format.toUpperCase())
    }
    return metadata.join(" · ")
  }

  imageAspectRatio(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null

    let first = width
    let second = height
    while (second !== 0) [first, second] = [second, first % second]
    return `${width / first}:${height / first}`
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
    const trigger = this.previewDialogTrigger
    this.previewDialogTrigger = null
    if (trigger?.isConnected) trigger.focus()
  }

  closePreviewOnBackdrop(event) {
    if (event.target === this.previewDialogTarget) this.closePreview()
  }

  closeLibrary() {
    if (this.element.classList.contains("hidden")) return
    if (!this.usageDialogTarget.classList.contains("hidden")) this.closeUsageDialog()
    if (!this.previewDialogTarget.classList.contains("hidden")) this.closePreview()
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
