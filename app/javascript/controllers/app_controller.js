import { Controller } from "@hotwired/stimulus"
import { destroy, get, patch, post } from "@rails/request.js"
import { marked } from "marked"
import { escapeHtml } from "lib/text_utils"
import { nextNoteIndex } from "lib/vim_mode"
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
import { appAlert } from "lib/app_prompt"
import { setSlashCommandsEnabledProvider } from "lib/codemirror_slash_commands"

function pathMatchesScope(candidatePath, path, type) {
  if (typeof candidatePath !== "string") return false
  return candidatePath === path || (type === "folder" && candidatePath.startsWith(`${path}/`))
}

function remapScopedPath(candidatePath, oldPath, newPath, type) {
  return pathMatchesScope(candidatePath, oldPath, type)
    ? `${newPath}${candidatePath.slice(oldPath.length)}`
    : candidatePath
}

function relativeMediaPath(notePath, mediaPath) {
  if (typeof notePath !== "string" || typeof mediaPath !== "string") return null
  const noteSegments = notePath.split("/")
  const mediaSegments = mediaPath.split("/")
  if (noteSegments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) return null
  if (mediaSegments.length < 2 || mediaSegments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) return null
  if (mediaSegments[0] !== "images" && mediaSegments[0] !== "videos") return null

  const parentSegments = noteSegments.slice(0, -1)
  let sharedSegments = 0
  while (sharedSegments < parentSegments.length &&
    sharedSegments < mediaSegments.length &&
    parentSegments[sharedSegments] === mediaSegments[sharedSegments]) {
    sharedSegments += 1
  }

  return [
    ...Array(parentSegments.length - sharedSegments).fill(".."),
    ...mediaSegments.slice(sharedSegments)
  ].join("/")
}

function encodeRelativeMediaPath(path) {
  return path.split("/").map((segment) => encodeURIComponent(segment)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  ).join("/")
}

function escapeMarkdownAlt(value) {
  const specialCharacters = new Set(["\\", "[", "]"])
  return String(value).replace(/[\r\n]+/g, " ").split("").map((character) =>
    specialCharacters.has(character) ? `\\${character}` : character
  ).join("")
}

const VIDEO_MIME_TYPES = {
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm"
}

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
    "undoCreatedNoteDialog",
    "undoCreatedNoteMessage",
    "tableHint",
    "sidebar",
    "sidebarToggle",
    "vimToggle",
    "vimStatus",
    "scrollSyncToggle",
    "typewriterToggle",
    "aiButton",
    "editorWrapper",
    "editorBody"
  ]

  static outlets = [
    "codemirror", "preview", "typewriter", "stats-panel",
    "path-display", "text-format", "help", "file-operations",
    "emoji-picker", "offline-backup", "recovery-diff",
    "autosave", "scroll-sync", "settings",
    "image-picker", "file-finder", "find-replace", "jump-to-line",
    "content-search", "ai-grammar", "video-dialog", "log-viewer",
    "code-dialog", "drag-drop"
  ]

  static values = {
    initialPath: String,
    initialNote: Object
  }

  connect() {
    // Stimulus starts outlet observers before calling connect(), so an already
    // connected CodeMirror outlet can notify us before this controller is ready.
    this._initializationReady = false
    this.installUnauthorizedRedirect()
    this.currentFile = null
    this.currentFileType = null  // "markdown", "config", or null
    this.explorerSelection = new Map()
    this.explorerSelectionAnchor = null
    this.explorerActiveKey = null
    this._settingExplorerFocus = false
    this._explorerPointerDownItem = null
    // Session-only creation boundaries used by file-scoped undo.
    this.createdNoteBoundaries = new Map()
    this.expandedFolders = new Set()
    this._navigationGeneration = 0
    this._treeRevision = 0
    this._treeRefreshGeneration = 0
    this._fileNotFoundTimeout = null
    this.pendingSlashInsertionRange = null
    this.initializeExplorerSelection()
    this.boundExplorerPointerUp = () => { this._explorerPointerDownItem = null }
    document.addEventListener("pointerup", this.boundExplorerPointerUp, true)
    document.addEventListener("pointercancel", this.boundExplorerPointerUp, true)

    // Sidebar/Explorer visibility - always start visible
    // (don't persist closed state across sessions)
    this.sidebarVisible = true

    // Workspace panes (Library, Settings) both start hidden; the panels boot
    // hidden in the DOM so their controllers stay connected.
    this.libraryVisible = false
    this.settingsVisible = false

    // Document view mode: "split" (editor + preview side by side) or
    // "single" (one full-width pane at a time). Boot default until the
    // settings controller pushes the persisted value (initializeViewMode).
    this.viewMode = "split"

    // Track pending config saves to debounce
    this.configSaveTimeout = null

    // Debounce timers for performance
    this._tableCheckTimeout = null

    this.setupKeyboardShortcuts()
    this.setupDialogClickOutside()
    this.boundTreeStreamRenderHandler = this.invalidateTreeRefreshesForStream.bind(this)
    document.addEventListener("turbo:before-stream-render", this.boundTreeStreamRenderHandler)
    this.applySidebarVisibility()
    this.setupConfigFileListener()
    this.setupTableEditorListener()
    this.setupSlashCommandListener()

    // Provide file list to wikilink autocomplete
    setWikilinkFileProvider(() => this.getFilesFromTree())
    // The editor is reused for Markdown notes and .fed, so gate commands on
    // the currently active file type instead of its initial editor setup.
    setSlashCommandsEnabledProvider(() => this.isMarkdownFile())

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
    this._initializationReady = true
    this.initializeViewMode()
    this.initializeTypewriterMode()
    this._initialFileTimeout = setTimeout(() => this._completeInitialLoad(), 50)
  }

  // Called by Stimulus when the codemirror outlet controller connects
  codemirrorOutletConnected() {
    this._completeInitialLoad()
    if (this._initializationReady) this.initializeTypewriterMode()
  }

  settingsOutletConnected() {
    if (this._initializationReady) this.initializeTypewriterMode()
  }

  typewriterOutletConnected() {
    if (this._initializationReady) this.initializeTypewriterMode()
  }

  previewOutletConnected() {
    if (this._initializationReady) this.initializeTypewriterMode()
  }

  scrollSyncOutletConnected() {
    if (this._initializationReady) this.initializeTypewriterMode()
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
    if (!this._initializationReady || this._initialFileHandled) return
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
    this._initializationReady = false
    if (window.fetch === this.unauthorizedFetch) window.fetch = this.originalFetch

    // Clear all timeouts
    if (this.configSaveTimeout) clearTimeout(this.configSaveTimeout)
    if (this._tableCheckTimeout) clearTimeout(this._tableCheckTimeout)
    if (this._initialFileTimeout) clearTimeout(this._initialFileTimeout)
    if (this._fileNotFoundTimeout) clearTimeout(this._fileNotFoundTimeout)

    // Remove window/document event listeners
    if (this.boundPopstateHandler) {
      window.removeEventListener("popstate", this.boundPopstateHandler)
    }
    if (this.boundTableInsertHandler) {
      window.removeEventListener("frankmd:insert-table", this.boundTableInsertHandler)
    }
    if (this.boundSlashCommandOpenHandler) {
      window.removeEventListener("frankmd:open-slash-command", this.boundSlashCommandOpenHandler)
    }
    if (this.boundConfigFileHandler) {
      window.removeEventListener("frankmd:config-file-modified", this.boundConfigFileHandler)
    }
    if (this.boundKeydownHandler) {
      document.removeEventListener("keydown", this.boundKeydownHandler)
    }
    if (this.boundWorkspaceEscapeHandler) {
      document.removeEventListener("keydown", this.boundWorkspaceEscapeHandler, true)
    }
    if (this.boundRootRedoHandler) {
      document.removeEventListener("keydown", this.boundRootRedoHandler)
    }
    if (this.boundTreeStreamRenderHandler) {
      document.removeEventListener("turbo:before-stream-render", this.boundTreeStreamRenderHandler)
    }
    if (this.boundExplorerPointerUp) {
      document.removeEventListener("pointerup", this.boundExplorerPointerUp, true)
      document.removeEventListener("pointercancel", this.boundExplorerPointerUp, true)
    }

    // Clean up object URLs to prevent memory leaks
    this.cleanupLocalFolderImages()

    // Abort any pending AI requests
    if (this.aiImageAbortController) {
      this.aiImageAbortController.abort()
    }
  }

  installUnauthorizedRedirect() {
    this.originalFetch = window.fetch.bind(window)
    this.unauthorizedFetch = async (...args) => {
      const response = await this.originalFetch(...args)
      if (response.status === 401 && !this.redirectingToLogin) {
        this.redirectingToLogin = true
        window.location.assign("/login")
      }
      return response
    }
    window.fetch = this.unauthorizedFetch
  }

  // === Controller Getters (via Stimulus Outlets) ===

  // Outlet getters use the plural form (*Outlets) which returns only connected controllers
  // as an array (never throws). Returns null when the outlet controller isn't connected yet.
  getPreviewController() { return this.previewOutlets?.[0] ?? null }
  getTypewriterController() { return this.typewriterOutlets?.[0] ?? null }
  getCodemirrorController() { return this.codemirrorOutlets?.[0] ?? null }
  getPathDisplayController() { return this.pathDisplayOutlets[0] ?? null }
  getTextFormatController() { return this.textFormatOutlets[0] ?? null }
  getHelpController() { return this.helpOutlets[0] ?? null }
  getStatsPanelController() { return this.statsPanelOutlets[0] ?? null }
  getFileOperationsController() { return this.fileOperationsOutlets[0] ?? null }
  getEmojiPickerController() { return this.emojiPickerOutlets[0] ?? null }
  getOfflineBackupController() { return this.offlineBackupOutlets[0] ?? null }
  getRecoveryDiffController() { return this.recoveryDiffOutlets[0] ?? null }
  getAutosaveController() { return this.autosaveOutlets[0] ?? null }
  getScrollSyncController() { return this.scrollSyncOutlets?.[0] ?? null }
  getSettingsController() { return this.settingsOutlets?.[0] ?? null }

  // === URL Management for Bookmarkable URLs ===

  handleInitialFile() {
    const generation = this.beginNavigation()
    // Check if server provided initial note data (from URL like /notes/path/to/file.md)
    const initialNote = this.hasInitialNoteValue ? this.initialNoteValue : null
    if (initialNote && Object.keys(initialNote).length > 0) {
      const { path, content, revision, exists, error } = initialNote

      if (exists && content !== null) {
        // Initial server data follows the same guarded transition as a fetched file.
        this.applyLoadedFile(path, content, revision, generation, { updateHistory: false })
        return
      }

      if (!exists) {
        this.applyFileNotFound(path, error || window.t("errors.file_not_found"), generation, {
          updateHistory: true,
          replaceHistory: true
        })
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

  beginNavigation() {
    this._navigationGeneration = (this._navigationGeneration || 0) + 1
    return this._navigationGeneration
  }

  isCurrentNavigation(generation) {
    return generation === this._navigationGeneration
  }

  restoreCurrentFileUrl() {
    const expectedUrl = this.currentFile ? `/notes/${encodePath(this.currentFile)}` : "/"
    if (window.location.pathname !== expectedUrl) {
      this.updateUrl(this.currentFile, { replace: true })
    }
  }

  prepareEditorTransition(generation) {
    if (!this.isCurrentNavigation(generation)) return false

    const autosave = this.getAutosaveController()
    if (this.currentFile && (!autosave || typeof autosave.prepareForTransition !== "function")) {
      this.restoreCurrentFileUrl()
      return false
    }
    const result = autosave?.prepareForTransition ? autosave.prepareForTransition() : { ok: true }
    if (!result.ok) {
      if (this.isCurrentNavigation(generation)) this.restoreCurrentFileUrl()
      return false
    }

    return this.isCurrentNavigation(generation)
  }

  applyLoadedFile(path, content, revision, generation, { updateHistory = true } = {}) {
    if (!this.prepareEditorTransition(generation)) return false
    if (!this.isCurrentNavigation(generation)) return false

    this.showEditorWorkspace()
    this.currentFile = path
    const fileType = this.getFileType(path)
    this.selectExplorerPath(path, "file")
    const displayPath = fileType === "markdown" ? path.replace(/\.md$/, "") : path
    this.updatePathDisplay(displayPath)
    this.expandParentFolders(path)
    this.showEditor(content, fileType, revision)
    this.refreshTree(generation)

    if (updateHistory && this.isCurrentNavigation(generation)) this.updateUrl(path)
    return true
  }

  applyFileNotFound(path, message, generation, { updateHistory = false, replaceHistory = false } = {}) {
    if (!this.prepareEditorTransition(generation)) return false
    if (!this.isCurrentNavigation(generation)) return false

    this.showEditorWorkspace()
    this.clearPendingSlashInsertion()
    this.currentFile = null
    this.currentFileType = null
    this.getAutosaveController()?.clearFile?.()
    this.showFileNotFoundMessage(path, message, generation)
    this.refreshTree(generation)
    if (updateHistory && this.isCurrentNavigation(generation)) {
      this.updateUrl(null, { replace: replaceHistory })
    }
    return true
  }

  clearEditor(generation) {
    if (!this.prepareEditorTransition(generation)) return false
    if (!this.isCurrentNavigation(generation)) return false

    this.showEditorWorkspace()
    this.clearPendingSlashInsertion()
    this.currentFile = null
    this.currentFileType = null
    this.getAutosaveController()?.clearFile?.()
    this.updatePathDisplay(null)
    this.textareaTarget.disabled = false
    this.editorPlaceholderTarget.classList.remove("hidden")
    this.editorTarget.classList.add("hidden")
    this.editorToolbarTarget.classList.add("hidden")
    this.editorToolbarTarget.classList.remove("flex")
    this.hideStatsPanel()
    this.refreshTree(generation)
    return true
  }

  setupHistoryHandling() {
    this.boundPopstateHandler = async (event) => {
      const generation = this.beginNavigation()
      const path = event.state?.file || this.getFilePathFromUrl()

      if (path) {
        await this.loadFile(path, { updateHistory: false, generation })
      } else {
        // No file - preserve the outgoing draft before showing the placeholder.
        this.clearEditor(generation)
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

  showFileNotFoundMessage(path, message, generation = this._navigationGeneration) {
    if (!this.isCurrentNavigation(generation)) return
    if (this._fileNotFoundTimeout) clearTimeout(this._fileNotFoundTimeout)

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
    this._fileNotFoundTimeout = setTimeout(() => {
      this._fileNotFoundTimeout = null
      if (!this.isCurrentNavigation(generation)) return
      this.textareaTarget.disabled = false
      this.updatePathDisplay(null)
      this.editorPlaceholderTarget.classList.remove("hidden")
      this.editorTarget.classList.add("hidden")
      this.hideStatsPanel()
    }, 5000)
  }

  toggleFolder(event) {
    this.selectExplorerItem(event.currentTarget, event)
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

    this.invalidateTreeRefreshes()
  }

  // === Drag and Drop Event Handler ===
  // Handle item moved event from drag-drop controller
  onItemMoved(event) {
    const { oldPath, newPath, type } = event.detail
    this.invalidateTreeRefreshes()
    this.remapSessionNotePaths(oldPath, newPath, type)
    this.remapExplorerSelection(oldPath, newPath, type)

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

    this.getAutosaveController()?.renameFile(oldPath, newPath, type)

    // Tree is already updated by Turbo Stream
  }

  // === File Selection and Editor ===
  initializeExplorerSelection() {
    if (!this.hasFileTreeTarget) return
    const openFile = this.fileTreeTarget.querySelector('.tree-item.selected[data-type="file"]')
    if (openFile) this.selectExplorerItem(openFile, {}, { focus: false })
  }

  explorerItemKey(item) {
    const type = item?.dataset?.type || item?.type
    const path = item?.dataset?.path || item?.path
    return type && path ? JSON.stringify([type, path]) : null
  }

  selectExplorerPath(path, type) {
    const item = { path, type }
    const key = this.explorerItemKey(item)
    if (!key) return

    this.explorerSelection = new Map([[key, item]])
    this.explorerSelectionAnchor = key
    this.explorerActiveKey = key
    if (this.fileTreeTarget?.querySelectorAll) this.syncExplorerSelection()
  }

  getSelectedExplorerItems() {
    if (!this.fileTreeTarget) return []
    const selected = this.explorerSelection || new Map()
    return Array.from(this.fileTreeTarget.querySelectorAll(".tree-item"))
      .filter((item) => selected.has(this.explorerItemKey(item)))
      .map((item) => {
        const value = { path: item.dataset.path, type: item.dataset.type }
        if (item.dataset.fileType) value.fileType = item.dataset.fileType
        return value
      })
  }

  syncExplorerSelection({ pruneMissing = false } = {}) {
    if (!this.fileTreeTarget) return
    const rows = Array.from(this.fileTreeTarget.querySelectorAll(".tree-item"))
    const availableKeys = new Set(rows.map((item) => this.explorerItemKey(item)))
    if (pruneMissing && this.explorerSelection) {
      for (const key of this.explorerSelection.keys()) {
        if (!availableKeys.has(key)) this.explorerSelection.delete(key)
      }
      if (this.explorerSelectionAnchor && !availableKeys.has(this.explorerSelectionAnchor)) {
        this.explorerSelectionAnchor = null
      }
    }
    if (!this.explorerSelection?.has(this.explorerActiveKey)) {
      this.explorerActiveKey = Array.from(this.explorerSelection?.keys() || []).pop() || null
    }
    rows.forEach((item) => {
      const key = this.explorerItemKey(item)
      const selected = this.explorerSelection?.has(key) || false
      item.classList.toggle("explorer-selected", selected)
      item.classList.toggle("explorer-active", selected && key === this.explorerActiveKey)
    })
  }

  visibleExplorerItems() {
    return Array.from(this.fileTreeTarget.querySelectorAll(".tree-item"))
      .filter((item) => !item.closest(".tree-children.hidden") && !item.closest("[hidden]"))
  }

  focusExplorerItem(item) {
    if (!item || document.activeElement === item) return
    this._settingExplorerFocus = true
    try {
      item.focus()
    } finally {
      this._settingExplorerFocus = false
    }
  }

  selectExplorerItem(item, event = {}, { focus = true } = {}) {
    if (!item || !this.fileTreeTarget?.contains(item)) return
    if (!this.explorerSelection) this.explorerSelection = new Map()

    const target = { path: item.dataset.path, type: item.dataset.type }
    const targetKey = this.explorerItemKey(target)
    const selection = new Map(this.explorerSelection)
    const additive = event.ctrlKey || event.metaKey

    if (event.shiftKey) {
      const visibleItems = this.visibleExplorerItems()
      const anchorIndex = visibleItems.findIndex((visibleItem) => this.explorerItemKey(visibleItem) === this.explorerSelectionAnchor)
      const targetIndex = visibleItems.indexOf(item)
      if (anchorIndex < 0 || targetIndex < 0) {
        selection.clear()
        selection.set(targetKey, target)
        this.explorerSelectionAnchor = targetKey
      } else {
        if (!additive) selection.clear()
        const start = Math.min(anchorIndex, targetIndex)
        const end = Math.max(anchorIndex, targetIndex)
        visibleItems.slice(start, end + 1).forEach((visibleItem) => {
          const value = { path: visibleItem.dataset.path, type: visibleItem.dataset.type }
          selection.set(this.explorerItemKey(value), value)
        })
      }
    } else if (additive) {
      if (selection.has(targetKey)) selection.delete(targetKey)
      else selection.set(targetKey, target)
      this.explorerSelectionAnchor = targetKey
    } else {
      selection.clear()
      selection.set(targetKey, target)
      this.explorerSelectionAnchor = targetKey
    }

    this.explorerSelection = selection
    this.explorerActiveKey = selection.has(targetKey)
      ? targetKey
      : (selection.has(this.explorerActiveKey) ? this.explorerActiveKey : Array.from(selection.keys()).pop() || null)
    this.syncExplorerSelection()
    if (focus) this.focusExplorerItem(item)
  }

  onExplorerItemFocus(event) {
    if (this._settingExplorerFocus || this._explorerPointerDownItem === event.currentTarget) return
    this.selectExplorerItem(event.currentTarget, {}, { focus: false })
  }

  onExplorerItemPointerDown(event) {
    this._explorerPointerDownItem = event.currentTarget
  }

  remapExplorerSelection(oldPath, newPath, type) {
    if (!this.explorerSelection) return
    const remapped = new Map()
    for (const item of this.explorerSelection.values()) {
      const value = { ...item, path: remapScopedPath(item.path, oldPath, newPath, type) }
      remapped.set(this.explorerItemKey(value), value)
    }
    this.explorerSelection = remapped
    if (this.explorerSelectionAnchor) {
      const [anchorType, anchorPath] = JSON.parse(this.explorerSelectionAnchor)
      this.explorerSelectionAnchor = this.explorerItemKey({
        type: anchorType,
        path: remapScopedPath(anchorPath, oldPath, newPath, type)
      })
    }
    if (this.explorerActiveKey) {
      const [activeType, activePath] = JSON.parse(this.explorerActiveKey)
      this.explorerActiveKey = this.explorerItemKey({
        type: activeType,
        path: remapScopedPath(activePath, oldPath, newPath, type)
      })
    }
    this.syncExplorerSelection()
  }

  removeExplorerSelection(path, type) {
    if (!this.explorerSelection) return
    for (const [key, item] of this.explorerSelection) {
      if (pathMatchesScope(item.path, path, type)) this.explorerSelection.delete(key)
    }
    if (this.explorerSelectionAnchor) {
      const [anchorType, anchorPath] = JSON.parse(this.explorerSelectionAnchor)
      if (pathMatchesScope(anchorPath, path, type)) this.explorerSelectionAnchor = null
    }
    this.syncExplorerSelection({ pruneMissing: true })
  }

  deleteSelectedExplorerItem(event) {
    const item = event.currentTarget
    if (event.key !== "Delete" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.repeat) return
    if (!this.fileTreeTarget?.contains(item) || !item.classList.contains("explorer-selected")) return

    const selectedItems = this.getSelectedExplorerItems().filter((selectedItem) => selectedItem.fileType !== "config")
    if (selectedItems.length === 0) return

    const fileOperations = this.getFileOperationsController()
    if (!fileOperations) return

    event.preventDefault()
    fileOperations.deleteItems(selectedItems)
  }

  renameSelectedExplorerItem(event) {
    const item = event.currentTarget
    if (event.key !== "F2" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.repeat) return
    if (!this.fileTreeTarget?.contains(item) || !item.classList.contains("explorer-selected")) return

    const selectedItems = this.getSelectedExplorerItems()
    if (selectedItems.length !== 1 || selectedItems[0].fileType === "config") return

    const fileOperations = this.getFileOperationsController()
    if (!fileOperations) return

    event.preventDefault()
    fileOperations.renameExplorerItem(selectedItems[0])
  }

  async selectFile(event) {
    this.selectExplorerItem(event.currentTarget, event)
    if (event.ctrlKey || event.metaKey || event.shiftKey) return
    const path = event.currentTarget.dataset.path
    await this.loadFile(path)
  }

  async loadFile(path, options = {}) {
    const { updateHistory = true } = options
    const generation = options.generation ?? this.beginNavigation()

    try {
      const response = await get(`/notes/${encodePath(path)}`, { responseKind: "json" })
      if (!this.isCurrentNavigation(generation)) return

      if (!response.ok) {
        if (response.statusCode === 404) {
          this.applyFileNotFound(path, window.t("errors.note_not_found"), generation, {
            updateHistory,
            replaceHistory: false
          })
          return null
        }
        throw new Error(window.t("errors.failed_to_load"))
      }

      const data = await response.json
      if (!this.isCurrentNavigation(generation)) return
      const applied = this.applyLoadedFile(path, data.content, data.revision, generation, { updateHistory })
      if (!applied) return null
      return { path, content: data.content, revision: data.revision }
    } catch (error) {
      if (!this.isCurrentNavigation(generation)) return
      console.error("Error loading file:", error)
      this.restoreCurrentFileUrl()
      const autosave = this.getAutosaveController()
      if (autosave) autosave.showSaveStatus(window.t("status.error_loading"), true)
      return null
    }
  }

  showEditor(content, fileType = "markdown", revision = null) {
    this.clearPendingSlashInsertion()
    if (this._fileNotFoundTimeout) {
      clearTimeout(this._fileNotFoundTimeout)
      this._fileNotFoundTimeout = null
    }
    this.textareaTarget.disabled = false
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
    let editorContent = content
    if (autosave) {
      autosave.setFile(this.currentFile, content, revision)
      if (autosave.recoverDraft) {
        editorContent = autosave.recoverDraft(content, revision)
      } else {
        autosave.checkOfflineBackup(content)
      }
    }

    // Set content via CodeMirror controller
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) {
      codemirrorController.setUndoAtHistoryStartHandler?.((path) => this.onUndoAtHistoryStart(path))
      codemirrorController.setRedoAtHistoryEndHandler?.((path) => this.onRedoAtHistoryEnd(path))
      codemirrorController.loadContent(editorContent, this.currentFile)
    } else {
      // Fallback to hidden textarea
      this.textareaTarget.value = editorContent
    }

    // Applying a recovered draft can be a programmatic editor change. Ensure
    // it remains queued for autosave even when CodeMirror sees no text delta.
    if (autosave && editorContent !== content) autosave.scheduleAutoSave()

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
    this.initializeTypewriterMode()
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
      const configCtrl = this.getSettingsController()
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

    if (this.isMarkdownFile() && this.getSettingsController()?.typewriterModeEnabled) {
      this.syncTypewriterPreview()
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
    const configCtrl = this.getSettingsController()
    if (configCtrl) {
      await configCtrl.reload()
      this.initializeTypewriterMode()
      const autosaveCtrl = this.getAutosaveController()
      if (autosaveCtrl) {
        autosaveCtrl.showSaveStatus(window.t("status.config_applied"))
        setTimeout(() => autosaveCtrl.showSaveStatus(""), 2000)
      }
    }
  }

  // === Preview Panel - Delegates to preview_controller ===
  togglePreview() {
    if (this.libraryVisible || this.settingsVisible) return false

    // Only allow preview for markdown files
    if (!this.isMarkdownFile()) {
      this.showTemporaryMessage("Preview is only available for markdown files")
      return
    }

    // Single view mode: the toggle swaps which pane owns the workspace
    if (this.viewMode === "single") return this.switchSinglePane()

    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.toggle()
    }
  }

  // Single view mode pane switch: editor → full-width preview → editor.
  // The editor pane is hidden-not-disconnected, keeping autosave/undo/slash
  // state alive across switches (same invariant as the Library/Settings
  // workspaces).
  switchSinglePane() {
    const root = this.context?.element
    const editorPanel = root?.querySelector('[data-app-target~="editorPanel"]')
    const previewController = this.getPreviewController()
    if (!previewController) return false

    if (previewController.isVisible) {
      // Full-width preview → back to the editor pane
      previewController.hide()
      editorPanel?.classList.remove("hidden")
      this.getCodemirrorController()?.focus?.()
      return false
    }

    // Editor pane → full-width preview
    previewController.show()
    editorPanel?.classList.add("hidden")
    return true
  }

  updatePreview() {
    const scrollSync = this.getScrollSyncController()
    if (scrollSync) scrollSync.updatePreview()
  }

  // === Table Editor ===
  openTableEditor({ slashInsertion = false } = {}) {
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

        const pending = this.pendingSlashInsertionRange
        if (slashInsertion && pending?.action === "table" && pending.from >= startPos && pending.to <= endPos && text.slice(pending.from, pending.to) === pending.query) {
          const queryFrom = pending.from - startPos
          const queryTo = pending.to - startPos
          let beforeQuery = existingTable.slice(0, queryFrom)
          let afterQuery = existingTable.slice(queryTo)
          if (/[ \t]$/.test(beforeQuery) && /^[ \t]/.test(afterQuery)) {
            afterQuery = afterQuery.slice(1)
          } else if (beforeQuery.length === 0 && /^[ \t]/.test(afterQuery)) {
            afterQuery = afterQuery.slice(1)
          } else if (!afterQuery.trim() && /[ \t]+$/.test(beforeQuery)) {
            beforeQuery = beforeQuery.replace(/[ \t]+$/, "")
          }
          existingTable = beforeQuery + afterQuery
        }
      }
    }

    // Dispatch event for table_editor_controller
    window.dispatchEvent(new CustomEvent("frankmd:open-table-editor", {
      detail: { existingTable, startPos, endPos }
    }))
    return Boolean(document.querySelector('[data-controller~="table-editor"]'))
  }

  // Setup listener for table insertion from table_editor_controller
  setupTableEditorListener() {
    this.boundTableInsertHandler = this.handleTableInsert.bind(this)
    window.addEventListener("frankmd:insert-table", this.boundTableInsertHandler)
  }

  setupSlashCommandListener() {
    this.boundSlashCommandOpenHandler = this.openSlashCommandAction.bind(this)
    window.addEventListener("frankmd:open-slash-command", this.boundSlashCommandOpenHandler)
  }

  openSlashCommandAction(event) {
    const { action, from, to, query } = event.detail || {}
    if (!this.isMarkdownFile() || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || typeof query !== "string" || !query.startsWith("/")) return

    this.pendingSlashInsertionRange = { action, from, to, query }

    let opened = false
    if (action === "table") opened = this.openTableEditor({ slashInsertion: true })
    if (action === "image") opened = this.openImagePicker()
    if (action === "video") opened = this.openVideoDialog()
    if (action === "emoji") opened = this.openEmojiPicker()

    if (!opened) this.clearPendingSlashInsertion(action)
  }

  getPendingSlashInsertionRange(action) {
    const pending = this.pendingSlashInsertionRange
    if (!pending || pending.action !== action) return null

    const codemirrorController = this.getCodemirrorController()
    const currentQuery = codemirrorController?.getValue().slice(pending.from, pending.to)
    if (!codemirrorController || currentQuery !== pending.query) {
      this.clearPendingSlashInsertion(action)
      return false
    }

    return { from: pending.from, to: pending.to }
  }

  clearPendingSlashInsertion(action = null) {
    if (!action || this.pendingSlashInsertionRange?.action === action) {
      this.pendingSlashInsertionRange = null
    }
  }

  onSlashCommandDialogClose(event) {
    this.clearPendingSlashInsertion(event.currentTarget?.dataset?.slashCommandAction)
  }

  // Handle table insertion from table_editor_controller
  handleTableInsert(event) {
    if (!this.isMarkdownFile()) {
      this.clearPendingSlashInsertion()
      return
    }

    const { markdown, editMode, startPos, endPos } = event.detail

    if (!markdown) return

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    let slashRange = null
    if (!editMode) {
      slashRange = this.getPendingSlashInsertionRange("table")
      if (slashRange === false) return
    }
    const options = editMode ? { editMode, startPos, endPos } : (slashRange || { editMode, startPos, endPos })
    insertBlockContent(codemirrorController, markdown, options)
    if (slashRange || editMode) this.clearPendingSlashInsertion("table")
    codemirrorController.focus()
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // === Image Picker Event Handler ===
  onImageSelected(event) {
    if (!this.isMarkdownFile()) {
      this.clearPendingSlashInsertion()
      return
    }

    const { imageUrl, altText, linkUrl } = event.detail
    let { markdown } = event.detail
    if (!markdown) return

    // Local uploads are saved under NOTES_PATH/images, so make their Markdown
    // path relative to the open note just like media inserted from the Library.
    if (typeof imageUrl === "string" && imageUrl.startsWith("images/")) {
      const relativePath = relativeMediaPath(this.currentFile, imageUrl)
      if (relativePath) {
        const encodedPath = encodeRelativeMediaPath(relativePath)
        const safeAltText = escapeMarkdownAlt(altText || "Image")
        markdown = `![${safeAltText}](${encodedPath})`
        if (linkUrl) markdown = `[${markdown}](${linkUrl})`
      }
    }

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    const slashRange = this.getPendingSlashInsertionRange("image")
    if (slashRange === false) return
    insertImage(codemirrorController, markdown, slashRange || {})
    if (slashRange) this.clearPendingSlashInsertion("image")
    codemirrorController.focus()
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // Open image picker dialog (delegates to image-picker controller)
  openImagePicker() {
    if (this.hasImagePickerOutlet) {
      this.imagePickerOutlet.open()
      return true
    }
    return false
  }

  // Route pasted images through the picker (pre-selected) so the normal Insert flow still applies
  onImagePaste(event) {
    const { file } = event.detail
    if (file && this.hasImagePickerOutlet) this.imagePickerOutlet.openWithFile(file)
  }

  // Font/size now live in the Settings workspace (settings_controller) and
  // apply live on change, so no dialog delegation is needed here anymore.

  applyEditorSettings() {
    const configCtrl = this.getSettingsController()
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
    const configCtrl = this.getSettingsController()
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
    const configCtrl = this.getSettingsController()
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
      const configCtrl = this.getSettingsController()
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

  // === Library Workspace ===
  toggleLibrary() {
    if (this.libraryVisible) {
      this.showEditorWorkspace()
      return false
    }

    this.showLibraryWorkspace()
    return true
  }

  showLibraryWorkspace() {
    const root = this.context?.element
    const editorPanel = root?.querySelector('[data-app-target~="editorPanel"]')
    const previewPanel = root?.querySelector('[data-app-target~="previewPanel"]')
    const libraryPanel = root?.querySelector('[data-app-target~="libraryPanel"]')
    const toggles = root?.querySelectorAll('[data-app-target~="libraryToggle"]')
    if (!libraryPanel) return false

    const openingLibrary = !this.libraryVisible
    if (openingLibrary) {
      if (this.settingsVisible) {
        // Direct workspace switch: the Settings workspace already stashed the
        // preview state (and hid the preview) — inherit it so returning to
        // the editor restores it.
        this._libraryPreviewWasVisible = this._settingsPreviewWasVisible ?? false
        this.closeSettingsWorkspace()
      } else {
        const previewController = this.getPreviewController()
        this._libraryPreviewWasVisible = previewController
          ? previewController.isVisible
          : Boolean(previewPanel && !previewPanel.classList.contains("hidden"))
        if (this._libraryPreviewWasVisible && previewController) {
          previewController.hide()
        } else {
          previewPanel?.classList.add("hidden")
          previewPanel?.classList.remove("flex")
        }
      }
    }
    this.libraryVisible = true
    editorPanel?.classList.add("hidden")
    libraryPanel.classList.remove("hidden")
    toggles?.forEach((toggle) => toggle.setAttribute("aria-pressed", "true"))
    if (openingLibrary) {
      const libraryController = this.application?.getControllerForElementAndIdentifier(libraryPanel, "library")
      libraryController?.resetUsageForLibraryOpen()
      libraryController?.load()
    }
    return true
  }

  // === Settings Workspace ===
  toggleSettings() {
    if (this.settingsVisible) {
      this.showEditorWorkspace()
      return false
    }

    this.showSettingsWorkspace()
    return true
  }

  showSettingsWorkspace() {
    const root = this.context?.element
    const editorPanel = root?.querySelector('[data-app-target~="editorPanel"]')
    const previewPanel = root?.querySelector('[data-app-target~="previewPanel"]')
    const settingsPanel = root?.querySelector('[data-app-target~="settingsPanel"]')
    const toggles = root?.querySelectorAll('[data-app-target~="settingsToggle"]')
    if (!settingsPanel) return false

    const openingSettings = !this.settingsVisible
    if (openingSettings) {
      if (this.libraryVisible) {
        // Direct workspace switch: the Library workspace already stashed the
        // preview state (and hid the preview) — inherit it so returning to
        // the editor restores it.
        this._settingsPreviewWasVisible = this._libraryPreviewWasVisible ?? false
        this.closeLibraryWorkspace()
      } else {
        const previewController = this.getPreviewController()
        this._settingsPreviewWasVisible = previewController
          ? previewController.isVisible
          : Boolean(previewPanel && !previewPanel.classList.contains("hidden"))
        if (this._settingsPreviewWasVisible && previewController) {
          previewController.hide()
        } else {
          previewPanel?.classList.add("hidden")
          previewPanel?.classList.remove("flex")
        }
      }
    }
    this.settingsVisible = true
    editorPanel?.classList.add("hidden")
    settingsPanel.classList.remove("hidden")
    toggles?.forEach((toggle) => toggle.setAttribute("aria-pressed", "true"))
    if (openingSettings) {
      const settingsController = this.application?.getControllerForElementAndIdentifier(settingsPanel, "settings")
      settingsController?.onWorkspaceOpen()
      settingsController?.navButtonTargets?.[0]?.focus()
    }
    return true
  }

  // Hide the Settings pane without touching the stashed preview state (used
  // when switching straight to the Library workspace).
  closeSettingsWorkspace() {
    const root = this.context?.element
    const settingsPanel = root?.querySelector('[data-app-target~="settingsPanel"]')
    const toggles = root?.querySelectorAll('[data-app-target~="settingsToggle"]')
    this.settingsVisible = false
    settingsPanel?.classList.add("hidden")
    toggles?.forEach((toggle) => toggle.setAttribute("aria-pressed", "false"))
  }

  // Hide the Library pane without touching the stashed preview state (used
  // when switching straight to the Settings workspace).
  closeLibraryWorkspace() {
    const root = this.context?.element
    const libraryPanel = root?.querySelector('[data-app-target~="libraryPanel"]')
    const toggles = root?.querySelectorAll('[data-app-target~="libraryToggle"]')
    this.libraryVisible = false
    libraryPanel?.classList.add("hidden")
    toggles?.forEach((toggle) => toggle.setAttribute("aria-pressed", "false"))
  }

  showEditorWorkspace() {
    const wasInLibrary = Boolean(this.libraryVisible)
    const wasInSettings = Boolean(this.settingsVisible)
    const root = this.context?.element
    const editorPanel = root?.querySelector('[data-app-target~="editorPanel"]')
    const previewPanel = root?.querySelector('[data-app-target~="previewPanel"]')
    const libraryPanel = root?.querySelector('[data-app-target~="libraryPanel"]')
    const settingsPanel = root?.querySelector('[data-app-target~="settingsPanel"]')
    const libraryToggles = root?.querySelectorAll('[data-app-target~="libraryToggle"]')
    const settingsToggles = root?.querySelectorAll('[data-app-target~="settingsToggle"]')

    this.libraryVisible = false
    this.settingsVisible = false
    libraryPanel?.classList.add("hidden")
    settingsPanel?.classList.add("hidden")
    editorPanel?.classList.remove("hidden")

    const previewWasVisible = wasInLibrary
      ? this._libraryPreviewWasVisible
      : (wasInSettings ? this._settingsPreviewWasVisible : null)

    // Single view mode: exactly one pane owns the workspace and returning to
    // the editor always lands on the editor pane — the preview toggle swaps
    // panes on demand. Split mode restores the stashed preview state.
    if ((wasInLibrary || wasInSettings) && previewPanel && this.viewMode !== "single") {
      const previewController = this.getPreviewController()
      if (previewWasVisible) {
        if (previewController) previewController.show()
        else {
          previewPanel.classList.remove("hidden")
          previewPanel.classList.add("flex")
        }
      } else {
        previewPanel.classList.add("hidden")
        previewPanel.classList.remove("flex")
      }
    } else if (this.viewMode === "single") {
      const previewController = this.getPreviewController()
      if (previewController) previewController.hide()
      else previewPanel?.classList.add("hidden")
    }
    this._libraryPreviewWasVisible = null
    this._settingsPreviewWasVisible = null

    libraryToggles?.forEach((toggle) => toggle.setAttribute("aria-pressed", "false"))
    settingsToggles?.forEach((toggle) => toggle.setAttribute("aria-pressed", "false"))

    // Returning from Settings: restore focus to the header toggle (trigger).
    if (wasInSettings && !wasInLibrary) {
      root?.querySelector('[data-app-target~="settingsToggle"]')?.focus()
    }

    // Re-measure CodeMirror after revealing a workspace-hidden editor. When
    // Typewriter mode was enabled in Settings, its initial measurement saw 0px.
    this.codemirrorOutlets?.[0]?.refreshTypewriterLayout?.()
    this.initializeTypewriterMode()
    return true
  }

  insertLibraryMedia(event) {
    const { item } = event.detail || {}
    const reject = (status, messageKey) => {
      event.detail.status = status
      appAlert(window.t(messageKey))
      return false
    }

    if (!this.currentFile) return reject("no_open_note", "library.no_open_note")
    if (!this.isMarkdownFile()) return reject("markdown_note_required", "library.markdown_note_required")
    if (!this.isValidLibraryMediaItem(item)) return reject("invalid_media", "library.insertion_failed")

    const codemirror = this.getCodemirrorController()
    if (!codemirror) return reject("editor_unavailable", "library.insertion_failed")

    const relativePath = relativeMediaPath(this.currentFile, item.path)
    if (!relativePath) return reject("invalid_media", "library.insertion_failed")
    const encodedPath = encodeRelativeMediaPath(relativePath)

    try {
      if (item.type === "image") {
        const markdown = `![${escapeMarkdownAlt(item.name)}](${encodedPath})`
        insertImage(codemirror, markdown)
      } else {
        const extension = item.path.split("/").pop().split(".").pop().toLowerCase()
        const mimeType = VIDEO_MIME_TYPES[extension]
        const typeAttribute = mimeType ? ` type="${mimeType}"` : ""
        const embed = `<video controls class="video-player">\n  <source src="${encodedPath}"${typeAttribute}>\n</video>`
        insertVideoEmbed(codemirror, embed)
      }

      this.onEditorChange({ detail: { docChanged: true } })
      this.showEditorWorkspace()
      codemirror.focus()
      event.detail.status = "inserted"
      return true
    } catch (error) {
      console.error("Failed to insert Library media:", error)
      return reject("failed", "library.insertion_failed")
    }
  }

  isValidLibraryMediaItem(item) {
    if (!item || typeof item.name !== "string" || typeof item.path !== "string") return false
    if (item.type !== "image" && item.type !== "video") return false
    const segments = item.path.split("/")
    const expectedRoot = item.type === "image" ? "images" : "videos"
    return segments[0] === expectedRoot && segments.length > 1 &&
      segments.every((segment) => segment && segment !== "." && segment !== ".." && !segment.includes("\\"))
  }

  // === Typewriter Mode - Delegates to typewriter_controller ===

  initializeTypewriterMode() {
    const typewriterController = this.getTypewriterController()
    const configCtrl = this.getSettingsController()
    if (!typewriterController || !configCtrl) return

    const savedValue = configCtrl.typewriterModeEnabled
    const enabled = savedValue && this.isMarkdownFile()
    typewriterController.setEnabled(enabled)
    this.updateTypewriterToggleButton(savedValue)
    this.applyTypewriterMode(enabled)
  }

  // === Document View Mode ===

  // Pull the persisted view mode from the settings controller at boot. The
  // settings controller also pushes changes live via setViewMode, so this
  // covers boot regardless of controller connect order.
  initializeViewMode() {
    const settingsCtrl = this.getSettingsController()
    const mode = settingsCtrl?.viewMode
    if (mode) this.setViewMode(mode)
  }

  setViewMode(mode) {
    const normalized = mode === "single" ? "single" : "split"
    if (this.viewMode === normalized) return
    this.viewMode = normalized
    this.applyViewMode()
  }

  applyViewMode() {
    document.body.classList.toggle("single-view-mode", this.viewMode === "single")

    // While a workspace (Library/Settings) owns the main area, pane layout is
    // re-applied by showEditorWorkspace when returning to the editor.
    if (this.libraryVisible || this.settingsVisible) return

    const root = this.context?.element
    const editorPanel = root?.querySelector('[data-app-target~="editorPanel"]')
    if (this.viewMode === "single") {
      // Single mode defaults to the editor pane; the preview toggle swaps panes
      this.getPreviewController()?.hide()
      editorPanel?.classList.remove("hidden")
    } else {
      // Back to split: the editor pane returns beside the current preview
      // state, exactly as the classic layout behaved
      editorPanel?.classList.remove("hidden")
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

  // Settings switch: same behavior as the old header button — toggle straight
  // through the typewriter controller (no markdown-file guard), letting the
  // typewriter:toggled event drive persistence and UI coordination.
  toggleTypewriterButton() {
    this.getTypewriterController()?.toggle()
  }

  // Handle typewriter:toggled event
  onTypewriterToggled(event) {
    const { enabled } = event.detail
    this.saveConfig({ typewriter_mode: enabled })
    const configCtrl = this.getSettingsController()
    if (configCtrl) configCtrl.typewriterModeValue = enabled
    this.updateTypewriterToggleButton(enabled)

    const active = enabled && this.isMarkdownFile()
    this.getTypewriterController()?.setEnabled(active)
    this.applyTypewriterMode(active)
  }

  applyTypewriterMode(enabled) {
    const previewController = this.getPreviewController()
    previewController?.setTypewriterMode(enabled)
    this.getScrollSyncController()?.setTypewriterMode(enabled)
    document.body.classList.toggle("typewriter-mode", enabled)

    if (!enabled || !this.isMarkdownFile() || this.libraryVisible || this.settingsVisible) return

    // In split view, keep both panes available so the preview can follow the
    // cursor. Single view continues to let the user switch between panes.
    if (this.viewMode !== "single" && previewController && !previewController.isVisible) {
      previewController.show()
    }
    this.syncTypewriterPreview()
  }

  maintainTypewriterScroll() {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    // Center cursor in editor (works regardless of preview)
    codemirrorController.maintainTypewriterScroll()

    this.syncTypewriterPreview()
  }

  syncTypewriterPreview() {
    const codemirrorController = this.getCodemirrorController()
    const previewController = this.getPreviewController()
    if (!codemirrorController || !previewController?.isVisible) return

    const syncData = codemirrorController.getTypewriterSyncData()
    if (syncData) {
      previewController.syncToTypewriter(syncData.currentLine, syncData.totalLines)
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

  openLibraryNote(event) {
    const path = event.detail?.path
    if (typeof path !== "string" || path.startsWith("/") || !path.endsWith(".md")) return
    if (path.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) return

    return this.openFileAndRevealInTree(path)
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
    if (this.hasVideoDialogOutlet) {
      this.videoDialogOutlet.open()
      return true
    }
    return false
  }

  // Video Embed Event Handler - receives events from video_dialog_controller
  insertVideoEmbed(event) {
    if (!this.isMarkdownFile()) {
      this.clearPendingSlashInsertion()
      return
    }

    const { embedCode } = event.detail
    if (!embedCode) return

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    const slashRange = this.getPendingSlashInsertionRange("video")
    if (slashRange === false) return
    insertVideoEmbed(codemirrorController, embedCode, slashRange || {})
    if (slashRange) this.clearPendingSlashInsertion("video")
    codemirrorController.focus()
    this.onEditorChange({ detail: { docChanged: true } })
  }

  // === AI Grammar Check Methods - Delegates to ai_grammar_controller ===

  async openAiDialog() {
    if (!this.currentFile) {
      appAlert(window.t("errors.no_file_open"))
      return
    }

    const codemirrorController = this.getCodemirrorController()
    const text = codemirrorController ? codemirrorController.getValue() : ""
    if (!text.trim()) {
      appAlert(window.t("errors.no_text_to_check"))
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
    const configCtrl = this.getSettingsController()
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

  // Handle preview:toggle-task — a task checkbox was clicked in the preview
  // (#203). Toggle the marker at that source line in the editor; the re-render
  // follows through the normal change pipeline. No editor open or non-markdown
  // file: no-op.
  onPreviewToggleTask(event) {
    const { line } = event.detail
    if (!Number.isInteger(line)) return

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return
    if (!this.isMarkdownFile()) return

    codemirrorController.toggleTaskAtLine(line)
  }

  // Ctrl+Enter: toggle the task on the current line(s), or add one
  toggleTask() {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return
    if (!this.isMarkdownFile()) return

    codemirrorController.toggleTask()
  }

  // === File Operations Event Handlers ===

  acquireCreatedNoteUndoEditorLock(codemirror) {
    if (codemirror?.acquireReadOnlyLock) return codemirror.acquireReadOnlyLock()

    if (codemirror?.setReadOnly) {
      const wasReadOnly = Boolean(codemirror.readOnlyValue)
      codemirror.setReadOnly(true)
      return () => codemirror.setReadOnly(wasReadOnly)
    }

    if (this.hasTextareaTarget) {
      const textarea = this.textareaTarget
      const wasDisabled = textarea.disabled
      textarea.disabled = true
      return () => { textarea.disabled = wasDisabled }
    }

    return () => {}
  }

  onUndoAtHistoryStart(path) {
    if (!path || path !== this.currentFile || this.getFileType(path) !== "markdown") return false
    if (this._pendingCreatedNoteUndo?.size) return true

    const boundary = this.createdNoteBoundaries?.get(path)
    if (!boundary || boundary.deleted) return false

    const codemirror = this.getCodemirrorController()
    if (!codemirror || codemirror.getValue() !== boundary.initialContent) return false

    const autosave = this.getAutosaveController()
    if (!autosave?.prepareForFileDeletion) {
      this.showTemporaryMessage(window.t("status.draft_storage_error"), 5000)
      return true
    }

    const contentAtConfirmation = codemirror.getValue()
    if (contentAtConfirmation !== boundary.initialContent) return true

    this._pendingCreatedNoteUndo ??= new Set()
    this._pendingCreatedNoteUndo.add(path)
    void this.confirmAndPerformCreatedNoteUndo(
      path,
      boundary,
      autosave,
      this._navigationGeneration,
      contentAtConfirmation
    )
    return true
  }

  confirmCreatedNoteUndo(path) {
    const name = path.split("/").pop() || path
    const dialog = this.undoCreatedNoteDialogTarget
    const messageTarget = this.undoCreatedNoteMessageTarget

    if (!dialog || typeof dialog.showModal !== "function" || !messageTarget) {
      return Promise.resolve(window.confirm(window.t("confirm.undo_created_note", { name })))
    }

    const filenameToken = "__FRANKMD_UNDO_FILENAME__"
    const message = window.t("confirm.undo_created_note", { name: filenameToken })
    const parts = String(message).split(filenameToken)
    const fragment = document.createDocumentFragment()

    parts.forEach((part, index) => {
      if (part) fragment.append(document.createTextNode(part))
      if (index < parts.length - 1) {
        const filename = document.createElement("span")
        filename.className = "confirm-dialog__filename"
        filename.textContent = name
        fragment.append(filename)
      }
    })

    if (parts.length > 1) {
      messageTarget.replaceChildren(fragment)
    } else {
      // Keep a useful localized message if a locale has not loaded its
      // placeholder-based translation yet.
      messageTarget.textContent = window.t("confirm.undo_created_note", { name })
    }

    dialog.returnValue = ""
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => {
        resolve(dialog.returnValue === "confirm")
      }, { once: true })
      dialog.showModal()
    })
  }

  closeUndoCreatedNoteDialog() {
    const dialog = this.undoCreatedNoteDialogTarget
    if (typeof dialog.close === "function") dialog.close("cancel")
  }

  async confirmAndPerformCreatedNoteUndo(path, boundary, autosave, navigationGeneration, expectedContent) {
    let releaseEditorLock
    try {
      if (!await this.confirmCreatedNoteUndo(path)) return

      if (this.currentFile !== path || this._navigationGeneration !== navigationGeneration ||
          this.createdNoteBoundaries?.get(path) !== boundary || boundary.deleted) return

      const codemirror = this.getCodemirrorController()
      if (!codemirror || codemirror.getValue() !== expectedContent ||
          codemirror.getValue() !== boundary.initialContent) {
        this.showTemporaryMessage(window.t("errors.failed_to_delete"), 5000)
        return
      }

      releaseEditorLock = this.acquireCreatedNoteUndoEditorLock(codemirror)
      await this.performCreatedNoteUndo(
        path,
        boundary,
        autosave,
        navigationGeneration,
        expectedContent,
        releaseEditorLock
      )
      releaseEditorLock = null
    } catch (error) {
      console.error("Failed to confirm created-note undo:", error)
      this.showTemporaryMessage(error.message || window.t("errors.failed_to_delete"), 5000)
    } finally {
      releaseEditorLock?.()
      this._pendingCreatedNoteUndo?.delete(path)
    }
  }

  async performCreatedNoteUndo(path, boundary, autosave, navigationGeneration, expectedContent, releaseEditorLock) {
    let deletionSucceeded = false
    try {
      const preparation = await autosave.prepareForFileDeletion(path)
      if (!preparation.ok) {
        if (!preparation.stale) {
          if (preparation.error) console.error("Unable to prepare created note for deletion:", preparation.error)
          this.showTemporaryMessage(window.t("status.draft_storage_error"), 5000)
        }
        return
      }
      // The user may have navigated while an autosave was draining. Keep the
      // explicit confirmation tied to the note that was active at keypress.
      if (this.currentFile !== path || this._navigationGeneration !== navigationGeneration) {
        return
      }

      // The editor stays interaction-locked while the server request is in
      // flight. This second check also protects against programmatic edits or
      // a read-only lock that could not be acquired on a fallback editor.
      if (this.getCodemirrorController()?.getValue() !== expectedContent) {
        this.showTemporaryMessage(window.t("errors.failed_to_delete"), 5000)
        return
      }

      const expectedRevision = preparation.revision || boundary.initialRevision
      const response = await destroy(
        `/notes/${encodePath(path)}?expected_revision=${encodeURIComponent(expectedRevision)}`,
        { responseKind: "turbo-stream" }
      )

      if (!response.ok) {
        const data = await response.json
        this.showTemporaryMessage(data.error || window.t("errors.failed_to_delete"), 5000)
        return
      }

      // Keep this boundary and the CodeMirror history cached by path: redo can
      // use them to recreate the note and restore its undone text edits.
      deletionSucceeded = true
      boundary.deleted = true
      const shouldReturnToPrevious = this.currentFile === path &&
        this._navigationGeneration === navigationGeneration
      this.onFileDeleted({ detail: { path, type: "file" } }, { preserveSessionState: true })

      if (shouldReturnToPrevious && boundary.previousPath && boundary.previousPath !== path) {
        const loadedPrevious = await this.loadFile(boundary.previousPath, { updateHistory: false })
        if (loadedPrevious && this.currentFile === boundary.previousPath) {
          this.updateUrl(boundary.previousPath, { replace: true })
        }
      }
    } catch (error) {
      console.error("Failed to undo note creation:", error)
      this.showTemporaryMessage(error.message || window.t("errors.failed_to_delete"), 5000)
    } finally {
      try {
        if (!deletionSucceeded) autosave.resumeAfterTransition?.()
      } catch (resumeError) {
        console.error("Unable to resume autosave after created-note undo:", resumeError)
      } finally {
        try {
          releaseEditorLock?.()
        } catch (unlockError) {
          console.error("Unable to unlock the editor after created-note undo:", unlockError)
        } finally {
          this._pendingCreatedNoteUndo?.delete(path)
        }
      }
    }
  }

  onRedoAtHistoryEnd(path) {
    if (!path || path !== this.currentFile || this.getFileType(path) !== "markdown") return false

    // A deleted creation is the next redo boundary only after the current
    // note's native CodeMirror redo history has been exhausted.
    const boundary = Array.from(this.createdNoteBoundaries?.values?.() || []).reverse().find((candidate) =>
      candidate.deleted && candidate.previousPath === path
    )
    if (!boundary) return false

    return this.requestCreatedNoteRedo(boundary)
  }

  onGlobalRedoAtRootBoundary(event) {
    if (this.currentFile) return false
    if (!event || event.defaultPrevented || event.altKey) return false

    const ctrlOrMeta = event.ctrlKey || event.metaKey
    const key = event.key?.toLowerCase()
    const isRedoShortcut = ctrlOrMeta && (
      (key === "y" && !event.shiftKey) || (key === "z" && event.shiftKey)
    )
    if (!isRedoShortcut) return false

    const target = event.target instanceof Element ? event.target : null
    const targetIsEditor = Boolean(target?.closest(".cm-content"))
    const hiddenEditorHasFocus = targetIsEditor && this.hasEditorTarget &&
      this.editorTarget.classList.contains("hidden")
    if (target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") &&
        !hiddenEditorHasFocus) return false

    if (this._pendingCreatedNoteUndo?.size || this._pendingCreatedNoteRedo?.size) return false

    const boundary = Array.from(this.createdNoteBoundaries?.values?.() || []).reverse().find((candidate) =>
      candidate.deleted && candidate.previousPath == null
    )
    if (!boundary) return false

    event.preventDefault()
    return this.requestCreatedNoteRedo(boundary)
  }

  requestCreatedNoteRedo(boundary) {
    if (this._pendingCreatedNoteRedo?.has(boundary.path)) return true

    const autosave = this.getAutosaveController()
    if (!autosave?.prepareForTransition) {
      this.showTemporaryMessage(window.t("status.draft_storage_error"), 5000)
      return true
    }

    // Preserve the active predecessor's draft before creating/opening another
    // note. A blocked draft write cancels redo without changing the file.
    let preparation
    try {
      preparation = autosave.prepareForTransition()
    } catch (error) {
      console.error("Unable to prepare for created-note redo:", error)
      try {
        autosave.resumeAfterTransition?.()
      } catch (resumeError) {
        console.error("Unable to resume autosave after created-note redo preparation:", resumeError)
      }
      return true
    }
    if (!preparation?.ok) {
      try {
        autosave.resumeAfterTransition?.()
      } catch (resumeError) {
        console.error("Unable to resume autosave after blocked created-note redo:", resumeError)
      }
      return true
    }

    this._pendingCreatedNoteRedo ??= new Set()
    this._pendingCreatedNoteRedo.add(boundary.path)
    void this.performCreatedNoteRedo(boundary, this._navigationGeneration, autosave)
    return true
  }

  async performCreatedNoteRedo(boundary, navigationGeneration, autosave) {
    const path = boundary.path
    try {
      const response = await post("/notes", {
        body: { path, content: boundary.initialContent },
        responseKind: "json"
      })

      if (!response.ok) {
        const data = await response.json
        this.showTemporaryMessage(data.error || window.t("errors.failed_to_create"), 5000)
        return
      }

      // The create endpoint uses create-only semantics. Once it succeeds, the
      // note exists again; never retry creation by overwriting its path.
      boundary.deleted = false

      const shouldReopenNote = this.currentFile === boundary.previousPath &&
        this._navigationGeneration === navigationGeneration
      if (shouldReopenNote) {
        const loadedNote = await this.loadFile(path)
        if (loadedNote && this.currentFile === path) return

        // The note exists, but an interrupted or blocked load must not replace
        // the currently active predecessor.
        await this.refreshTree()
        this.showTemporaryMessage(window.t("errors.failed_to_load"), 5000)
        return
      }

      // The user navigated while the create request was in flight. Preserve
      // that navigation and still reveal the newly created note in the tree.
      await this.refreshTree()
    } catch (error) {
      console.error("Failed to redo note creation:", error)
      this.showTemporaryMessage(error.message || window.t("errors.failed_to_create"), 5000)
    } finally {
      // prepareForTransition flushed and paused follow-up autosave work. Resume
      // whichever file is active now on create failure, stale navigation, or
      // load failure; after a successful note switch this is a harmless no-op.
      try {
        autosave?.resumeAfterTransition?.()
      } catch (resumeError) {
        console.error("Unable to resume autosave after created-note redo:", resumeError)
      } finally {
        this._pendingCreatedNoteRedo?.delete(path)
      }
    }
  }

  async onFileCreated(event) {
    const { path } = event.detail
    const previousPath = this.currentFile
    this.invalidateTreeRefreshes()

    // Expand parent folders
    const pathParts = path.split("/")
    let expandPath = ""
    for (let i = 0; i < pathParts.length - 1; i++) {
      expandPath = expandPath ? `${expandPath}/${pathParts[i]}` : pathParts[i]
      this.expandedFolders.add(expandPath)
    }

    // Tree is already updated by Turbo Stream. Capture the initial server
    // state only after the created note has been loaded and applied; this also
    // captures server-generated content such as Hugo templates.
    const loadedNote = await this.loadFile(path)
    if (!loadedNote || this.currentFile !== path || this.getFileType(path) !== "markdown") return
    if (typeof loadedNote.content !== "string" || typeof loadedNote.revision !== "string") return

    this.createdNoteBoundaries.set(path, {
      path,
      initialContent: loadedNote.content,
      initialRevision: loadedNote.revision,
      previousPath
    })
  }

  onFolderCreated(event) {
    const { path } = event.detail
    this.invalidateTreeRefreshes()
    this.expandedFolders.add(path)
    // Tree is already updated by Turbo Stream
  }

  onFileRenamed(event) {
    const { oldPath, newPath, type } = event.detail
    this.invalidateTreeRefreshes()
    this.remapSessionNotePaths(oldPath, newPath, type)
    this.remapExplorerSelection(oldPath, newPath, type)

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

    this.getAutosaveController()?.renameFile(oldPath, newPath, type)

    // Tree is already updated by Turbo Stream
  }

  remapSessionNotePaths(oldPath, newPath, type) {
    this.getCodemirrorController()?.remapHistoryPaths?.(oldPath, newPath, type)

    const boundaries = this.createdNoteBoundaries
    if (!boundaries || typeof boundaries.entries !== "function") return

    const entries = Array.from(boundaries.entries()).map(([key, boundary]) => {
      const remappedKey = remapScopedPath(key, oldPath, newPath, type)
      if (boundary && typeof boundary === "object") {
        boundary.path = remapScopedPath(boundary.path, oldPath, newPath, type)
        boundary.previousPath = remapScopedPath(boundary.previousPath, oldPath, newPath, type)
      }
      return [key, remappedKey, boundary, key !== remappedKey]
    })
    const destinationPaths = new Set(entries.filter(([, , , moved]) => moved).map(([, path]) => path))
    boundaries.clear()

    // Preserve insertion order for redo selection while allowing the moved
    // note to replace any stale destination boundary from a previously deleted note.
    for (const [key, remappedKey, boundary, moved] of entries) {
      if (!moved && destinationPaths.has(key)) continue
      boundaries.set(remappedKey, boundary)
    }
  }

  evictCreatedNoteBoundaries(path, type) {
    const boundaries = this.createdNoteBoundaries
    if (!boundaries || typeof boundaries.entries !== "function") return

    for (const [key, boundary] of boundaries.entries()) {
      if (pathMatchesScope(key, path, type) || pathMatchesScope(boundary?.path, path, type)) {
        boundaries.delete(key)
      } else if (pathMatchesScope(boundary?.previousPath, path, type)) {
        // Keep an independently created note undoable, but sever a deleted
        // predecessor so a future note at the same path cannot inherit its redo.
        boundary.previousPath = null
      }
    }
  }

  onFileDeleted(event, { preserveSessionState = false } = {}) {
    const { path, type } = event.detail
    this.invalidateTreeRefreshes()
    this.removeExplorerSelection(path, type)
    const activeFileWasDeleted = this.currentFile === path || (
      type === "folder" && this.currentFile?.startsWith(`${path}/`)
    )
    const autosave = this.getAutosaveController()

    const cleanup = autosave?.deleteFile(path, type)
    if (cleanup && !cleanup.ok) {
      this.showTemporaryMessage(window.t("status.draft_storage_error"), 5000)
    }

    if (!preserveSessionState) {
      this.getCodemirrorController()?.evictHistoryPaths?.(path, type)
      this.evictCreatedNoteBoundaries(path, type)
    }

    // Clear editor if deleted file was currently open
    if (activeFileWasDeleted) {
      this.clearPendingSlashInsertion()
      this.currentFile = null
      this.currentFileType = null
      this.updatePathDisplay(null)
      if (this.hasTextareaTarget) this.textareaTarget.disabled = false
      this.editorPlaceholderTarget.classList.remove("hidden")
      this.editorTarget.classList.add("hidden")
      if (this.hasEditorToolbarTarget) {
        this.editorToolbarTarget.classList.add("hidden")
        this.editorToolbarTarget.classList.remove("flex")
      }
      this.hideStatsPanel()
      this.updateUrl(null, { replace: true })
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

  invalidateTreeRefreshes() {
    this._treeRevision = (this._treeRevision || 0) + 1
  }

  invalidateTreeRefreshesForStream(event) {
    if (event.target?.getAttribute?.("target") === "file-tree-content") {
      this.invalidateTreeRefreshes()
      const render = event.detail?.render
      if (typeof render === "function") {
        event.detail.render = async (streamElement) => {
          await render(streamElement)
          this.syncExplorerSelection({ pruneMissing: true })
        }
      }
    }
  }

  async refreshTree(generation = this._navigationGeneration) {
    const treeRevision = this._treeRevision || 0
    const refreshGeneration = (this._treeRefreshGeneration || 0) + 1
    this._treeRefreshGeneration = refreshGeneration

    try {
      const expanded = [...this.expandedFolders].join(",")
      const selected = this.currentFile || ""
      const response = await get(`/notes/tree?expanded=${encodeURIComponent(expanded)}&selected=${encodeURIComponent(selected)}`)
      if (response.ok) {
        const html = await response.text
        if (!this.isCurrentNavigation(generation) || this.currentFile !== (selected || null)) return
        if (treeRevision !== this._treeRevision || refreshGeneration !== this._treeRefreshGeneration) return
        const focusedItem = document.activeElement?.closest?.(".tree-item")
        const focusedPath = this.fileTreeTarget.contains(focusedItem) ? focusedItem.dataset.path : null
        const focusedType = this.fileTreeTarget.contains(focusedItem) ? focusedItem.dataset.type : null

        this.fileTreeTarget.innerHTML = html
        this.syncExplorerSelection({ pruneMissing: true })

        if (focusedPath && focusedType) {
          const restoredItem = Array.from(this.fileTreeTarget.querySelectorAll(".tree-item")).find((item) =>
            item.dataset.path === focusedPath && item.dataset.type === focusedType
          )
          if (restoredItem) this.focusExplorerItem(restoredItem)
        }
      }
    } catch (error) {
      console.error("Error refreshing tree:", error)
    }
  }

  // === Keyboard Shortcuts ===
  setupKeyboardShortcuts() {
    // Merge default shortcuts with user customizations (future: load from config)
    const shortcuts = mergeShortcuts(DEFAULT_SHORTCUTS, this.userShortcuts)
    this._workspaceDeferredEscapeEvents = new WeakSet()

    this.boundWorkspaceEscapeHandler = (event) => {
      if (event.key !== "Escape") return
      const inWorkspace = this.libraryVisible || this.settingsVisible
      if (!inWorkspace) return
      if (document.querySelector("dialog[open]")) {
        this._workspaceDeferredEscapeEvents.add(event)
        return
      }

      const root = this.context?.element
      const libraryPanel = root?.querySelector('[data-app-target~="libraryPanel"]')
      const libraryController = libraryPanel && this.application.getControllerForElementAndIdentifier(libraryPanel, "library")
      const settingsPanel = root?.querySelector('[data-app-target~="settingsPanel"]')
      const settingsController = settingsPanel && this.application.getControllerForElementAndIdentifier(settingsPanel, "settings")

      const otherDialog = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
        .find((dialog) => dialog !== libraryController?.previewDialogTarget &&
          (dialog.localName === "dialog" ? dialog.open : !dialog.classList.contains("hidden")))
      if (otherDialog) {
        this._workspaceDeferredEscapeEvents.add(event)
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()

      if (this.libraryVisible) {
        if (libraryController?.hasPreviewDialogTarget && !libraryController.previewDialogTarget.classList.contains("hidden")) {
          libraryController.closePreview()
          return
        }
        if (this.hasContextMenuTarget && !this.contextMenuTarget.classList.contains("hidden")) {
          this.contextMenuTarget.classList.add("hidden")
          return
        }
        if (libraryController) libraryController.closeLibrary()
        else this.showEditorWorkspace()
        return
      }

      // Settings workspace: dismiss open dropdown menus first, then close.
      const openMenus = settingsPanel?.querySelectorAll(".frankmd-menu:not(.hidden)") || []
      if (openMenus.length > 0) {
        openMenus.forEach((menu) => menu.classList.add("hidden"))
        return
      }
      if (this.hasContextMenuTarget && !this.contextMenuTarget.classList.contains("hidden")) {
        this.contextMenuTarget.classList.add("hidden")
        return
      }
      if (settingsController) settingsController.closeSettings()
      else this.showEditorWorkspace()
    }
    document.addEventListener("keydown", this.boundWorkspaceEscapeHandler, true)

    this.boundKeydownHandler = createKeyHandler(shortcuts, (action, event) => {
      this.executeShortcutAction(action, event)
    })

    document.addEventListener("keydown", this.boundKeydownHandler)
    this.boundRootRedoHandler = (event) => this.onGlobalRedoAtRootBoundary(event)
    document.addEventListener("keydown", this.boundRootRedoHandler)
  }

  // Execute an action triggered by a keyboard shortcut
  executeShortcutAction(action, event) {
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
      toggleTask: () => this.toggleTask(),
      toggleScrollSync: () => this.toggleScrollSync(),
      textFormat: () => this.openTextFormatMenu(),
      emojiPicker: () => this.openEmojiPicker(),
      increaseWidth: () => this.increaseEditorWidth(),
      decreaseWidth: () => this.decreaseEditorWidth(),
      logViewer: () => this.openLogViewer(),
      help: () => this.openHelp(),
      closeDialogs: () => this.closeActiveWorkspaceOrDialogs(event)
    }

    const handler = actions[action]
    if (handler) {
      handler()
    }
  }

  // Route Escape to the active workspace or open dialog.
  closeActiveWorkspaceOrDialogs(event) {
    if (event && this._workspaceDeferredEscapeEvents.has(event)) return
    if (event && document.querySelector("dialog[open]")) return

    if (!this.libraryVisible && !this.settingsVisible) {
      this.closeAllDialogs()
      return
    }

    const root = this.context?.element

    if (this.libraryVisible) {
      const libraryPanel = root?.querySelector('[data-app-target~="libraryPanel"]')
      const libraryController = libraryPanel && this.application.getControllerForElementAndIdentifier(libraryPanel, "library")
      if (libraryController) libraryController.closeLibrary()
      else this.showEditorWorkspace()
      return
    }

    const settingsPanel = root?.querySelector('[data-app-target~="settingsPanel"]')
    const settingsController = settingsPanel && this.application.getControllerForElementAndIdentifier(settingsPanel, "settings")
    if (settingsController) settingsController.closeSettings()
    else this.showEditorWorkspace()
  }

  // Close all open dialogs and menus.
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

  // === Vim Mode ===

  // Settings switch: flip vim mode, apply it live, and persist the preference.
  toggleVimMode() {
    const codemirror = this.getCodemirrorController()
    if (!codemirror) return
    const enabled = !codemirror.vimModeValue
    codemirror.setVimMode(enabled)
    this.saveConfig({ vim_mode: enabled })
    this.updateVimToggleButton(enabled)
  }

  updateVimToggleButton(enabled) {
    if (this.hasVimToggleTarget) {
      this.vimToggleTarget.setAttribute("aria-pressed", String(enabled))
      this.vimToggleTarget.classList.toggle("text-[var(--theme-accent)]", enabled)
    }
  }

  updateTypewriterToggleButton(enabled) {
    if (this.hasTypewriterToggleTarget) {
      this.typewriterToggleTarget.setAttribute("aria-pressed", String(enabled))
    }
  }

  // === Scroll Sync ===

  // Settings switch / Ctrl+Shift+\\: flip editor-preview scroll sync, apply it
  // live via the preview controller's guarded entry points, and persist it.
  toggleScrollSync() {
    const configCtrl = this.getSettingsController()
    const enabled = configCtrl ? !configCtrl.scrollSyncEnabled : true

    if (configCtrl) configCtrl.scrollSyncValue = enabled

    // Flip the preview's flag directly too (works even before outlets settle)
    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.syncScrollEnabledValue = enabled
    }

    this.saveConfig({ scroll_sync: enabled })
    this.updateScrollSyncToggleButton(enabled)
  }

  updateScrollSyncToggleButton(enabled) {
    if (this.hasScrollSyncToggleTarget) {
      this.scrollSyncToggleTarget.setAttribute("aria-pressed", String(enabled))
      this.scrollSyncToggleTarget.classList.toggle("text-[var(--theme-accent)]", enabled)
    }
  }

  // codemirror:vim-mode — reflect the current sub-mode in the status indicator.
  onVimModeStatus(event) {
    const { enabled, mode } = event.detail
    this.updateVimToggleButton(enabled)
    if (!this.hasVimStatusTarget) return

    this.vimStatusTarget.classList.toggle("hidden", !enabled)
    if (enabled) {
      const label = (mode || "normal").split("-")[0].toUpperCase()
      this.vimStatusTarget.textContent = `VIM · ${label}`
    }
  }

  // codemirror:vim-command — map a FrankMD ex-command to an app action.
  onVimCommand(event) {
    const { command } = event.detail
    switch (command) {
      case "save": this.executeShortcutAction("save"); break
      case "close": this.executeShortcutAction("closeDialogs"); break
      case "save-and-close":
        this.executeShortcutAction("save")
        this.executeShortcutAction("closeDialogs")
        break
      case "finder": this.executeShortcutAction("fileFinder"); break
      case "toggle-sidebar": this.executeShortcutAction("toggleSidebar"); break
      case "help": this.openHelp(); break
      case "next-note": this.navigateNote(1); break
      case "prev-note": this.navigateNote(-1); break
    }
  }

  // :n / :prev — move to the next/previous note by clicking the adjacent file
  // item in the tree (reuses the normal open-on-click path).
  navigateNote(direction) {
    const files = Array.from(document.querySelectorAll('.tree-item[data-type="file"]'))
    const currentIndex = files.findIndex(el => el.classList.contains("selected"))
    const target = nextNoteIndex(files.length, currentIndex, direction)
    if (target !== -1) files[target].click()
  }

  // === Editor Indentation ===
  // Note: Tab/Shift+Tab indentation is now handled by CodeMirror's indentWithTab keymap

  // Get the current indent string
  getIndentString() {
    const configCtrl = this.getSettingsController()
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
    if (!this.hasTextareaTarget) return false
    if (!this.isMarkdownFile()) return false

    const emojiPickerController = this.getEmojiPickerController()
    if (emojiPickerController) {
      emojiPickerController.open()
      return true
    }
    return false
  }

  // Handle emoji/emoticon selected event
  onEmojiSelected(event) {
    if (!this.isMarkdownFile()) {
      this.clearPendingSlashInsertion()
      return
    }

    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    const { text: insertText } = event.detail
    if (!insertText) return

    const slashRange = this.getPendingSlashInsertionRange("emoji")
    if (slashRange === false) return
    insertInlineContent(codemirrorController, insertText, slashRange || {})
    if (slashRange) this.clearPendingSlashInsertion("emoji")
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
