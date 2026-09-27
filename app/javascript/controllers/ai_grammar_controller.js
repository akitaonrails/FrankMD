import { Controller } from "@hotwired/stimulus"
import { get, post } from "@rails/request.js"
import { computeWordDiff } from "lib/diff_utils"
import { appAlert } from "lib/app_prompt"

// AI Grammar Controller
// Handles AI-powered grammar checking with diff view
// Dispatches ai-grammar:accepted event with corrected text

export default class extends Controller {
  static targets = [
    "dialog",
    "configNotice",
    "diffContent",
    "originalText",
    "correctedText",
    "correctedDiff",
    "providerBadge",
    "editToggle",
    "processingOverlay",
    "processingProvider"
  ]

  connect() {
    this.aiEnabled = false
    this.aiProvider = null
    this.aiModel = null
    this.aiAbortController = null
    this.currentFilePath = null

    this.checkAiAvailability()
  }

  async checkAiAvailability() {
    try {
      const response = await get("/ai/config", { responseKind: "json" })
      if (response.ok) {
        const data = await response.json
        this.aiEnabled = data.enabled
        this.aiProvider = data.provider
        this.aiModel = data.model
      }
    } catch (e) {
      console.debug("AI config check failed:", e)
      this.aiEnabled = false
      this.aiProvider = null
      this.aiModel = null
    }
  }

  // Called by app_controller with file path
  async open(filePath) {
    // Hide provider badge initially
    if (this.hasProviderBadgeTarget) {
      this.providerBadgeTarget.classList.add("hidden")
    }

    // If AI is not configured, show the config notice
    if (!this.aiEnabled) {
      this.configNoticeTarget.classList.remove("hidden")
      this.diffContentTarget.classList.add("hidden")
      this.dialogTarget.showModal()
      return
    }

    if (!filePath) {
      appAlert(window.t("errors.no_file_open"))
      return
    }

    this.currentFilePath = filePath

    // Dispatch event to notify app controller (e.g., to disable editor, update button state)
    this.dispatch("processing-started")

    // Show processing overlay
    if (this.hasProcessingOverlayTarget) {
      if (this.hasProcessingProviderTarget && this.aiProvider && this.aiModel) {
        this.processingProviderTarget.textContent = `${this.aiProvider}: ${this.aiModel}`
      } else if (this.hasProcessingProviderTarget) {
        this.processingProviderTarget.textContent = "AI"
      }
      this.processingOverlayTarget.classList.remove("hidden")
    }

    // Setup abort controller for ESC key cancellation
    this.aiAbortController = new AbortController()
    this.boundHandleEscKey = (e) => {
      if (e.key === "Escape" && this.aiAbortController) {
        this.aiAbortController.abort()
      }
    }
    document.addEventListener("keydown", this.boundHandleEscKey)

    try {
      const response = await post("/ai/fix_grammar", {
        body: { path: filePath },
        responseKind: "json",
        signal: this.aiAbortController.signal
      })

      const data = await response.json

      if (data.error) {
        appAlert(`${window.t("errors.failed_to_process_ai")}: ${data.error}`)
        return
      }

      // Show provider badge
      if (this.hasProviderBadgeTarget && data.provider && data.model) {
        this.providerBadgeTarget.textContent = `${data.provider}: ${data.model}`
        this.providerBadgeTarget.classList.remove("hidden")
      }

      // Populate and show dialog with diff content
      this.configNoticeTarget.classList.add("hidden")
      this.diffContentTarget.classList.remove("hidden")
      this.diffContentTarget.classList.add("flex")

      // Compute and display diff
      const diff = computeWordDiff(data.original, data.corrected)
      this.originalTextTarget.innerHTML = this.renderDiffOriginal(diff)
      this.correctedDiffTarget.innerHTML = this.renderDiffCorrected(diff)
      this.correctedTextTarget.value = data.corrected

      // Reset to diff view mode
      this.correctedDiffTarget.classList.remove("hidden")
      this.correctedTextTarget.classList.add("hidden")
      if (this.hasEditToggleTarget) {
        this.editToggleTarget.textContent = window.t("common.edit")
      }

      this.dialogTarget.showModal()
    } catch (e) {
      if (e.name === "AbortError") {
        console.log("AI request cancelled by user")
      } else {
        console.error("AI request failed:", e)
        appAlert(window.t("errors.failed_to_process_ai"))
      }
    } finally {
      this.cleanup()
    }
  }

  cleanup() {
    document.removeEventListener("keydown", this.boundHandleEscKey)
    this.aiAbortController = null

    if (this.hasProcessingOverlayTarget) {
      this.processingOverlayTarget.classList.add("hidden")
    }

    // Dispatch event to notify app controller (e.g., to re-enable editor, restore button state)
    this.dispatch("processing-ended")
  }

  close() {
    this.dialogTarget.close()
  }

  toggleEditMode() {
    const isEditing = !this.correctedTextTarget.classList.contains("hidden")

    if (isEditing) {
      // Switch to diff view
      this.correctedTextTarget.classList.add("hidden")
      this.correctedDiffTarget.classList.remove("hidden")
      this.editToggleTarget.textContent = window.t("common.edit")
    } else {
      // Switch to edit view
      this.correctedDiffTarget.classList.add("hidden")
      this.correctedTextTarget.classList.remove("hidden")
      this.editToggleTarget.textContent = window.t("preview.title")
      this.correctedTextTarget.focus()
    }
  }

  accept() {
    const correctedText = this.correctedTextTarget.value
    this.dispatch("accepted", { detail: { correctedText } })
    this.close()
  }

  // Render diff for the original text column (shows deletions)
  renderDiffOriginal(diff) {
    let html = ""
    for (const item of diff) {
      const escaped = this.escapeHtml(item.value)
      if (item.type === "equal") {
        html += `<span class="ai-diff-equal">${escaped}</span>`
      } else if (item.type === "delete") {
        html += `<span class="ai-diff-del">${escaped}</span>`
      }
    }
    return html
  }

  // Render diff for the corrected text column (shows additions)
  renderDiffCorrected(diff) {
    let html = ""
    for (const item of diff) {
      const escaped = this.escapeHtml(item.value)
      if (item.type === "equal") {
        html += `<span class="ai-diff-equal">${escaped}</span>`
      } else if (item.type === "insert") {
        html += `<span class="ai-diff-add">${escaped}</span>`
      }
    }
    return html
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }
}
