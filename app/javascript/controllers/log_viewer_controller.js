import { Controller } from "@hotwired/stimulus"
import { get } from "@rails/request.js"

// Log Viewer Controller
// Opens a dialog showing the last 100 lines of the Rails log
// and a Config tab showing current configuration with value sources
// Triggered by keyboard shortcut Ctrl+Shift+O (via app_controller)

export default class extends Controller {
  static targets = ["dialog", "content", "status", "environment", "title",
                     "configContent", "tabLogs", "tabConfig"]

  async open() {
    if (!this.hasDialogTarget) return

    this.activeTab = "logs"
    this.dialogTarget.showModal()
    this.showLoading()
    await this.fetchLogs()
  }

  close() {
    if (this.hasDialogTarget) {
      this.dialogTarget.close()
    }
  }

  showLoading() {
    if (this.activeTab === "config") {
      if (this.hasConfigContentTarget) {
        this.configContentTarget.textContent = window.t("dialogs.log_viewer.loading")
      }
    } else {
      if (this.hasContentTarget) {
        this.contentTarget.textContent = window.t("dialogs.log_viewer.loading")
      }
    }
    if (this.hasStatusTarget) {
      this.statusTarget.textContent = ""
    }
  }

  showLogs() {
    this.activeTab = "logs"
    this.updateTabStyles()
    if (this.hasContentTarget) this.contentTarget.classList.remove("hidden")
    if (this.hasConfigContentTarget) this.configContentTarget.classList.add("hidden")
    if (this.hasTitleTarget) this.titleTarget.textContent = window.t("dialogs.log_viewer.title_logs")
  }

  async showConfig() {
    this.activeTab = "config"
    this.updateTabStyles()
    if (this.hasContentTarget) this.contentTarget.classList.add("hidden")
    if (this.hasConfigContentTarget) this.configContentTarget.classList.remove("hidden")
    if (this.hasTitleTarget) this.titleTarget.textContent = window.t("dialogs.log_viewer.title_config")

    this.showLoading()
    await this.fetchConfig()
  }

  updateTabStyles() {
    const activeClasses = "border-[var(--theme-accent)] text-[var(--theme-text-primary)]"
    const inactiveClasses = "border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]"

    if (this.hasTabLogsTarget && this.hasTabConfigTarget) {
      if (this.activeTab === "logs") {
        this.tabLogsTarget.className = `px-4 py-2 text-xs font-medium border-b-2 ${activeClasses}`
        this.tabConfigTarget.className = `px-4 py-2 text-xs font-medium border-b-2 ${inactiveClasses}`
      } else {
        this.tabLogsTarget.className = `px-4 py-2 text-xs font-medium border-b-2 ${inactiveClasses}`
        this.tabConfigTarget.className = `px-4 py-2 text-xs font-medium border-b-2 ${activeClasses}`
      }
    }
  }

  async fetchLogs() {
    try {
      const response = await get("/logs/tail?lines=100", { responseKind: "json" })

      if (!response.ok) {
        throw new Error(`HTTP ${response.statusCode}`)
      }

      const data = await response.json

      if (this.hasEnvironmentTarget) {
        this.environmentTarget.textContent = `${data.environment} - ${data.file}`
      }

      if (this.hasContentTarget) {
        if (data.lines && data.lines.length > 0) {
          this.contentTarget.textContent = data.lines.join("\n")
          // Scroll to bottom
          this.contentTarget.scrollTop = this.contentTarget.scrollHeight
        } else {
          this.contentTarget.textContent = window.t("dialogs.log_viewer.empty_logs")
        }
      }

      if (this.hasStatusTarget) {
        const count = data.lines?.length || 0
        const countKey = count === 1 ? "line_count_one" : "line_count"
        this.statusTarget.textContent = window.t(`dialogs.log_viewer.${countKey}`, { count })
      }
    } catch (error) {
      console.error("[FrankMD] Failed to fetch logs:", error)
      if (this.hasContentTarget) {
        this.contentTarget.textContent = window.t("dialogs.log_viewer.error_loading_logs", { error: error.message })
      }
    }
  }

  async fetchConfig() {
    try {
      const response = await get("/logs/config", { responseKind: "json" })

      if (!response.ok) {
        throw new Error(`HTTP ${response.statusCode}`)
      }

      const data = await response.json

      if (this.hasEnvironmentTarget) {
        this.environmentTarget.textContent = `${data.environment} - ${data.config_file_exists ? data.config_file : window.t("dialogs.log_viewer.no_config_file")}`
      }

      if (this.hasConfigContentTarget) {
        this.configContentTarget.innerHTML = this.renderConfigTable(data)
      }

      if (this.hasStatusTarget) {
        const count = data.entries?.length || 0
        const countKey = count === 1 ? "key_count_one" : "key_count"
        this.statusTarget.textContent = window.t(`dialogs.log_viewer.${countKey}`, { count })
      }
    } catch (error) {
      console.error("[FrankMD] Failed to fetch config:", error)
      if (this.hasConfigContentTarget) {
        this.configContentTarget.textContent = window.t("dialogs.log_viewer.error_loading_config", { error: error.message })
      }
    }
  }

  renderConfigTable(data) {
    const t = (key, options = {}) => window.t(`dialogs.log_viewer.${key}`, options)

    const escapeHtml = (str) => {
      const div = document.createElement("div")
      if (str === null || str === undefined) {
        div.textContent = t("null_value")
        return `<span class='text-[var(--theme-text-muted)]'>${div.innerHTML}</span>`
      }
      div.textContent = String(str)
      return div.innerHTML
    }

    const sourceLabel = (source) => {
      switch (source) {
        case "file": return `<span class="text-green-400 font-bold">.fed</span>`
        case "env": return `<span class="text-yellow-400 font-bold">ENV</span>`
        case "default": return `<span class="text-[var(--theme-text-muted)]">${escapeHtml(t("source_default"))}</span>`
        default: return escapeHtml(source)
      }
    }

    let html = ""

    // Header info
    html += `<div class="mb-4 p-3 rounded bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)]">`
    html += `<div><strong>${escapeHtml(t("config_file_label"))}:</strong> ${escapeHtml(data.config_file)}</div>`
    html += `<div><strong>${escapeHtml(t("file_exists_label"))}:</strong> ${escapeHtml(data.config_file_exists ? t("yes") : t("no"))}</div>`
    html += `<div><strong>${escapeHtml(t("ai_configured_label"))}:</strong> ${escapeHtml(data.ai_configured_in_file ? t("ai_configured_yes") : t("ai_configured_no"))}</div>`
    html += `</div>`

    // Table
    html += `<table class="w-full border-collapse">`
    html += `<thead><tr class="border-b border-[var(--theme-border)]">`
    html += `<th class="text-left py-1.5 px-2 text-[var(--theme-text-muted)]">${escapeHtml(t("key"))}</th>`
    html += `<th class="text-left py-1.5 px-2 text-[var(--theme-text-muted)]">${escapeHtml(t("value"))}</th>`
    html += `<th class="text-left py-1.5 px-2 text-[var(--theme-text-muted)]">${escapeHtml(t("source"))}</th>`
    html += `<th class="text-left py-1.5 px-2 text-[var(--theme-text-muted)]">${escapeHtml(t("env_var"))}</th>`
    html += `</tr></thead><tbody>`

    if (!data.entries?.length) {
      html += `<tr><td colspan="4" class="py-3 px-2 text-center text-[var(--theme-text-muted)]">${escapeHtml(t("empty_config"))}</td></tr>`
    } else {
      for (const entry of data.entries) {
        const rowClass = entry.source === "file" ? "bg-green-900/10" :
                         entry.source === "env" ? "bg-yellow-900/10" : ""
        html += `<tr class="border-b border-[var(--theme-border)]/30 ${rowClass}">`
        html += `<td class="py-1.5 px-2 font-mono">${escapeHtml(entry.key)}</td>`
        html += `<td class="py-1.5 px-2 font-mono">${escapeHtml(entry.value)}</td>`
        html += `<td class="py-1.5 px-2">${sourceLabel(entry.source)}</td>`
        html += `<td class="py-1.5 px-2 text-[var(--theme-text-muted)]">${entry.env_var ? escapeHtml(entry.env_var) : "-"}</td>`
        html += `</tr>`
      }
    }

    html += `</tbody></table>`
    return html
  }

  async refresh() {
    this.showLoading()
    if (this.activeTab === "config") {
      await this.fetchConfig()
    } else {
      await this.fetchLogs()
    }
  }

  onDialogClick(event) {
    // Close when clicking backdrop
    if (event.target === this.dialogTarget) {
      this.close()
    }
  }

  onKeydown(event) {
    if (event.key === "Escape") {
      this.close()
    }
  }
}
