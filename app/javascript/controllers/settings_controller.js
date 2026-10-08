import { Controller } from "@hotwired/stimulus"
import { get, patch } from "@rails/request.js"
import { normalizeLineNumberMode } from "lib/line_numbers"

// SettingsController
// Settings dialog: left-nav categories + control panels.
// Absorbs the old editor-config controller: Stimulus values synced from the
// server drive CodeMirror, preview and CSS custom properties, and the
// workspace controls mutate those values and persist them via PATCH /config
// (server enforces Config::UI_KEYS).
// The dialog stays mounted while closed so app configuration and outlets are
// available before it opens.

export default class extends Controller {
  static outlets = ["codemirror", "preview"]

  static targets = [
    "navButton",
    "section",
    "fontSelect",
    "fontSizeSelect",
    "fontPreview",
    "widthInput",
    "widthLabel",
    "lineNumbersSelect",
    "indentSelect",
    "zoomSelect",
    "viewModeButton",
    "status"
  ]

  static values = {
    font: { type: String, default: "cascadia-code" },
    fontSize: { type: Number, default: 14 },
    editorWidth: { type: Number, default: 72 },
    previewZoom: { type: Number, default: 100 },
    lineNumbers: { type: Number, default: 0 },
    typewriterMode: { type: Boolean, default: false },
    vimMode: { type: Boolean, default: false },
    scrollSync: { type: Boolean, default: true },
    indent: { type: Number, default: 2 },
    theme: { type: String, default: "" },
    viewMode: { type: String, default: "split" }
  }

  static editorFonts = [
    { id: "cascadia-code", name: "Cascadia Code", family: "'Cascadia Code', monospace" },
    { id: "consolas", name: "Consolas", family: "Consolas, monospace" },
    { id: "dejavu-mono", name: "DejaVu Sans Mono", family: "'DejaVu Mono', monospace" },
    { id: "fira-code", name: "Fira Code", family: "'Fira Code', monospace" },
    { id: "hack", name: "Hack", family: "Hack, monospace" },
    { id: "jetbrains-mono", name: "JetBrains Mono", family: "'JetBrains Mono', monospace" },
    { id: "roboto-mono", name: "Roboto Mono", family: "'Roboto Mono', monospace" },
    { id: "source-code-pro", name: "Source Code Pro", family: "Source Code Pro, monospace" },
    { id: "ubuntu-mono", name: "Ubuntu Mono", family: "Ubuntu Mono, monospace" }
  ]

  // Zoom levels mirror preview_controller's discrete steps so the select and
  // the preview panel's +/- buttons always agree.
  static zoomLevels = [50, 75, 90, 100, 110, 125, 150, 175, 200]

  connect() {
    this._codemirrorReady = false
    this._previewReady = false
    this._configSaveTimeout = null
    this.category = "general"
    this.boundDialogClose = () => this.onDialogClose()
    this.element.addEventListener("close", this.boundDialogClose)
    // Apply non-outlet settings immediately
    this.applyEditorWidth()
    this.applyTheme()
    // Outlet-dependent settings are applied via *OutletConnected() callbacks
  }

  disconnect() {
    this.element.removeEventListener("close", this.boundDialogClose)
    if (this._configSaveTimeout) {
      clearTimeout(this._configSaveTimeout)
      this._configSaveTimeout = null
    }
  }

  codemirrorOutletConnected() {
    this._codemirrorReady = true
    this.applyFont()
    this.applyLineNumbers()
    this.applyVimMode()
  }

  previewOutletConnected() {
    this._previewReady = true
    this.applyPreviewZoom()
    this.applyScrollSync()
  }

  // === Value Change Callbacks ===
  // Guarded by outlet readiness flags to avoid Stimulus warnings during initialization

  fontValueChanged() {
    if (this._codemirrorReady) this.applyFont()
  }

  fontSizeValueChanged() {
    if (this._codemirrorReady) this.applyFont()
  }

  editorWidthValueChanged() {
    if (this.element.isConnected) this.applyEditorWidth()
  }

  previewZoomValueChanged() {
    if (this._previewReady) this.applyPreviewZoom()
  }

  lineNumbersValueChanged() {
    if (this._codemirrorReady) this.applyLineNumbers()
  }

  vimModeValueChanged() {
    if (this._codemirrorReady) this.applyVimMode()
  }

  scrollSyncValueChanged() {
    if (this._previewReady) this.applyScrollSync()
  }

  viewModeValueChanged() {
    if (this.element.isConnected) this.applyViewMode()
  }

  themeValueChanged() {
    if (this.element.isConnected) this.applyTheme()
  }

  // === Apply Methods ===

  applyFont() {
    const font = this.constructor.editorFonts.find(f => f.id === this.fontValue)
    const codemirror = this.getCodemirrorController()
    if (codemirror && font) {
      codemirror.setFontFamily(font.family)
      codemirror.setFontSize(this.fontSizeValue)
    }
  }

  applyEditorWidth() {
    document.documentElement.style.setProperty("--editor-width", `${this.editorWidthValue}ch`)
  }

  applyPreviewZoom() {
    const preview = this.getPreviewController()
    if (preview) {
      preview.zoomValue = this.previewZoomValue
    }
  }

  applyLineNumbers() {
    const mode = normalizeLineNumberMode(this.lineNumbersValue, "off")
    const codemirror = this.getCodemirrorController()
    if (codemirror) {
      codemirror.setLineNumberMode(mode)
    }
  }

  applyVimMode() {
    const codemirror = this.getCodemirrorController()
    if (codemirror) {
      codemirror.setVimMode(this.vimModeValue)
    }
  }

  applyScrollSync() {
    const preview = this.getPreviewController()
    if (preview) {
      preview.syncScrollEnabledValue = this.scrollSyncValue
    }
  }

  applyTheme() {
    if (this.themeValue) {
      window.dispatchEvent(new CustomEvent("frankmd:config-changed", {
        detail: { theme: this.themeValue }
      }))
    }
  }

  // Document view mode owns the main-area layout, which the app controller
  // manages (editor/preview panes + workspace interplay), so applying it
  // delegates there — mirroring how preview_zoom applies via the outlet.
  applyViewMode() {
    this.getAppController()?.setViewMode(this.viewModeValue)
  }

  getAppController() {
    const appEl = document.querySelector('[data-controller~="app"]')
    if (!appEl) return null
    return this.application.getControllerForElementAndIdentifier(appEl, "app")
  }

  // === Persistence ===
  // All writes go through PATCH /config (whitelisted to Config::UI_KEYS
  // server-side) and announce success via frankmd:config-file-modified so an
  // open .fed editor reloads, exactly like the theme picker and app#saveConfig.

  saveSetting(settings) {
    if (this._configSaveTimeout) {
      clearTimeout(this._configSaveTimeout)
    }

    this._configSaveTimeout = setTimeout(async () => {
      this._configSaveTimeout = null
      try {
        const response = await patch("/config", {
          body: settings,
          responseKind: "json"
        })

        if (!response.ok) {
          console.warn("Failed to save settings:", await response.text)
          this.showStatus(window.t("settings.save_failed"))
        } else {
          window.dispatchEvent(new CustomEvent("frankmd:config-file-modified"))
        }
      } catch (error) {
        console.warn("Failed to save settings:", error)
      }
    }, 500)
  }

  showStatus(message) {
    if (!this.hasStatusTarget) return
    this.statusTarget.textContent = message
    this.statusTarget.classList.remove("hidden")
    if (this._statusTimeout) clearTimeout(this._statusTimeout)
    this._statusTimeout = setTimeout(() => {
      this.statusTarget.classList.add("hidden")
    }, 2000)
  }

  // === Reload from Server ===
  // Re-syncs values when the .fed file is edited as a note (autosave
  // config-saved → app#reloadConfig). Uses the JSON GET /config endpoint.

  async reload() {
    try {
      const response = await get("/config", { responseKind: "json" })
      if (!response.ok) return

      const data = await response.json
      const settings = data?.settings || {}
      this.assignIfChanged("fontValue", settings.editor_font)
      this.assignIfChanged("fontSizeValue", settings.editor_font_size, Number)
      this.assignIfChanged("editorWidthValue", settings.editor_width, Number)
      this.assignIfChanged("previewZoomValue", settings.preview_zoom, Number)
      this.assignIfChanged("lineNumbersValue", settings.editor_line_numbers, Number)
      this.assignIfChanged("indentValue", settings.editor_indent, Number)
      this.assignIfChanged("vimModeValue", settings.vim_mode)
      this.assignIfChanged("typewriterModeValue", settings.typewriter_mode)
      // scroll_sync is enabled unless explicitly false (nil means default-on)
      if (Object.prototype.hasOwnProperty.call(settings, "scroll_sync")) {
        this.assignIfChanged("scrollSyncValue", settings.scroll_sync !== false)
      }
      this.assignIfChanged("themeValue", settings.theme)
      this.assignIfChanged("viewModeValue", settings.view_mode === "single" ? "single" : "split")
      this.syncControls()
    } catch (error) {
      console.warn("Error reloading settings:", error)
    }
  }

  assignIfChanged(propertyName, rawValue, coerce) {
    if (rawValue === null || rawValue === undefined) return
    const value = coerce ? coerce(rawValue) : rawValue
    if (Number.isNaN(value)) return
    if (this[propertyName] !== value) this[propertyName] = value
  }

  // Mirror current values into the workspace controls (initial render comes
  // from the server; this catches value changes made outside the panel).
  syncControls() {
    if (this.hasFontSelectTarget) this.fontSelectTarget.value = this.fontValue
    if (this.hasFontSizeSelectTarget) this.fontSizeSelectTarget.value = String(this.fontSizeValue)
    if (this.hasWidthInputTarget) this.widthInputTarget.value = this.editorWidthValue
    if (this.hasWidthLabelTarget) this.widthLabelTarget.textContent = `${this.editorWidthValue}ch`
    if (this.hasLineNumbersSelectTarget) this.lineNumbersSelectTarget.value = String(this.lineNumbersValue)
    if (this.hasIndentSelectTarget) this.indentSelectTarget.value = String(this.indentValue)
    if (this.hasZoomSelectTarget) {
      const zoom = this.constructor.zoomLevels.includes(this.previewZoomValue) ? this.previewZoomValue : 100
      this.zoomSelectTarget.value = String(zoom)
    }
    this.syncViewModeButtons()
    this.updateFontPreview()
  }

  // === Dialog ===

  get isDialogOpen() {
    return this.element.open
  }

  toggleDialog() {
    if (this.isDialogOpen) {
      this.closeSettings()
      return false
    }

    this.openDialog()
    return true
  }

  openDialog() {
    if (this.isDialogOpen) return false

    this.syncControls()
    this.element.showModal()
    this.navButtonTargets[0]?.focus()
    this.dispatch("dialog-state-changed", { detail: { open: true } })
    return true
  }

  // Left-nav category switching
  showCategory(event) {
    const category = event.currentTarget.dataset.category
    if (!category) return
    this.category = category

    this.navButtonTargets.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.category === category))
    })

    this.sectionTargets.forEach((section) => {
      section.classList.toggle("hidden", section.dataset.category !== category)
    })
  }

  // Close button; native dialog behavior restores focus to its invoker.
  closeSettings() {
    if (!this.isDialogOpen) return false
    this.element.close()
    return true
  }

  closeOnBackdrop(event) {
    if (event.target === this.element) this.closeSettings()
  }

  onDialogClose() {
    this.dispatch("dialog-state-changed", { detail: { open: false } })
  }

  // === Control Handlers (apply live + persist) ===

  onFontChange() {
    this.fontValue = this.fontSelectTarget.value
    this.updateFontPreview()
    this.saveSetting({ editor_font: this.fontValue })
  }

  onFontSizeChange() {
    this.fontSizeValue = parseInt(this.fontSizeSelectTarget.value, 10)
    this.updateFontPreview()
    this.saveSetting({ editor_font_size: this.fontSizeValue })
  }

  onWidthInput() {
    this.editorWidthValue = parseInt(this.widthInputTarget.value, 10)
    this.widthLabelTarget.textContent = `${this.editorWidthValue}ch`
    this.saveSetting({ editor_width: this.editorWidthValue })
  }

  onLineNumbersChange() {
    this.lineNumbersValue = parseInt(this.lineNumbersSelectTarget.value, 10)
    this.saveSetting({ editor_line_numbers: this.lineNumbersValue })
  }

  onIndentChange() {
    this.indentValue = parseInt(this.indentSelectTarget.value, 10)
    this.saveSetting({ editor_indent: this.indentValue })
  }

  onZoomChange() {
    this.previewZoomValue = parseInt(this.zoomSelectTarget.value, 10)
    this.saveSetting({ preview_zoom: this.previewZoomValue })
  }

  // Segmented control: pick how documents are displayed (split/single)
  onViewModeChange(event) {
    const mode = event.currentTarget.dataset.viewMode === "single" ? "single" : "split"
    this.viewModeValue = mode
    this.syncViewModeButtons()
    this.saveSetting({ view_mode: mode })
  }

  syncViewModeButtons() {
    this.viewModeButtonTargets.forEach((button) => {
      button.setAttribute("aria-pressed", String(this.viewModeValue === button.dataset.viewMode))
    })
  }

  updateFontPreview() {
    if (!this.hasFontPreviewTarget) return
    const font = this.constructor.editorFonts.find(f => f.id === this.fontValue)
    if (font) {
      this.fontPreviewTarget.style.fontFamily = font.family
      this.fontPreviewTarget.style.fontSize = `${this.fontSizeValue}px`
    }
  }

  // === Controller Getters (via Stimulus Outlets) ===

  getCodemirrorController() { return this.codemirrorOutlets[0] ?? null }
  getPreviewController() { return this.previewOutlets[0] ?? null }

  // === Public Getters for App Controller ===

  get currentFont() { return this.fontValue }
  get currentFontSize() { return this.fontSizeValue }
  get editorWidth() { return this.editorWidthValue }
  get previewZoom() { return this.previewZoomValue }
  get lineNumberMode() { return normalizeLineNumberMode(this.lineNumbersValue, "off") }
  get typewriterModeEnabled() { return this.typewriterModeValue }
  get scrollSyncEnabled() { return this.scrollSyncValue }
  get editorIndent() { return this.indentValue }
  get viewMode() { return this.viewModeValue === "single" ? "single" : "split" }
  get fonts() { return this.constructor.editorFonts }
}
