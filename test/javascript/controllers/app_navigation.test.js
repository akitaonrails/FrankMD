/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller"

function response({ ok = true, status = 200, json = {}, text = "" } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(text)
  }
}

function makeApp({ currentFile = "a.md", autosave = null } = {}) {
  const app = Object.create(AppController.prototype)
  Object.assign(app, {
    currentFile,
    currentFileType: "markdown",
    expandedFolders: new Set(),
    _navigationGeneration: 0,
    _treeRevision: 0,
    _treeRefreshGeneration: 0,
    _fileNotFoundTimeout: null,
    getAutosaveController: () => autosave,
    getFileType: AppController.prototype.getFileType,
    updatePathDisplay: vi.fn(),
    expandParentFolders: vi.fn(),
    showEditor: vi.fn(),
    updateUrl: vi.fn(),
    refreshTree: vi.fn(),
    fileTreeTarget: { innerHTML: "initial tree" },
    showFileNotFoundMessage: vi.fn(),
    hideStatsPanel: vi.fn(),
    editorPlaceholderTarget: { classList: { add: vi.fn(), remove: vi.fn() } },
    editorTarget: { classList: { add: vi.fn(), remove: vi.fn() } },
    editorToolbarTarget: { classList: { add: vi.fn(), remove: vi.fn() } }
  })
  return app
}

describe("AppController navigation", () => {
  beforeEach(() => {
    window.t = vi.fn((key) => key)
    global.fetch = vi.fn()
    window.history.replaceState({}, "", "/")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("applies only the latest file request when responses resolve out of order", async () => {
    const pending = []
    global.fetch.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    const app = makeApp({ autosave })

    const loadB = app.loadFile("b.md")
    const loadC = app.loadFile("c.md")
    await vi.waitFor(() => expect(pending).toHaveLength(2))

    pending[1].resolve(response({ json: { content: "content C", revision: "revision-C" } }))
    await loadC
    pending[0].resolve(response({ json: { content: "content B", revision: "revision-B" } }))
    await loadB

    expect(app.currentFile).toBe("c.md")
    expect(app.showEditor).toHaveBeenCalledTimes(1)
    expect(app.showEditor).toHaveBeenCalledWith("content C", "markdown", "revision-C")
    expect(app.updateUrl).toHaveBeenCalledTimes(1)
    expect(app.updateUrl).toHaveBeenCalledWith("c.md")
    expect(autosave.prepareForTransition).toHaveBeenCalledTimes(1)
  })

  it("ignores stale 404 and error responses without changing visible state or URL", async () => {
    const pending = []
    global.fetch.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    const app = makeApp({ autosave })
    const stale404 = app.loadFile("missing.md")
    const staleError = app.loadFile("broken.md")
    const current = app.loadFile("c.md")
    await vi.waitFor(() => expect(pending).toHaveLength(3))

    pending[0].resolve(response({ ok: false, status: 404 }))
    await stale404
    pending[1].reject(new Error("network failed"))
    await staleError
    pending[2].resolve(response({ json: { content: "content C", revision: "revision-C" } }))
    await current

    expect(app.currentFile).toBe("c.md")
    expect(app.showFileNotFoundMessage).not.toHaveBeenCalled()
    expect(app.showEditor).toHaveBeenCalledTimes(1)
    expect(app.updateUrl).toHaveBeenCalledTimes(1)
  })

  it("does not apply a delayed tree response after another file is deleted", async () => {
    const pending = []
    global.fetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const app = makeApp()
    app.refreshTree = AppController.prototype.refreshTree

    const refresh = app.refreshTree(0)
    await vi.waitFor(() => expect(pending).toHaveLength(1))

    // Turbo invalidates pending refreshes before it applies the mutation stream.
    app.invalidateTreeRefreshesForStream({
      target: { getAttribute: () => "file-tree-content" }
    })
    app.fileTreeTarget.innerHTML = "tree after delete"
    app.onFileDeleted({ detail: { path: "other.md", type: "file" } })
    pending[0](response({ text: "stale tree before delete" }))
    await refresh

    expect(app.fileTreeTarget.innerHTML).toBe("tree after delete")
  })

  it("keeps the current editor and URL when the outgoing draft cannot be stored", async () => {
    global.fetch.mockResolvedValue(response({ json: { content: "content B", revision: "revision-B" } }))
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: false, error: new Error("storage full") })) }
    const app = makeApp({ autosave })
    window.history.replaceState({ file: "a.md" }, "", "/notes/a.md")

    await app.loadFile("b.md")

    expect(autosave.prepareForTransition).toHaveBeenCalledOnce()
    expect(app.currentFile).toBe("a.md")
    expect(app.showEditor).not.toHaveBeenCalled()
    expect(app.updatePathDisplay).not.toHaveBeenCalled()
    expect(app.updateUrl).not.toHaveBeenCalled()
  })

  it("restores the current URL when a browser history transition cannot flush the draft", async () => {
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: false, error: new Error("storage full") })) }
    const app = makeApp({ autosave })
    app.getFilePathFromUrl = vi.fn(() => null)
    AppController.prototype.setupHistoryHandling.call(app)

    await app.boundPopstateHandler({ state: null })
    window.removeEventListener("popstate", app.boundPopstateHandler)

    expect(app.currentFile).toBe("a.md")
    expect(app.updateUrl).toHaveBeenCalledWith("a.md", { replace: true })
    expect(app.editorPlaceholderTarget.classList.remove).not.toHaveBeenCalled()
  })

  it("routes initial server-provided note data through the guarded transition", () => {
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    const app = makeApp({ currentFile: null, autosave })
    app.hasInitialNoteValue = true
    app.initialNoteValue = {
      path: "initial.md",
      content: "initial content",
      revision: "initial-revision",
      exists: true
    }

    AppController.prototype.handleInitialFile.call(app)

    expect(autosave.prepareForTransition).toHaveBeenCalledOnce()
    expect(app.currentFile).toBe("initial.md")
    expect(app.showEditor).toHaveBeenCalledWith("initial content", "markdown", "initial-revision")
    expect(app.refreshTree).toHaveBeenCalledWith(1)
  })

  it("waits for app setup before handling an already-connected CodeMirror outlet", () => {
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    const app = makeApp({ currentFile: null, autosave })
    app.hasInitialNoteValue = true
    app.initialNoteValue = {
      path: "studies/design-systems-stack.md",
      content: "# Design Systems Stack",
      revision: "initial-revision",
      exists: true
    }
    app.expandParentFolders = AppController.prototype.expandParentFolders
    app.expandedFolders = undefined
    app._removeSplashScreen = vi.fn()

    expect(() => AppController.prototype.codemirrorOutletConnected.call(app)).not.toThrow()
    expect(app.currentFile).toBeNull()

    app.installUnauthorizedRedirect = vi.fn()
    app.setupKeyboardShortcuts = vi.fn()
    app.setupDialogClickOutside = vi.fn()
    app.applySidebarVisibility = vi.fn()
    app.initializeTypewriterMode = vi.fn()
    app.setupConfigFileListener = vi.fn()
    app.setupTableEditorListener = vi.fn()
    app.setupHistoryHandling = vi.fn()
    app._preloadInitialContent = vi.fn()

    AppController.prototype.connect.call(app)
    expect(app._initializationReady).toBe(true)
    expect(app.expandedFolders).toEqual(new Set())

    AppController.prototype.codemirrorOutletConnected.call(app)

    expect(app.currentFile).toBe("studies/design-systems-stack.md")
    expect(app.expandedFolders).toEqual(new Set(["studies"]))
    expect(app.showEditor).toHaveBeenCalledWith("# Design Systems Stack", "markdown", "initial-revision")
    expect(app._removeSplashScreen).toHaveBeenCalledOnce()
  })
})
