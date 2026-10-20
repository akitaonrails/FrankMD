import { Controller } from "@hotwired/stimulus"

// Path Display Controller
// Displays document names or truncated paths while preserving the full path for copying.

export default class extends Controller {
  static targets = ["text"]
  static values = { basename: Boolean, renameLabel: String }

  connect() {
    this.setupResizeListener()
  }

  disconnect() {
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler)
    }
  }

  setupResizeListener() {
    this.resizeHandler = this.debounce(() => this.handleResize(), 100)
    window.addEventListener("resize", this.resizeHandler)
  }

  // Basename mode uses CSS truncation; full paths truncate from the left.
  update(path) {
    if (!this.hasTextTarget) return

    const container = this.element
    const wrapper = container.parentElement // The flex-1 parent that has actual width

    if (!path) {
      this.textTarget.textContent = window.t("editor.select_note")
      this.textTarget.dataset.fullPath = ""
      container.classList.remove("truncated")
      if (this.basenameValue) {
        this.element.title = window.t("editor.select_note")
        this.element.setAttribute("aria-label", window.t("editor.select_note"))
      }
      return
    }

    // Store full path for hover and copy
    this.textTarget.dataset.fullPath = path

    if (this.basenameValue) {
      this.textTarget.textContent = path.split("/").pop().replace(/\.md$/, "")
      this.element.title = path
      this.element.setAttribute("aria-label", `${this.renameLabelValue}: ${this.textTarget.textContent}`)
      return
    }

    // Measure available width from the wrapper (flex-1 container)
    // Subtract some padding for the save status and margins
    const availableWidth = wrapper ? (wrapper.clientWidth - 20) : 300

    // Create a temporary span to measure text width
    const measureSpan = document.createElement("span")
    measureSpan.style.cssText = "visibility:hidden;position:absolute;white-space:nowrap;font:inherit;"
    measureSpan.className = this.textTarget.className
    document.body.appendChild(measureSpan)

    measureSpan.textContent = path
    const fullWidth = measureSpan.offsetWidth

    if (fullWidth <= availableWidth) {
      // Path fits - show full path, left-aligned
      this.textTarget.textContent = path
      container.classList.remove("truncated")
    } else {
      // Path doesn't fit - truncate from left with "..."
      const ellipsis = "..."
      let truncatedPath = path

      // Progressively remove path segments from the left
      const parts = path.split("/")
      for (let i = 1; i < parts.length; i++) {
        truncatedPath = ellipsis + parts.slice(i).join("/")
        measureSpan.textContent = truncatedPath
        if (measureSpan.offsetWidth <= availableWidth) {
          break
        }
      }

      this.textTarget.textContent = truncatedPath
      container.classList.add("truncated")
    }

    document.body.removeChild(measureSpan)
  }

  // Copy current file path to clipboard
  copy() {
    const fullPath = this.textTarget?.dataset?.fullPath
    if (!fullPath) return

    navigator.clipboard.writeText(fullPath).then(() => {
      // Show toast feedback
      this.showToast(window.t("status.copied_to_clipboard"))
    }).catch(err => {
      console.error("Failed to copy path:", err)
    })
  }

  // Show a toast notification that auto-dismisses
  showToast(message, duration = 2000) {
    // Remove any existing toast
    const existingToast = document.getElementById("app-toast")
    if (existingToast) {
      existingToast.remove()
    }

    // Create toast element
    const toast = document.createElement("div")
    toast.id = "app-toast"
    toast.className = "app-toast"
    toast.setAttribute("role", "status")
    toast.setAttribute("aria-live", "polite")
    toast.textContent = message

    document.body.appendChild(toast)

    // Trigger animation after append
    requestAnimationFrame(() => {
      toast.classList.add("app-toast--visible")
    })

    // Auto-dismiss
    setTimeout(() => {
      toast.classList.remove("app-toast--visible")
      toast.classList.add("app-toast--hiding")
      // Remove from DOM after fade out animation
      setTimeout(() => toast.remove(), 300)
    }, duration)
  }

  // Show full path on hover (when truncated)
  showFull() {
    if (!this.hasTextTarget) return
    if (!this.element.classList.contains("truncated")) return

    const fullPath = this.textTarget.dataset.fullPath
    if (fullPath) {
      this.textTarget.textContent = fullPath
    }
  }

  // Restore truncated path after hover
  hideFull() {
    if (!this.hasTextTarget) return
    const fullPath = this.textTarget.dataset.fullPath
    if (fullPath) {
      this.update(fullPath)
    }
  }

  // Recalculate path display on resize
  handleResize() {
    const fullPath = this.textTarget?.dataset?.fullPath
    if (fullPath) {
      this.update(fullPath)
    }
  }

  // Simple debounce helper
  debounce(func, wait) {
    let timeout
    return (...args) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func.apply(this, args), wait)
    }
  }
}
