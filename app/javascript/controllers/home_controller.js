import { Controller } from "@hotwired/stimulus"
import { get, post, destroy } from "@rails/request.js"
import { appConfirm } from "lib/app_prompt"

export default class extends Controller {
  static targets = ["files", "status", "extraFile", "showMore", "showLess"]
  static outlets = ["app"]

  connect() {
    this.pending = Promise.resolve()
    this.expanded = false
  }

  disconnect() {
    this.request?.abort()
  }

  record(path) {
    this.pending = this.pending.then(async () => {
      const response = await post("/recent_files", { body: { path }, responseKind: "json" })
      if (!response.ok && response.statusCode !== 404) throw new Error("Unable to save recent file")
    }).catch(() => this.showError())
    return this.pending
  }

  async refresh({ force = false } = {}) {
    if (!force && this.element.closest(".hidden")) return
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    await this.pending
    if (request.signal.aborted) return

    try {
      const response = await get("/recent_files", { responseKind: "html", signal: request.signal })
      if (!response.ok) throw new Error("Unable to load recent files")
      const html = await response.html
      if (request.signal.aborted || !this.element.isConnected) return
      this.filesTarget.innerHTML = html
      this.updateRecentFiles()
      this.statusTarget.textContent = ""
    } catch (error) {
      if (error.name !== "AbortError") this.showError()
    }
  }

  open(event) {
    if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (this.hasAppOutlet) this.appOutlet.loadFile(event.currentTarget.dataset.path)
  }

  showMore() {
    this.expanded = true
    this.updateRecentFiles()
    this.extraFileTargets[0]?.querySelector("a")?.focus({ preventScroll: true })
    this.showLessTarget.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "end"
    })
  }

  showLess() {
    this.expanded = false
    this.updateRecentFiles()
    this.showMoreTarget.focus()
  }

  updateRecentFiles() {
    this.extraFileTargets.forEach(file => { file.hidden = !this.expanded })
    if (this.hasShowMoreTarget) {
      this.showMoreTarget.hidden = this.expanded
      this.showMoreTarget.setAttribute("aria-expanded", String(this.expanded))
    }
    if (this.hasShowLessTarget) this.showLessTarget.hidden = !this.expanded
  }

  async clear() {
    if (!await appConfirm(this.element.dataset.clearConfirmation)) return
    this.pending = this.pending.then(async () => {
      const response = await destroy("/recent_files", { responseKind: "json" })
      if (!response.ok) throw new Error("Unable to clear recent files")
    })
    try {
      await this.pending
      await this.refresh({ force: true })
    } catch {
      this.pending = Promise.resolve()
      this.showError()
    }
  }

  showError() {
    this.statusTarget.textContent = this.element.dataset.errorMessage
  }
}
