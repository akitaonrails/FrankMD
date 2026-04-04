import { Controller } from "@hotwired/stimulus"
import { get, patch } from "@rails/request.js"
import { marked } from "marked"
import { escapeHtml } from "lib/text_utils"
import { findTableAtPosition, findCodeBlockAtPosition } from "lib/markdown_utils"
import { allExtensions } from "lib/marked_extensions"
import { encodePath } from "lib/url_utils"
import {
  DEFAULT_SHORTCUTS,
  createKeyHandler,
  mergeShortcuts
} from "lib/keyboard_shortcuts"
import { createTextareaAdapter } from "lib/codemirror_adapter"
import {
  insertBlockContent,
  insertInlineContent,
  insertImage,
  insertCodeBlock,
  insertVideoEmbed
} from "lib/codemirror_content_insertion"
import { setWikilinkFileProvider } from "lib/codemirror_wikilink"
export default class extends Controller {
  static targets = [
    "fileTree",
    "editorPlaceholder",
    "editor",
    "textarea",
    "currentPath",
    "contextMenu",
    "editorToolbar",
    "helpDialog",
    "tableHint",
    "sidebar",
    "sidebarToggle",
    "aiButton",
    "editorWrapper",
    "editorBody"
  ]

  static outlets = [
    "codemirror", "preview", "typewriter", "stats-panel",
    "path-display", "text-format", "help", "file-operations",
    "emoji-picker", "offline-backup", "recovery-diff",
    "autosave", "scroll-sync", "editor-config",
    "image-picker", "file-finder", "find-replace", "jump-to-line",
    "content-search", "ai-grammar", "video-dialog", "log-viewer",
    "code-dialog", "customize", "drag-drop"
  ]

  static values = {
    initialPath: String,
    initialNote: Object
  }

  connect() {
    this.currentFile = null
    this.currentFileType = null  // "markdown", "config", or null
    this.expandedFolders = new Set()

    // Sidebar/Explorer visibility - always start visible
    // (don't persist closed state across sessions)
    this.sidebarVisible = true

    // Track pending config saves to debounce
    this.configSaveTimeout = null

    // Debounce timers for performance
    this._tableCheckTimeout = null

    this.setupKeyboardShortcuts()
    this.setupDialogClickOutside()
    this.applySidebarVisibility()
    this.initializeTypewriterMode()
    this.setupConfigFileListener()
    this.setupTableEditorListener()

    // Provide file list to wikilink autocomplete
    setWikilinkFileProvider(() => this.getFilesFromTree())

    // Configure marked with custom extensions for superscript, subscript, highlight, emoji
    marked.use({
      breaks: true,
      gfm: true,
      extensions: allExtensions
    })

    // Setup browser history handling for back/forward buttons
    this.setupHistoryHandling()

    // Pre-set codemirror's content attribute so it creates the editor with the right content
    // (before the codemirror controller connects and reads its contentValue)
    this._preloadInitialContent()

    // Defer full initialization until codemirror outlet connects.
    // Fallback timeout ensures it runs even if outlet callback doesn't fire.
    this._initialFileHandled = false
    this._initialFileTimeout = setTimeout(() => this._completeInitialLoad(), 50)
  }

  // Called by Stimulus when the codemirror outlet controller connects
  codemirrorOutletConnected() {
    this._completeInitialLoad()
  }

  _preloadInitialContent() {
    if (!this.hasInitialNoteValue) return

    const initialNote = this.initialNoteValue
    if (!initialNote || !initialNote.exists || initialNote.content === null) return

    const cmElement = this.element.querySelector('[data-controller~="codemirror"]')
    if (cmElement) {
      cmElement.setAttribute("data-codemirror-content-value", initialNote.content)
    }
  }

  _completeInitialLoad() {
    if (this._initialFileHandled) return
    this._initialFileHandled = true
    if (this._initialFileTimeout) {
      clearTimeout(this._initialFileTimeout)
      this._initialFileTimeout = null
    }
    this.handleInitialFile()
    this._removeSplashScreen()
  }

  _removeSplashScreen() {
    const loadingScreen = document.getElementById("app-loading")
    if (loadingScreen) {
      loadingScreen.style.opacity = "0"
      loadingScreen.style.transition = "opacity 0.2s ease-out"
      setTimeout(() => loadingScreen.remove(), 200)
    }
  }

  disconnect() {
    // Clear all timeouts
    if (this.configSaveTimeout) clearTimeout(this.configSaveTimeout)
    if (this._tableCheckTimeout) clearTimeout(this._tableCheckTimeout)
    if (this._initialFileTimeout) clearTimeout(this._initialFileTimeout)

    // Remove window/document event listeners
    if (this.boundPopstateHandler) {
      window.removeEventListener("popstate", this.boundPopstateHandler)
    }
    if (this.boundTableInsertHandler) {
      window.removeEventListener("frankmd:insert-table", this.boundTableInsertHandler)
    }
    if (this.boundConfigFileHandler) {
      window.removeEventListener("frankmd:config-file-modified", this.boundConfigFileHandler)
    }
    if (this.boundKeydownHandler) {
      document.removeEventListener("keydown", this.boundKeydownHandler)
    }

    // Clean up object URLs to prevent memory leaks
    this.cleanupLocalFolderImages()

    // Abort any pending AI requests
    if (this.aiImageAbortController) {
      this.aiImageAbortController.abort()
    }
  }

  // === Controller Getters (via Stimulus Outlets) ===

  // Outlet getters use the plural form (*Outlets) which returns only connected controllers
  // as an array (never throws). Returns null when the outlet controller isn't connected yet.
  getPreviewController() { return this.previewOutlets[0] ?? null }
  getTypewriterController() { return this.typewriterOutlets[0] ?? null }
  getCodemirrorController() { return this.codemirrorOutlets[0] ?? null }
  getPathDisplayController() { return this.pathDisplayOutlets[0] ?? null }
  getTextFormatController() { return this.textFormatOutlets[0] ?? null }
  getHelpController() { return this.helpOutlets[0] ?? null }
  getStatsPanelController() { return this.statsPanelOutlets[0] ?? null }
  getFileOperationsController() { return this.fileOperationsOutlets[0] ?? null }
  getEmojiPickerController() { return this.emojiPickerOutlets[0] ?? null }
  getOfflineBackupController() { return this.offlineBackupOutlets[0] ?? null }
  getRecoveryDiffController() { return this.recoveryDiffOutlets[0] ?? null }
  getAutosaveController() { return this.autosaveOutlets[0] ?? null }
  getScrollSyncController() { return this.scrollSyncOutlets[0] ?? null }
  getEditorConfigController() { return this.editorConfigOutlets[0] ?? null }

  // === URL Management for Bookmarkable URLs ===

  handleInitialFile() {
    // Check if server provided initial note data (from URL like /notes/path/to/file.md)
    const initialNote = this.hasInitialNoteValue ? this.initialNoteValue : null
    if (initialNote && Object.keys(initialNote).length > 0) {
      const { path, content, exists, error } = initialNote

      if (exists && content !== null) {
        // File exists - load it directly from server-provided data
        this.currentFile = path
        const fileType = this.getFileType(path)
        const displayPath = fileType === "markdown" ? path.replace(/\.md$/, "") : path
        this.updatePathDisplay(displayPath)
        this.expandParentFolders(path)
        this.showEditor(content, fileType)
        this.refreshTree()
        return
      }

      if (!exists) {
        // File was requested but doesn't exist
        this.showFileNotFoundMessage(path, error || window.t("errors.file_not_found"))
        // Update URL to root without adding history entry
        this.updateUrl(null, { replace: true })
        return
      }
    }

    // Fallback: Check URL path directly (shouldn't normally happen if server is handling it)
    const urlPath = this.getFilePathFromUrl()
    if (urlPath) {
      this.loadFile(urlPath)
    }
  }

  getFilePathFromUrl() {
    const path = window.location.pathname
    const match = path.match(/^\/notes\/(.+\.md)$/)
    if (match) {
      return decodeURIComponent(match[1])
    }

    // Also check query param ?file=
    const params = new URLSearchParams(window.location.search)
    return params.get("file")
  }

  updateUrl(path, options = {}) {
    const { replace = false } = options
    const newUrl = path ? `/notes/${encodePath(path)}` : "/"

    if (window.location.pathname !== newUrl) {
      if (replace) {
        window.history.replaceState({ file: path }, "", newUrl)
      } else {
        window.history.pushState({ file: path }, "", newUrl)
      }
    }
  }

  setupHistoryHandling() {
    this.boundPopstateHandler = async (event) => {
      const path = event.state?.file || this.getFilePathFromUrl()

      if (path) {
        await this.loadFile(path, { updateHistory: false })
      } else {
        // No file - show placeholder
        this.currentFile = null
        this.updatePathDisplay(null)
        this.editorPlaceholderTarget.classList.remove("hidden")
        this.editorTarget.classList.add("hidden")
        this.editorToolbarTarget.classList.add("hidden")
        this.editorToolbarTarget.classList.remove("flex")
        this.hideStatsPanel()
        this.refreshTree()
      }
    }
    window.addEventListener("popstate", this.boundPopstateHandler)
  }

  expandParentFolders(path) {
    const parts = path.split("/")
    let expandPath = ""

    for (let i = 0; i < parts.length - 1; i++) {
      expandPath = expandPath ? `${expandPath}/${parts[i]}` : parts[i]
      this.expandedFolders.add(expandPath)
    }
  }

  showFileNotFoundMessage(path, message) {
    this.editorPlaceholderTarget.classList.add("hidden")
    this.editorTarget.classList.remove("hidden")
    this.editorToolbarTarget.classList.add("hidden")
    this.editorToolbarTarget.classList.remove("flex")

    this.textareaTarget.value = ""
    this.textareaTarget.disabled = true

    this.currentPathTarget.innerHTML = `
      <span class="text-red-500">${escapeHtml(path)}</span>
      <span class="text-[var(--theme-text-muted)] ml-2">(${escapeHtml(message)})</span>
    `

    // Clear after a moment and return to normal state
    setTimeout(() => {
      this.textareaTarget.disabled = false
      this.updatePathDisplay(null)
      this.editorPlaceholderTarget.classList.remove("hidden")
      this.editorTarget.classList.add("hidden")
      this.hideStatsPanel()
    }, 5000)
  }

  toggleFolder(event) {
    const path = event.currentTarget.dataset.path
    const folderEl = event.currentTarget.closest(".tree-folder")
    const children = folderEl.querySelector(".tree-children")
    const chevron = event.currentTarget.querySelector(".tree-chevron")

    if (this.expandedFolders.has(path)) {
      this.expandedFolders.delete(path)
      children.classList.add("hidden")
      chevron.classList.remove("expanded")
    } else {
      this.expandedFolders.add(path)
      children.classList.remove("hidden")
      chevron.classList.add("expanded")
    }
  }

  // === Drag and Drop Event Handler ===
  // Handle item moved event from drag-drop controller
  onItemMoved(event) {
    const { oldPath, newPath, type } = event.detail

    if (type === "folder") {
      // Preserve expand/collapse state for moved folder and its descendants
      this.expandedFolders = new Set(
        Array.from(this.expandedFolders, (path) => {
          if (path === oldPath || path.startsWith(oldPath + "/")) {
            return `${newPath}${path.slice(oldPath.length)}`
          }
          return path
        })
      )
    }

    // Expand the target folder
    const targetFolder = newPath.split("/").slice(0, -1).join("/")
    if (targetFolder) {
      this.expandedFolders.add(targetFolder)
    }

    // Update current file reference if it was moved
    if (type === "folder" && this.currentFile?.startsWith(oldPath + "/")) {
      this.currentFile = `${newPath}${this.currentFile.slice(oldPath.length)}`
      this.updatePathDisplay(this.currentFile.replace(/\.md$/, ""))
      this.updateUrl(this.currentFile)
    }

    if (this.currentFile === oldPath) {
      this.currentFile = newPath
      this.updatePathDisplay(newPath.replace(/\.md$/, ""))
      this.updateUrl(newPath)
    }

    // Tree is already updated by Turbo Stream
  }

  // === File Selection and Editor ===
  async selectFile(event) {
    const path = event.currentTarget.dataset.path
    await this.loadFile(path)
  }

  async loadFile(path, options = {}) {
    const { updateHistory = true } = options

    try {
      const response = await get(`/notes/${encodePath(path)}`, { responseKind: "json" })

      if (!response.ok) {
        if (response.statusCode === 404) {
          this.showFileNotFoundMessage(path, window.t("errors.note_not_found"))
          if (updateHistory) {
            this.updateUrl(null)
          }
          return
        }
        throw new Error(window.t("errors.failed_to_load"))
      }

      const data = await response.json
      this.currentFile = path
      const fileType = this.getFileType(path)

      // Display path (don't strip extension for non-markdown files)
      const displayPath = fileType === "markdown" ? path.replace(/\.md$/, "") : path
      this.updatePathDisplay(displayPath)

      // Expand parent folders in tree
      this.expandParentFolders(path)

      this.showEditor(data.content, fileType)
      this.refreshTree()

      // Update URL for bookmarkability
      if (updateHistory) {
        this.updateUrl(path)
      }
    } catch (error) {
      console.error("Error loading file:", error)
      const autosave = this.getAutosaveController()
      if (autosave) autosave.showSaveStatus(window.t("status.error_loading"), true)
    }
  }

  showEditor(content, fileType = "markdown") {
    this.currentFileType = fileType
    this.editorPlaceholderTarget.classList.add("hidden")
    this.editorTarget.classList.remove("hidden")

    // Reset table hint immediately when loading new content
    this._setTableHintVisible(false)
    if (this._tableCheckTimeout) {
      clearTimeout(this._tableCheckTimeout)
      this._tableCheckTimeout = null
    }

    // Delegate persistence tracking to autosave controller
    const autosave = this.getAutosaveController()
    if (autosave) {
      autosave.setFile(this.currentFile, content)
      autosave.checkOfflineBackup(content)
    }

    // Set content via CodeMirror controller
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.setValue(content)
      codemirrorController.focus()
    } else {
      // Fallback to hidden textarea
      this.textareaTarget.value = content
    }

    // Only show toolbar and preview for markdown files
    const isMarkdown = fileType === "markdown"

    if (isMarkdown) {
      this.editorToolbarTarget.classList.remove("hidden")
      this.editorToolbarTarget.classList.add("flex")
      this.updatePreview()
    } else {
      this.editorToolbarTarget.classList.add("hidden")
      this.editorToolbarTarget.classList.remove("flex")
      // Hide preview for non-markdown files
      const previewController = this.getPreviewController()
      if (previewController && previewController.isVisible) {
        previewController.hide()
      }
    }

    // Show stats panel and update stats
    this.showStatsPanel()
    this.updateStats()
    // Apply editor settings (font, size, line numbers)
    this.applyEditorSettings()
  }

  // Check if current file is markdown
  isMarkdownFile() {
    return this.currentFileType === "markdown"
  }

  // Get file type from path
  getFileType(path) {
    if (!path) return null
    if (path === ".fed") return "config"
    if (path.endsWith(".md")) return "markdown"
    return "text"
  }

  onTextareaInput() {
    // Legacy method - CodeMirror now handles input via onEditorChange
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // Handle CodeMirror editor change events
  onEditorChange(event) {
    const autosave = this.getAutosaveController()
    if (autosave) {
      const codemirrorController = this.getCodemirrorController()
      const currentContent = codemirrorController ? codemirrorController.getValue() : ""
      autosave.checkContentRestored(currentContent)
      autosave.scheduleOfflineBackup()
      autosave.scheduleAutoSave()
    }

    this.scheduleStatsUpdate()

    // Only do markdown-specific processing for markdown files
    if (this.isMarkdownFile()) {
      // Delegate preview sync to scroll-sync controller
      const scrollSync = this.getScrollSyncController()
      if (scrollSync) {
        const previewController = this.getPreviewController()
        if (previewController && previewController.isVisible) {
          scrollSync.updatePreviewWithSync()
        }
      }

      this.checkTableAtCursor()

      // Typewriter scroll centering works regardless of preview
      const configCtrl = this.getEditorConfigController()
      if (configCtrl && configCtrl.typewriterModeEnabled) {
        this.maintainTypewriterScroll()
      }
    }
  }

  // Handle CodeMirror selection change events
  onEditorSelectionChange(event) {
    this.updateLinePosition()

    // Show/hide table hint when cursor moves into/out of a table.
    // Skip if a doc change already scheduled a check in this event cycle
    // (typing fires both docChanged and selectionSet in the same CM update).
    if (this.isMarkdownFile() && !this._tableCheckTimeout) {
      this.checkTableAtCursor()
    }
  }

  // Dispatch an input event to trigger all listeners after programmatic value changes
  // Note: CodeMirror handles this automatically, but kept for backward compatibility
  triggerTextareaInput() {
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // Check if cursor is in a markdown table (debounced to avoid performance issues)
  checkTableAtCursor() {
    // Debounce table detection - no need to check on every keystroke
    if (this._tableCheckTimeout) {
      clearTimeout(this._tableCheckTimeout)
    }

    this._tableCheckTimeout = setTimeout(() => {
      this._tableCheckTimeout = null
      this._doCheckTableAtCursor()
    }, 200)
  }

  // Internal: Actually perform the table check
  _doCheckTableAtCursor() {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    const text = codemirrorController.getValue()
    const cursorInfo = codemirrorController.getCursorPosition()
    const tableInfo = findTableAtPosition(text, cursorInfo.offset)

    this._setTableHintVisible(!!tableInfo)
  }

  // Toggle table hint visibility. Consolidated here because Tailwind's
  // .inline-block is declared after .hidden at equal specificity, so
  // both classes must be swapped to actually change display.
  _setTableHintVisible(visible) {
    this.tableHintTarget.classList.toggle("hidden", !visible)
    this.tableHintTarget.classList.toggle("inline-block", visible)
  }

  // === Autosave Event Handlers ===

  onAutosaveConfigSaved() {
    this.reloadConfig()
  }

  onAutosaveOfflineChanged(event) {
    const { offline } = event.detail
    if (offline && this.configSaveTimeout) {
      clearTimeout(this.configSaveTimeout)
      this.configSaveTimeout = null
    }
  }

  // Reload configuration from server and apply changes
  async reloadConfig() {
    const configCtrl = this.getEditorConfigController()
    if (configCtrl) {
      await configCtrl.reload()
      const autosaveCtrl = this.getAutosaveController()
      if (autosaveCtrl) {
        autosaveCtrl.showSaveStatus(window.t("status.config_applied"))
        setTimeout(() => autosaveCtrl.showSaveStatus(""), 2000)
      }
    }
  }

  // === Preview Panel - Delegates to preview_controller ===
  togglePreview() {
    // Only allow preview for markdown files
    if (!this.isMarkdownFile()) {
      this.showTemporaryMessage("Preview is only available for markdown files")
      return
    }

    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.toggle()
    }
  }

  updatePreview() {
    const scrollSync = this.getScrollSyncController()
    if (scrollSync) scrollSync.updatePreview()
  }

  // === Table Editor ===
  openTableEditor() {
    let existingTable = null
    let startPos = 0
    let endPos = 0

    // Check if cursor is in existing table
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      const text = codemirrorController.getValue()
      const cursorPos = codemirrorController.getCursorPosition().offset
      const tableInfo = findTableAtPosition(text, cursorPos)

      if (tableInfo) {
        existingTable = tableInfo.lines.join("\n")
        startPos = tableInfo.startPos
        endPos = tableInfo.endPos
      }
    }

    // Dispatch event for table_editor_controller
    window.dispatchEvent(new CustomEvent("frankmd:open-table-editor", {
      detail: { existingTable, startPos, endPos }
    }))
  }

  // Setup listener for table insertion from table_editor_controller
  setupTableEditorListener() {
    this.boundTableInsertHandler = this.handleTableInsert.bind(this)
    window.addEventListener("frankmd:insert-table", this.boundTableInsertHandler)
  }

  // Handle table insertion from table_editor_controller
  handleTableInsert(event) {
    const { markdown, editMode, startPos, endPos } = event.detail

    if (!markdown) return

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    insertBlockContent(codemirrorController, markdown, { editMode, startPos, endPos })
    codemirrorController.focus()
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // === Image Picker Event Handler ===
  onImageSelected(event) {
    const { markdown } = event.detail
    if (!markdown) return

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    insertImage(codemirrorController, markdown)
    codemirrorController.focus()
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // Open image picker dialog (delegates to image-picker controller)
  openImagePicker() {
    if (this.hasImagePickerOutlet) this.imagePickerOutlet.open()
  }

  // === Editor Customization - Delegates to customize_controller ===
  openCustomize() {
    if (this.hasCustomizeOutlet) {
      const configCtrl = this.getEditorConfigController()
      const font = configCtrl ? configCtrl.currentFont : "cascadia-code"
      const fontSize = configCtrl ? configCtrl.currentFontSize : 14
      this.customizeOutlet.open(font, fontSize)
    }
  }

  // Handle customize:applied event from customize_controller
  onCustomizeApplied(event) {
    const { font, fontSize } = event.detail

    // Save to server config (will trigger reload)
    this.saveConfig({
      editor_font: font,
      editor_font_size: fontSize
    })

    // Apply immediately via config controller
    const configCtrl = this.getEditorConfigController()
    if (configCtrl) {
      configCtrl.fontValue = font
      configCtrl.fontSizeValue = fontSize
    }
  }

  applyEditorSettings() {
    const configCtrl = this.getEditorConfigController()
    if (configCtrl) {
      configCtrl.applyFont()
      configCtrl.applyEditorWidth()
      configCtrl.applyLineNumbers()
    }
  }

  // === Editor Width Adjustment ===

  // Editor width bounds (in characters)
  static MIN_EDITOR_WIDTH = 40
  static MAX_EDITOR_WIDTH = 200
  static EDITOR_WIDTH_STEP = 8 // Change by 8 characters per step

  increaseEditorWidth() {
    const maxWidth = this.constructor.MAX_EDITOR_WIDTH
    const step = this.constructor.EDITOR_WIDTH_STEP
    const configCtrl = this.getEditorConfigController()
    const currentWidth = configCtrl ? configCtrl.editorWidth : 72

    if (currentWidth >= maxWidth) {
      this.showTemporaryMessage(`Maximum width (${maxWidth}ch)`)
      return
    }

    const newWidth = Math.min(currentWidth + step, maxWidth)
    if (configCtrl) configCtrl.editorWidthValue = newWidth
    this.saveConfig({ editor_width: newWidth })
    this.showTemporaryMessage(`Editor width: ${newWidth}ch`)
  }

  decreaseEditorWidth() {
    const minWidth = this.constructor.MIN_EDITOR_WIDTH
    const step = this.constructor.EDITOR_WIDTH_STEP
    const configCtrl = this.getEditorConfigController()
    const currentWidth = configCtrl ? configCtrl.editorWidth : 72

    if (currentWidth <= minWidth) {
      this.showTemporaryMessage(`Minimum width (${minWidth}ch)`)
      return
    }

    const newWidth = Math.max(currentWidth - step, minWidth)
    if (configCtrl) configCtrl.editorWidthValue = newWidth
    this.saveConfig({ editor_width: newWidth })
    this.showTemporaryMessage(`Editor width: ${newWidth}ch`)
  }

  // === Line Numbers - Now handled by CodeMirror ===

  toggleLineNumberMode() {
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      const newMode = codemirrorController.toggleLineNumberMode()
      const configCtrl = this.getEditorConfigController()
      if (configCtrl) configCtrl.lineNumbersValue = newMode
      this.saveConfig({ editor_line_numbers: newMode })
    }
  }


  // === Path Display - Delegates to path_display_controller ===

  updatePathDisplay(path) {
    const pathDisplayController = this.getPathDisplayController()
    if (pathDisplayController) {
      pathDisplayController.update(path)
    }
  }

  // === Save config settings to server (debounced) ===
  saveConfig(settings) {
    // Clear any pending save
    if (this.configSaveTimeout) {
      clearTimeout(this.configSaveTimeout)
    }

    // Debounce saves to avoid excessive API calls
    this.configSaveTimeout = setTimeout(async () => {
      try {
        const response = await patch("/config", {
          body: settings,
          responseKind: "json"
        })

        if (!response.ok) {
          console.warn("Failed to save config:", await response.text)
        } else {
          // Notify other controllers that config file was modified
          window.dispatchEvent(new CustomEvent("frankmd:config-file-modified"))
        }
      } catch (error) {
        console.warn("Failed to save config:", error)
      }
    }, 500)
  }

  // Reload .fed content if it's open in the editor
  async reloadCurrentConfigFile() {
    if (this.currentFile !== ".fed") return

    try {
      const response = await get(`/notes/${encodePath(".fed")}`, { responseKind: "json" })

      if (response.ok) {
        const data = await response.json
        const codemirrorController = this.getCodemirrorController()
        if (codemirrorController) {
          // Save cursor position
          const cursorPos = codemirrorController.getCursorPosition().offset
          // Update content
          codemirrorController.setValue(data.content || "")
          // Restore cursor position (or end of file if content is shorter)
          const newContent = codemirrorController.getValue()
          const newCursorPos = Math.min(cursorPos, newContent.length)
          codemirrorController.setSelection(newCursorPos, newCursorPos)
        }
      }
    } catch (error) {
      console.warn("Failed to reload config file:", error)
    }
  }

  // Listen for config file modifications from any source (theme, settings, etc.)
  setupConfigFileListener() {
    this.boundConfigFileHandler = () => {
      // If .fed is currently open in the editor, reload it
      if (this.currentFile === ".fed") {
        this.reloadCurrentConfigFile()
      }
    }
    window.addEventListener("frankmd:config-file-modified", this.boundConfigFileHandler)
  }

  // === Preview Zoom - Delegates to preview_controller ===
  zoomPreviewIn() {
    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.zoomIn()
    }
  }

  zoomPreviewOut() {
    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.zoomOut()
    }
  }

  applyPreviewZoom() {
    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.applyZoom()
    }
  }

  // === Sidebar/Explorer Toggle ===
  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible
    this.applySidebarVisibility()
  }

  applySidebarVisibility() {
    if (this.hasSidebarTarget) {
      this.sidebarTarget.classList.toggle("hidden", !this.sidebarVisible)
    }
    if (this.hasSidebarToggleTarget) {
      this.sidebarToggleTarget.setAttribute("aria-expanded", this.sidebarVisible.toString())
    }
  }

  // === Typewriter Mode - Delegates to typewriter_controller ===

  initializeTypewriterMode() {
    const typewriterController = this.getTypewriterController()
    if (typewriterController) {
      const configCtrl = this.getEditorConfigController()
      const enabled = configCtrl ? configCtrl.typewriterModeEnabled : false
      typewriterController.setEnabled(enabled)
    }
  }

  toggleTypewriterMode() {
    // Only allow typewriter mode for markdown files
    if (!this.isMarkdownFile()) {
      this.showTemporaryMessage("Typewriter mode is only available for markdown files")
      return
    }

    const typewriterController = this.getTypewriterController()
    if (typewriterController) {
      typewriterController.toggle()
    }
  }

  // Handle typewriter:toggled event
  onTypewriterToggled(event) {
    const { enabled } = event.detail
    this.saveConfig({ typewriter_mode: enabled })

    // Toggle typewriter mode on preview controller
    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.setTypewriterMode(enabled)
    }

    // Typewriter mode: hide sidebar and preview for distraction-free writing
    // Editor is centered on screen with content width control
    if (enabled) {
      // Hide explorer
      this.sidebarVisible = false
      this.applySidebarVisibility()

      // Hide preview (keep editor only for focused writing)
      if (previewController && previewController.isVisible) {
        previewController.hide()
      }

      // Add typewriter body class for full-width editor centering
      document.body.classList.add("typewriter-mode")
    } else {
      // Show explorer
      this.sidebarVisible = true
      this.applySidebarVisibility()

      // Remove typewriter body class
      document.body.classList.remove("typewriter-mode")
    }
  }

  maintainTypewriterScroll() {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    // Center cursor in editor (works regardless of preview)
    codemirrorController.maintainTypewriterScroll()

    // Sync preview if visible
    const previewController = this.getPreviewController()
    if (previewController && previewController.isVisible) {
      const syncData = codemirrorController.getTypewriterSyncData()
      if (syncData) {
        previewController.syncToTypewriter(syncData.currentLine, syncData.totalLines)
      }
    }
  }

  // Show a temporary message to the user (auto-dismisses)
  showTemporaryMessage(message, duration = 2000) {
    // Remove any existing message
    const existing = document.querySelector(".temporary-message")
    if (existing) existing.remove()

    const el = document.createElement("div")
    el.className = "temporary-message fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] px-4 py-2 rounded-lg shadow-lg border border-[var(--theme-border)] text-sm z-50"
    el.textContent = message
    document.body.appendChild(el)

    setTimeout(() => el.remove(), duration)
  }

  // === File Finder (Ctrl+P) - Delegates to file_finder_controller ===
  openFileFinder() {
    if (this.hasFileFinderOutlet) {
      this.fileFinderOutlet.open(this.getFilesFromTree())
    }
  }

  // Build flat list of files from DOM tree for file finder, sorted newest-first
  getFilesFromTree() {
    const fileElements = this.fileTreeTarget.querySelectorAll('[data-type="file"]')
    return Array.from(fileElements).map(el => ({
      path: el.dataset.path,
      name: el.dataset.path.split("/").pop().replace(/\.md$/, ""),
      type: "file",
      file_type: el.dataset.fileType || "markdown",
      mtime: parseInt(el.dataset.mtime, 10) || 0
    })).sort((a, b) => b.mtime - a.mtime)
  }

  // Handle file selected event from file_finder_controller
  onFileSelected(event) {
    const { path } = event.detail
    this.openFileAndRevealInTree(path)
  }

  async openFileAndRevealInTree(path) {
    // Expand all parent folders in the tree
    const parts = path.split("/")
    let currentPath = ""
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]
      this.expandedFolders.add(currentPath)
    }

    // Show sidebar if hidden
    if (!this.sidebarVisible) {
      this.sidebarVisible = true
      this.applySidebarVisibility()
    }

    // Load the file
    await this.loadFile(path)
  }

  openFindReplace(options = {}) {
    if (this.hasFindReplaceOutlet) {
      const codemirrorController = this.getCodemirrorController()
      const selection = codemirrorController ? codemirrorController.getSelection().text : ""
      this.findReplaceOutlet.open({
        textarea: this.createTextareaAdapter(),
        tab: options.tab,
        query: selection || undefined
      })
    }
  }

  // Create an adapter that makes CodeMirror look like a textarea for find/replace
  createTextareaAdapter() {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) {
      return this.hasTextareaTarget ? this.textareaTarget : null
    }
    return createTextareaAdapter(codemirrorController)
  }

  onFindReplaceJump(event) {
    const { start, end } = event.detail
    const codemirrorController = this.getCodemirrorController()

    if (codemirrorController) {
      codemirrorController.focus()
      codemirrorController.setSelection(start, end)
      codemirrorController.scrollToPosition(start)
    }
  }

  onFindReplaceReplace(event) {
    const { start, end, replacement } = event.detail
    const codemirrorController = this.getCodemirrorController()

    if (codemirrorController) {
      codemirrorController.replaceRange(replacement, start, end)
      const newPosition = start + replacement.length
      codemirrorController.setSelection(newPosition, newPosition)
      codemirrorController.scrollToPosition(newPosition)
      this.onEditorChange({ detail: { docChanged: true } })
    }
  }

  onFindReplaceReplaceAll(event) {
    const { updatedText } = event.detail
    if (typeof updatedText !== "string") return

    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.setValue(updatedText)
      codemirrorController.setSelection(0, 0)
      codemirrorController.scrollTo(0)
      this.onEditorChange({ detail: { docChanged: true } })
    }
  }

  openJumpToLine() {
    if (this.hasJumpToLineOutlet) {
      this.jumpToLineOutlet.open(this.createTextareaAdapter())
    }
  }

  onJumpToLine(event) {
    const { lineNumber } = event.detail
    if (!lineNumber) return
    this.jumpToLine(lineNumber)
  }

  // Content Search (Ctrl+Shift+F) - Delegates to content_search_controller
  openContentSearch() {
    if (this.hasContentSearchOutlet) this.contentSearchOutlet.open()
  }

  // Handle search result selected event from content_search_controller
  async onSearchResultSelected(event) {
    const { path, lineNumber } = event.detail
    await this.openFileAndRevealInTree(path)
    this.jumpToLine(lineNumber)
  }

  // Handle wikilink click from preview panel
  async openWikilink(event) {
    event.preventDefault()
    const target = event.currentTarget.dataset.wikilinkPath
    if (!target) return

    // Try to resolve the wikilink target to an actual file path
    const path = await this.resolveWikilinkPath(target)
    if (path) {
      await this.openFileAndRevealInTree(path)
    }
  }

  // Resolve a wikilink target (e.g. "Note Name" or "folder/Note") to a file path
  resolveWikilinkPath(target) {
    // Normalize: add .md if not present
    const pathWithExt = target.endsWith(".md") ? target : `${target}.md`

    // Get all files from the DOM tree
    const files = this.getFilesFromTree()

    // Try exact path match
    const exactMatch = files.find(f => f.path === pathWithExt)
    if (exactMatch) return exactMatch.path

    // Try name-only match (for [[Note Name]] without folder)
    const targetName = target.split("/").pop().toLowerCase()
    const nameMatch = files.find(f => f.name.toLowerCase() === targetName)
    if (nameMatch) return nameMatch.path

    // No match found — return the path so loadFile can handle it (create or 404)
    return pathWithExt
  }

  jumpToLine(lineNumber) {
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.jumpToLine(lineNumber)
    }
  }

  scrollTextareaToPosition(position) {
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.scrollToPosition(position)
    }
  }

  // === Help Dialog - delegates to help controller ===
  openHelp() {
    const helpController = this.getHelpController()
    if (helpController) {
      helpController.openHelp()
    }
  }

  // === Log Viewer - Delegates to log_viewer_controller ===
  openLogViewer() {
    if (this.hasLogViewerOutlet) this.logViewerOutlet.open()
  }

  // === Code Snippet Editor - Delegates to code_dialog_controller ===
  openCodeEditor() {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController || !this.hasCodeDialogOutlet) return

    const text = codemirrorController.getValue()
    const cursorPos = codemirrorController.getCursorPosition().offset
    const codeBlock = findCodeBlockAtPosition(text, cursorPos)

    if (codeBlock) {
      this.codeDialogOutlet.open({
        language: codeBlock.language || "",
        content: codeBlock.content || "",
        editMode: true,
        startPos: codeBlock.startPos,
        endPos: codeBlock.endPos
      })
    } else {
      this.codeDialogOutlet.open()
    }
  }

  // Handle code insert event from code_dialog_controller
  onCodeInsert(event) {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    const { codeBlock, language, editMode, startPos, endPos } = event.detail

    insertCodeBlock(codemirrorController, codeBlock, language, { editMode, startPos, endPos })
    codemirrorController.focus()
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // About Dialog - delegates to help controller
  openAboutDialog() {
    const helpController = this.getHelpController()
    if (helpController) {
      helpController.openAbout()
    }
  }

  // Video Dialog - delegates to video-dialog controller
  openVideoDialog() {
    if (this.hasVideoDialogOutlet) this.videoDialogOutlet.open()
  }

  // Video Embed Event Handler - receives events from video_dialog_controller
  insertVideoEmbed(event) {
    const { embedCode } = event.detail
    if (!embedCode) return

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    insertVideoEmbed(codemirrorController, embedCode)
    codemirrorController.focus()
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // === AI Grammar Check Methods - Delegates to ai_grammar_controller ===

  async openAiDialog() {
    if (!this.currentFile) {
      alert(window.t("errors.no_file_open"))
      return
    }

    const codemirrorController = this.getCodemirrorController()
    const text = codemirrorController ? codemirrorController.getValue() : ""
    if (!text.trim()) {
      alert(window.t("errors.no_text_to_check"))
      return
    }

    // Save file first if there are pending changes (server reads from disk)
    const autosaveForAi = this.getAutosaveController()
    if (autosaveForAi && autosaveForAi.saveTimeout) {
      await autosaveForAi.saveNow()
    }

    if (this.hasAiGrammarOutlet) this.aiGrammarOutlet.open(this.currentFile)
  }

  // Handle AI processing started event - disable editor and show button loading state
  onAiProcessingStarted() {
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.setReadOnly(true)
    }

    if (this.hasAiButtonTarget) {
      this.aiButtonOriginalContent = this.aiButtonTarget.innerHTML
      this.aiButtonTarget.innerHTML = `
        <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>${window.t("status.processing")}</span>
      `
      this.aiButtonTarget.disabled = true
    }
  }

  // Handle AI processing ended event - re-enable editor and restore button
  onAiProcessingEnded() {
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.setReadOnly(false)
    }

    if (this.hasAiButtonTarget && this.aiButtonOriginalContent) {
      this.aiButtonTarget.innerHTML = this.aiButtonOriginalContent
      this.aiButtonTarget.disabled = false
    }
  }

  // Handle AI correction accepted event - update editor with corrected text
  onAiAccepted(event) {
    const { correctedText } = event.detail
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.setValue(correctedText)
      this.onEditorChange({ detail: { docChanged: true } })
    }
  }

  // Handle preview zoom changed event - save to config
  onPreviewZoomChanged(event) {
    const { zoom } = event.detail
    const configCtrl = this.getEditorConfigController()
    if (configCtrl) configCtrl.previewZoomValue = zoom
    this.saveConfig({ preview_zoom: zoom })
  }

  // Handle preview toggled event
  onPreviewToggled(event) {
    const { visible } = event.detail
    if (visible) {
      // Ensure editor sync is setup (may not have been ready at connect time)
      const previewController = this.getPreviewController()
      if (previewController && this.hasTextareaTarget) {
        previewController.setupEditorSync(this.textareaTarget)
      }
    }
  }

  // === File Operations Event Handlers ===

  async onFileCreated(event) {
    const { path } = event.detail

    // Expand parent folders
    const pathParts = path.split("/")
    let expandPath = ""
    for (let i = 0; i < pathParts.length - 1; i++) {
      expandPath = expandPath ? `${expandPath}/${pathParts[i]}` : pathParts[i]
      this.expandedFolders.add(expandPath)
    }

    // Tree is already updated by Turbo Stream
    await this.loadFile(path)
  }

  onFolderCreated(event) {
    const { path } = event.detail
    this.expandedFolders.add(path)
    // Tree is already updated by Turbo Stream
  }

  onFileRenamed(event) {
    const { oldPath, newPath, type } = event.detail

    if (type === "folder") {
      // Preserve expand/collapse state for renamed folder and its descendants.
      this.expandedFolders = new Set(
        Array.from(this.expandedFolders, (path) => {
          if (path === oldPath || path.startsWith(oldPath + "/")) {
            return `${newPath}${path.slice(oldPath.length)}`
          }
          return path
        })
      )
    }

    // For folder renames, update current file path if it's inside the renamed folder
    if (type === "folder" && this.currentFile?.startsWith(oldPath + "/")) {
      this.currentFile = `${newPath}${this.currentFile.slice(oldPath.length)}`
      this.updatePathDisplay(this.currentFile.replace(/\.md$/, ""))
      this.updateUrl(this.currentFile)
    }

    // Update current file if it was the renamed file
    if (this.currentFile === oldPath) {
      this.currentFile = newPath
      this.updatePathDisplay(newPath.replace(/\.md$/, ""))
      this.updateUrl(newPath)
    }

    // Tree is already updated by Turbo Stream
  }

  onFileDeleted(event) {
    const { path } = event.detail

    // Clear editor if deleted file was currently open
    if (this.currentFile === path) {
      this.currentFile = null
      this.updatePathDisplay(null)
      this.editorPlaceholderTarget.classList.remove("hidden")
      this.editorTarget.classList.add("hidden")
      this.hideStatsPanel()
    }

    // Tree is already updated by Turbo Stream
  }

  // File Operations - delegate to file-operations controller
  newNote() {
    const fileOps = this.getFileOperationsController()
    if (fileOps) fileOps.newNote()
  }

  newFolder() {
    const fileOps = this.getFileOperationsController()
    if (fileOps) fileOps.newFolder()
  }

  showContextMenu(event) {
    const fileOps = this.getFileOperationsController()
    if (fileOps) fileOps.showContextMenu(event)
  }

  setupDialogClickOutside() {
    // Close dialog when clicking on backdrop (outside the dialog content)
    if (this.hasHelpDialogTarget) {
      this.helpDialogTarget.addEventListener("click", (event) => {
        if (event.target === this.helpDialogTarget) {
          this.helpDialogTarget.close()
        }
      })
    }
  }

  async refreshTree() {
    try {
      const expanded = [...this.expandedFolders].join(",")
      const selected = this.currentFile || ""
      const response = await get(`/notes/tree?expanded=${encodeURIComponent(expanded)}&selected=${encodeURIComponent(selected)}`)
      if (response.ok) {
        const html = await response.text
        this.fileTreeTarget.innerHTML = html
      }
    } catch (error) {
      console.error("Error refreshing tree:", error)
    }
  }

  // === Keyboard Shortcuts ===
  setupKeyboardShortcuts() {
    // Merge default shortcuts with user customizations (future: load from config)
    const shortcuts = mergeShortcuts(DEFAULT_SHORTCUTS, this.userShortcuts)

    this.boundKeydownHandler = createKeyHandler(shortcuts, (action) => {
      this.executeShortcutAction(action)
    })

    document.addEventListener("keydown", this.boundKeydownHandler)
  }

  // Execute an action triggered by a keyboard shortcut
  executeShortcutAction(action) {
    const actions = {
      newNote: () => this.getFileOperationsController()?.newNote(),
      save: () => this.getAutosaveController()?.saveNow(),
      // Note: bold and italic are handled by CodeMirror's keymap (codemirror_extensions.js)
      togglePreview: () => this.togglePreview(),
      findInFile: () => this.openFindReplace(),
      findReplace: () => this.openFindReplace({ tab: "replace" }),
      jumpToLine: () => this.openJumpToLine(),
      lineNumbers: () => this.toggleLineNumberMode(),
      contentSearch: () => this.openContentSearch(),
      fileFinder: () => this.openFileFinder(),
      toggleSidebar: () => this.toggleSidebar(),
      typewriterMode: () => this.toggleTypewriterMode(),
      textFormat: () => this.openTextFormatMenu(),
      emojiPicker: () => this.openEmojiPicker(),
      increaseWidth: () => this.increaseEditorWidth(),
      decreaseWidth: () => this.decreaseEditorWidth(),
      logViewer: () => this.openLogViewer(),
      help: () => this.openHelp(),
      closeDialogs: () => this.closeAllDialogs()
    }

    const handler = actions[action]
    if (handler) {
      handler()
    }
  }

  // Close all open dialogs and menus
  closeAllDialogs() {
    // Close context menu
    if (this.hasContextMenuTarget) {
      this.contextMenuTarget.classList.add("hidden")
    }

    // Close help dialog
    if (this.hasHelpDialogTarget && this.helpDialogTarget.open) {
      this.helpDialogTarget.close()
    }
  }

  // === Editor Indentation ===
  // Note: Tab/Shift+Tab indentation is now handled by CodeMirror's indentWithTab keymap

  // Get the current indent string
  getIndentString() {
    const configCtrl = this.getEditorConfigController()
    return (configCtrl ? configCtrl.editorIndent : 2) || "  "
  }

  // === Text Format Menu ===

  // Open text format menu via Ctrl+M
  openTextFormatMenu() {
    if (!this.isMarkdownFile()) return
    const cm = this.getCodemirrorController()
    if (!cm) return
    const textFormatController = this.getTextFormatController()
    if (textFormatController) textFormatController.openFromKeyboard(cm)
  }

  onTextareaContextMenu(event) {
    if (!this.isMarkdownFile()) return
    const cm = this.getCodemirrorController()
    const textFormatController = this.getTextFormatController()
    if (textFormatController) textFormatController.onContextMenu(event, cm, true)
  }

  onTextFormatContentChanged() {
    this.getAutosaveController()?.scheduleAutoSave()
    this.updatePreview()
  }

  onTextFormatClosed() {
    const cm = this.getCodemirrorController()
    if (cm) cm.focus()
  }

  applyInlineFormat(formatId) {
    const cm = this.getCodemirrorController()
    if (!cm) return
    const textFormatController = this.getTextFormatController()
    if (!textFormatController) return
    if (textFormatController.applyFormatById(formatId, this.createTextareaAdapter())) {
      this.getAutosaveController()?.scheduleAutoSave()
      this.updatePreview()
    }
  }

  // === Emoji Picker ===

  // Open emoji picker dialog
  openEmojiPicker() {
    if (!this.hasTextareaTarget) return
    if (!this.isMarkdownFile()) return

    const emojiPickerController = this.getEmojiPickerController()
    if (emojiPickerController) {
      emojiPickerController.open()
    }
  }

  // Handle emoji/emoticon selected event
  onEmojiSelected(event) {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    const { text: insertText } = event.detail
    if (!insertText) return

    insertInlineContent(codemirrorController, insertText)
    codemirrorController.focus()
    this.getAutosaveController()?.scheduleAutoSave()
    this.updatePreview()
  }

  // === Utilities ===

  // Position a dialog near a specific point (for explorer dialogs)
  positionDialogNearPoint(dialog, x, y) {
    dialog.classList.add("positioned")

    // Use showModal first to get dimensions
    dialog.showModal()

    // Get dialog dimensions
    const rect = dialog.getBoundingClientRect()
    const padding = 10

    // Calculate position, keeping dialog on screen
    let left = x
    let top = y

    // Adjust if dialog would go off right edge
    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding
    }

    // Adjust if dialog would go off bottom edge
    if (top + rect.height > window.innerHeight - padding) {
      top = window.innerHeight - rect.height - padding
    }

    // Ensure dialog stays on screen (left/top)
    left = Math.max(padding, left)
    top = Math.max(padding, top)

    dialog.style.left = `${left}px`
    dialog.style.top = `${top}px`
  }

  // Show dialog centered (default behavior)
  showDialogCentered(dialog) {
    dialog.classList.remove("positioned")
    dialog.style.left = ""
    dialog.style.top = ""
    dialog.showModal()
  }

  // Clean up any object URLs created for local folder images
  cleanupLocalFolderImages() {
    // Implementation depends on image picker state
    // This is called on disconnect to prevent memory leaks
  }

  // === Document Stats - delegates to stats-panel controller ===

  showStatsPanel() {
    const statsController = this.getStatsPanelController()
    if (statsController) {
      statsController.show()
    }
  }

  hideStatsPanel() {
    const statsController = this.getStatsPanelController()
    if (statsController) {
      statsController.hide()
    }
  }

  scheduleStatsUpdate() {
    const statsController = this.getStatsPanelController()
    const codemirrorController = this.getCodemirrorController()
    if (statsController && codemirrorController) {
      statsController.scheduleUpdate(codemirrorController.getValue(), codemirrorController.getCursorInfo())
    }
  }

  updateStats() {
    const statsController = this.getStatsPanelController()
    const codemirrorController = this.getCodemirrorController()
    if (statsController && codemirrorController) {
      statsController.update(codemirrorController.getValue(), codemirrorController.getCursorInfo())
    }
  }

  updateLinePosition() {
    const statsController = this.getStatsPanelController()
    const codemirrorController = this.getCodemirrorController()
    if (statsController && codemirrorController) {
      statsController.updateLinePosition(codemirrorController.getCursorInfo())
    }
  }

  getCursorInfo() {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return null

    return codemirrorController.getCursorInfo()
  }
}
