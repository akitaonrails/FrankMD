import { Controller } from "@hotwired/stimulus"
import { escapeHtml, fuzzyScore } from "lib/text_utils"
import { encodePath } from "lib/url_utils"

// File Finder Controller
// Handles Ctrl+P file finder dialog
// Dispatches file-finder:selected event with file path

export default class extends Controller {
  static targets = [
    "dialog",
    "input",
    "results",
    "preview"
  ]

  connect() {
    this.allFiles = []
    this.filteredResults = []
    this.selectedIndex = 0
    this.usingKeyboard = false
  }

  // Called by app_controller with flattened file tree
  open(files) {
    this.allFiles = files
    this.filteredResults = [...this.allFiles].slice(0, 10)
    this.selectedIndex = 0

    this.inputTarget.value = ""
    this.renderResults()
    this.dialogTarget.showModal()
    this.inputTarget.focus()
  }

  close() {
    this.dialogTarget.close()
  }

  onInput() {
    const query = this.inputTarget.value.trim().toLowerCase()

    if (!query) {
      this.filteredResults = [...this.allFiles].slice(0, 10)
    } else {
      // Fuzzy search: search in full path (including directories)
      this.filteredResults = this.allFiles
        .map(file => {
          const score = fuzzyScore(file.path.toLowerCase(), query)
          return { ...file, score }
        })
        .filter(file => file.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
    }

    this.selectedIndex = 0
    this.renderResults()
  }

  renderResults() {
    if (this.filteredResults.length === 0) {
      this.resultsTarget.innerHTML = `
        <div class="px-3 py-6 text-center text-[var(--theme-text-muted)] text-sm">
          ${window.t("sidebar.no_files_found")}
        </div>
      `
      this.previewTarget.innerHTML = ""
      return
    }

    this.resultsTarget.innerHTML = this.filteredResults
      .map((file, index) => {
        const isSelected = index === this.selectedIndex
        const name = file.name.replace(/\.md$/, "")
        const path = file.path.replace(/\.md$/, "")
        const displayPath = path !== name ? path.replace(new RegExp(`${name}$`), "").replace(/\/$/, "") : ""

        return `
          <button
            type="button"
            class="w-full px-3 py-2 text-left flex items-center gap-2 ${isSelected ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]' : 'hover:bg-[var(--theme-bg-hover)]'}"
            data-index="${index}"
            data-path="${escapeHtml(file.path)}"
            data-action="click->file-finder#selectFromClick mouseenter->file-finder#onHover"
          >
            <svg class="w-4 h-4 flex-shrink-0 ${isSelected ? '' : 'text-[var(--theme-text-muted)]'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">${escapeHtml(name)}</div>
              ${displayPath ? `<div class="truncate text-xs ${isSelected ? 'opacity-75' : 'text-[var(--theme-text-muted)]'}">${escapeHtml(displayPath)}</div>` : ''}
            </div>
          </button>
        `
      })
      .join("")

    this.loadPreview()
  }

  async loadPreview() {
    if (this.filteredResults.length === 0) {
      this.previewTarget.innerHTML = ""
      return
    }

    const file = this.filteredResults[this.selectedIndex]
    if (!file) return

    try {
      const response = await fetch(`/notes/${encodePath(file.path)}`, {
        headers: { "Accept": "application/json" }
      })

      if (!response.ok) {
        this.previewTarget.innerHTML = `<div class="text-[var(--theme-text-muted)] text-sm">${escapeHtml(window.t("dialogs.file_finder.preview_error"))}</div>`
        return
      }

      const data = await response.json()
      const lines = (data.content || "").split("\n").slice(0, 10)
      const preview = lines.join("\n")

      this.previewTarget.innerHTML = `<pre class="text-xs font-mono whitespace-pre-wrap text-[var(--theme-text-secondary)] leading-relaxed">${escapeHtml(preview)}${lines.length >= 10 ? '\n...' : ''}</pre>`
    } catch (error) {
      this.previewTarget.innerHTML = `<div class="text-[var(--theme-text-muted)] text-sm">${escapeHtml(window.t("dialogs.file_finder.preview_error"))}</div>`
    }
  }

  onKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      this.usingKeyboard = true
      if (this.selectedIndex < this.filteredResults.length - 1) {
        this.selectedIndex++
        this.renderResults()
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      this.usingKeyboard = true
      if (this.selectedIndex > 0) {
        this.selectedIndex--
        this.renderResults()
      }
    } else if (event.key === "Enter") {
      event.preventDefault()
      this.selectCurrent()
    }
  }

  onHover(event) {
    // Ignore hover events when navigating with keyboard
    if (this.usingKeyboard) return

    const index = parseInt(event.currentTarget.dataset.index)
    if (index !== this.selectedIndex) {
      this.selectedIndex = index
      this.renderResults()
    }
  }

  onMouseMove() {
    // Re-enable mouse selection when mouse moves
    this.usingKeyboard = false
  }

  selectFromClick(event) {
    const path = event.currentTarget.dataset.path
    this.dispatchSelected(path)
  }

  selectCurrent() {
    if (this.filteredResults.length === 0) return
    const file = this.filteredResults[this.selectedIndex]
    if (file) {
      this.dispatchSelected(file.path)
    }
  }

  dispatchSelected(path) {
    this.dispatch("selected", { detail: { path } })
    this.close()
  }
}
