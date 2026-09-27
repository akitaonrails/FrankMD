/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller"

function response({ ok = true, status = 200, json = {}, text = "" } = {}) {
  return {
    ok,
    status,
    statusCode: status,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(text)
  }
}

function makeApp({ currentFile = "a.md", autosave = null, codemirror = null } = {}) {
  const app = Object.create(AppController.prototype)
  Object.assign(app, {
    currentFile,
    currentFileType: "markdown",
    createdNoteBoundaries: new Map(),
    expandedFolders: new Set(),
    _navigationGeneration: 0,
    _treeRevision: 0,
    _treeRefreshGeneration: 0,
    _fileNotFoundTimeout: null,
    getAutosaveController: () => autosave,
    getCodemirrorController: () => codemirror,
    getFileType: AppController.prototype.getFileType,
    updatePathDisplay: vi.fn(),
    expandParentFolders: vi.fn(),
    showEditor: vi.fn(),
    updateUrl: vi.fn(),
    refreshTree: vi.fn(),
    fileTreeTarget: { innerHTML: "initial tree" },
    showFileNotFoundMessage: vi.fn(),
    showTemporaryMessage: vi.fn(),
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
    window.confirm = vi.fn(() => true)
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

  it("records a created note's exact server baseline and the previously active note", async () => {
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    const templateContent = "---\ntitle: Server generated title\ndate: 2026-09-25\n---\n\nGenerated body\n"
    global.fetch.mockResolvedValue(response({
      json: { content: templateContent, revision: "server-revision" }
    }))
    const app = makeApp({ currentFile: "notes/before.md", autosave })

    await app.onFileCreated({ detail: { path: "posts/generated.md" } })

    expect(app.createdNoteBoundaries.get("posts/generated.md")).toEqual({
      path: "posts/generated.md",
      initialContent: templateContent,
      initialRevision: "server-revision",
      previousPath: "notes/before.md"
    })
    expect(app.currentFile).toBe("posts/generated.md")
  })

  it("remaps file creation boundaries and editor paths after a rename", () => {
    const codemirror = { remapHistoryPaths: vi.fn() }
    const app = makeApp({ currentFile: "old.md", codemirror })
    const renamedBoundary = {
      path: "old.md",
      initialContent: "old baseline",
      initialRevision: "old-revision",
      previousPath: "before.md"
    }
    const dependentBoundary = {
      path: "created.md",
      initialContent: "created baseline",
      initialRevision: "created-revision",
      previousPath: "old.md"
    }
    const staleDestinationBoundary = {
      path: "renamed.md",
      initialContent: "stale baseline",
      initialRevision: "stale-revision",
      previousPath: null,
      deleted: true
    }
    app.createdNoteBoundaries.set(renamedBoundary.path, renamedBoundary)
    app.createdNoteBoundaries.set(dependentBoundary.path, dependentBoundary)
    app.createdNoteBoundaries.set(staleDestinationBoundary.path, staleDestinationBoundary)

    app.onFileRenamed({ detail: { oldPath: "old.md", newPath: "renamed.md", type: "file" } })

    expect(codemirror.remapHistoryPaths).toHaveBeenCalledWith("old.md", "renamed.md", "file")
    expect(app.currentFile).toBe("renamed.md")
    expect(app.createdNoteBoundaries.has("old.md")).toBe(false)
    expect(app.createdNoteBoundaries.get("renamed.md")).toBe(renamedBoundary)
    expect(app.createdNoteBoundaries.has("renamed.md")).toBe(true)
    expect(Array.from(app.createdNoteBoundaries.values())).not.toContain(staleDestinationBoundary)
    expect(renamedBoundary.path).toBe("renamed.md")
    expect(dependentBoundary.previousPath).toBe("renamed.md")
  })

  it("remaps folder descendants and boundary predecessor paths after a move", () => {
    const codemirror = { remapHistoryPaths: vi.fn() }
    const app = makeApp({ currentFile: "old-folder/nested/open.md", codemirror })
    const nestedBoundary = {
      path: "old-folder/nested/created.md",
      initialContent: "nested baseline",
      initialRevision: "nested-revision",
      previousPath: "old-folder/before.md"
    }
    const externalBoundary = {
      path: "outside.md",
      initialContent: "outside baseline",
      initialRevision: "outside-revision",
      previousPath: "old-folder/nested/created.md"
    }
    app.createdNoteBoundaries.set(nestedBoundary.path, nestedBoundary)
    app.createdNoteBoundaries.set(externalBoundary.path, externalBoundary)

    app.onItemMoved({ detail: { oldPath: "old-folder", newPath: "new-folder", type: "folder" } })

    expect(codemirror.remapHistoryPaths).toHaveBeenCalledWith("old-folder", "new-folder", "folder")
    expect(app.currentFile).toBe("new-folder/nested/open.md")
    expect(app.createdNoteBoundaries.has("old-folder/nested/created.md")).toBe(false)
    expect(app.createdNoteBoundaries.get("new-folder/nested/created.md")).toBe(nestedBoundary)
    expect(nestedBoundary.path).toBe("new-folder/nested/created.md")
    expect(nestedBoundary.previousPath).toBe("new-folder/before.md")
    expect(externalBoundary.previousPath).toBe("new-folder/nested/created.md")
  })

  it("evicts ordinary deletion history and boundaries for the deleted subtree", () => {
    const codemirror = { evictHistoryPaths: vi.fn() }
    const app = makeApp({ currentFile: "outside.md", codemirror })
    const deletedBoundary = {
      path: "deleted-folder/created.md",
      previousPath: "outside.md"
    }
    const anchoredBoundary = {
      path: "other-created.md",
      previousPath: "deleted-folder/predecessor.md"
    }
    const unrelatedBoundary = {
      path: "another-created.md",
      previousPath: "other.md"
    }
    app.createdNoteBoundaries.set(deletedBoundary.path, deletedBoundary)
    app.createdNoteBoundaries.set(anchoredBoundary.path, anchoredBoundary)
    app.createdNoteBoundaries.set(unrelatedBoundary.path, unrelatedBoundary)

    app.onFileDeleted({ detail: { path: "deleted-folder", type: "folder" } })

    expect(codemirror.evictHistoryPaths).toHaveBeenCalledWith("deleted-folder", "folder")
    expect(app.createdNoteBoundaries.has(deletedBoundary.path)).toBe(false)
    expect(anchoredBoundary.previousPath).toBeNull()
    expect(app.createdNoteBoundaries.get(anchoredBoundary.path)).toBe(anchoredBoundary)
    expect(unrelatedBoundary.previousPath).toBe("other.md")
  })

  it("does not record a creation boundary when its note load becomes stale", async () => {
    const pending = []
    global.fetch.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    const app = makeApp({ currentFile: "before.md", autosave })

    const createdLoad = app.onFileCreated({ detail: { path: "new.md" } })
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const laterLoad = app.loadFile("later.md")
    await vi.waitFor(() => expect(pending).toHaveLength(2))

    pending[0](response({ json: { content: "new note", revision: "new-revision" } }))
    await createdLoad
    expect(app.createdNoteBoundaries.has("new.md")).toBe(false)

    pending[1](response({ json: { content: "later note", revision: "later-revision" } }))
    await laterLoad
    expect(app.currentFile).toBe("later.md")
  })

  it("does not record a creation boundary without both server content and revision", async () => {
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    global.fetch.mockResolvedValue(response({ json: { content: "generated content" } }))
    const app = makeApp({ currentFile: "before.md", autosave })

    await app.onFileCreated({ detail: { path: "generated.md" } })

    expect(app.currentFile).toBe("generated.md")
    expect(app.createdNoteBoundaries.has("generated.md")).toBe(false)
  })

  it("does not record a creation boundary when the new note cannot be loaded", async () => {
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    global.fetch.mockResolvedValue(response({ ok: false, status: 404 }))
    const app = makeApp({ currentFile: "before.md", autosave })

    await app.onFileCreated({ detail: { path: "missing.md" } })

    expect(app.createdNoteBoundaries.has("missing.md")).toBe(false)
  })

  it("confirms and deletes a created note with autosave's latest known revision, then opens its predecessor", async () => {
    const autosave = {
      prepareForFileDeletion: vi.fn().mockResolvedValue({ ok: true, revision: "latest-own-save" }),
      resumeAfterTransition: vi.fn(),
      deleteFile: vi.fn(() => ({ ok: true }))
    }
    const releaseEditorLock = vi.fn()
    const codemirror = {
      getValue: vi.fn(() => "created baseline"),
      acquireReadOnlyLock: vi.fn(() => releaseEditorLock),
      evictHistoryPaths: vi.fn()
    }
    global.fetch
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ json: { content: "previous content", revision: "previous-revision" } }))
    const app = makeApp({ currentFile: "created.md", autosave, codemirror })
    const dialog = document.createElement("dialog")
    dialog.showModal = vi.fn()
    const messageTarget = document.createElement("p")
    app.undoCreatedNoteDialogTarget = dialog
    app.undoCreatedNoteMessageTarget = messageTarget
    window.t.mockImplementation((key, options = {}) => key === "confirm.undo_created_note"
      ? `Undoing creation will delete \"${options.name}\". You can redo it during this session.`
      : key)
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      initialRevision: "creation-revision",
      previousPath: "previous.md"
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)

    expect(app.onUndoAtHistoryStart("created.md")).toBe(true)
    expect(dialog.showModal).toHaveBeenCalledOnce()
    expect(messageTarget.textContent).toBe(
      'Undoing creation will delete "created.md". You can redo it during this session.'
    )
    const highlightedFilename = messageTarget.querySelector(".confirm-dialog__filename")
    expect(highlightedFilename.textContent).toBe("created.md")
    expect(highlightedFilename.className).toContain("confirm-dialog__filename")
    dialog.returnValue = "confirm"
    dialog.dispatchEvent(new Event("close"))
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(app.currentFile).toBe("previous.md"))

    expect(window.confirm).not.toHaveBeenCalled()
    expect(autosave.prepareForFileDeletion).toHaveBeenCalledWith("created.md")
    expect(codemirror.acquireReadOnlyLock).toHaveBeenCalledOnce()
    expect(releaseEditorLock).toHaveBeenCalledOnce()
    expect(global.fetch.mock.calls[0][0]).toBe("/notes/created.md?expected_revision=latest-own-save")
    expect(global.fetch.mock.calls[0][1].method).toBe("DELETE")
    expect(boundary.deleted).toBe(true)
    expect(app.createdNoteBoundaries.get("created.md")).toBe(boundary)
    expect(codemirror.evictHistoryPaths).not.toHaveBeenCalled()
    expect(autosave.deleteFile).toHaveBeenCalledWith("created.md", "file")
    expect(app.updateUrl).toHaveBeenCalledWith("previous.md", { replace: true })
  })

  it("does nothing when the user cancels the created-note deletion prompt", async () => {
    const autosave = { prepareForFileDeletion: vi.fn() }
    const codemirror = {
      getValue: vi.fn(() => "created baseline"),
      acquireReadOnlyLock: vi.fn()
    }
    const app = makeApp({ currentFile: "created.md", autosave, codemirror })
    const dialog = document.createElement("dialog")
    dialog.showModal = vi.fn()
    app.undoCreatedNoteDialogTarget = dialog
    app.undoCreatedNoteMessageTarget = document.createElement("p")
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      initialRevision: "creation-revision",
      previousPath: "previous.md"
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)

    expect(app.onUndoAtHistoryStart("created.md")).toBe(true)
    dialog.returnValue = "cancel"
    dialog.dispatchEvent(new Event("close"))
    await vi.waitFor(() => expect(app._pendingCreatedNoteUndo.size).toBe(0))

    expect(autosave.prepareForFileDeletion).not.toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(codemirror.acquireReadOnlyLock).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(boundary.deleted).toBeUndefined()
    expect(app.currentFile).toBe("created.md")
  })

  it("closes the created-note prompt from the shared dialog header", async () => {
    const app = makeApp({
      currentFile: "created.md",
      autosave: { prepareForFileDeletion: vi.fn() },
      codemirror: { getValue: vi.fn(() => "created baseline") }
    })
    const dialog = document.createElement("dialog")
    dialog.showModal = vi.fn()
    dialog.close = vi.fn((returnValue) => {
      dialog.returnValue = returnValue
      dialog.dispatchEvent(new Event("close"))
    })
    app.undoCreatedNoteDialogTarget = dialog
    app.undoCreatedNoteMessageTarget = document.createElement("p")
    app.createdNoteBoundaries.set("created.md", {
      path: "created.md",
      initialContent: "created baseline",
      initialRevision: "creation-revision",
      previousPath: "previous.md"
    })

    app.onUndoAtHistoryStart("created.md")
    app.closeUndoCreatedNoteDialog()
    await vi.waitFor(() => expect(app._pendingCreatedNoteUndo.size).toBe(0))

    expect(dialog.close).toHaveBeenCalledWith("cancel")
    expect(window.confirm).not.toHaveBeenCalled()
    expect(app.currentFile).toBe("created.md")
  })

  it("does not intercept exhausted undo for an ordinary note or non-baseline content", () => {
    const codemirror = { getValue: vi.fn(() => "edited content") }
    const app = makeApp({ currentFile: "ordinary.md", codemirror })
    app.createdNoteBoundaries.set("created.md", {
      path: "created.md",
      initialContent: "created baseline",
      initialRevision: "creation-revision",
      previousPath: "ordinary.md"
    })

    expect(app.onUndoAtHistoryStart("ordinary.md")).toBe(false)
    app.currentFile = "created.md"
    expect(app.onUndoAtHistoryStart("created.md")).toBe(false)

    expect(window.confirm).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("retains the creation boundary and resumes autosave if guarded deletion conflicts", async () => {
    const autosave = {
      prepareForFileDeletion: vi.fn().mockResolvedValue({ ok: true, revision: "latest-own-save" }),
      resumeAfterTransition: vi.fn(),
      deleteFile: vi.fn()
    }
    const releaseEditorLock = vi.fn()
    const codemirror = {
      getValue: vi.fn(() => "created baseline"),
      acquireReadOnlyLock: vi.fn(() => releaseEditorLock)
    }
    global.fetch.mockResolvedValue(response({
      ok: false,
      status: 409,
      json: { error: "revision conflict" }
    }))
    const app = makeApp({ currentFile: "created.md", autosave, codemirror })
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      initialRevision: "creation-revision",
      previousPath: "previous.md"
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)

    app.onUndoAtHistoryStart("created.md")
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(app.showTemporaryMessage).toHaveBeenCalledWith("revision conflict", 5000))

    expect(global.fetch.mock.calls[0][0]).toContain("expected_revision=latest-own-save")
    expect(boundary.deleted).toBeUndefined()
    expect(app.createdNoteBoundaries.get("created.md")).toBe(boundary)
    expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce()
    expect(releaseEditorLock).toHaveBeenCalledOnce()
    expect(autosave.deleteFile).not.toHaveBeenCalled()
    expect(app.currentFile).toBe("created.md")
  })

  it("blocks edits while the guarded deletion drains saves and remains in flight", async () => {
    let resolvePreparation
    let resolveDelete
    let content = "created baseline"
    let readOnly = false
    const releaseLock = vi.fn(() => { readOnly = false })
    const autosave = {
      prepareForFileDeletion: vi.fn(() => new Promise((resolve) => { resolvePreparation = resolve })),
      resumeAfterTransition: vi.fn(),
      deleteFile: vi.fn()
    }
    const codemirror = {
      getValue: vi.fn(() => content),
      acquireReadOnlyLock: vi.fn(() => {
        readOnly = true
        return releaseLock
      }),
      tryUserEdit: (nextContent) => {
        if (!readOnly) content = nextContent
      }
    }
    global.fetch.mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve }))
    const app = makeApp({ currentFile: "created.md", autosave, codemirror })
    const boundary = {
      path: "created.md",
      initialContent: content,
      initialRevision: "creation-revision",
      previousPath: "previous.md"
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)

    app.onUndoAtHistoryStart("created.md")
    await vi.waitFor(() => expect(autosave.prepareForFileDeletion).toHaveBeenCalledOnce())
    expect(readOnly).toBe(true)
    codemirror.tryUserEdit("edit during autosave drain")
    expect(content).toBe("created baseline")

    resolvePreparation({ ok: true, revision: "latest-own-save" })
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
    codemirror.tryUserEdit("edit during DELETE")
    expect(content).toBe("created baseline")

    resolveDelete(response({
      ok: false,
      status: 409,
      json: { error: "revision conflict" }
    }))
    await vi.waitFor(() => expect(releaseLock).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce())

    expect(readOnly).toBe(false)
    expect(content).toBe("created baseline")
    expect(boundary.deleted).toBeUndefined()
    expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce()
    codemirror.tryUserEdit("edit after failed DELETE")
    expect(content).toBe("edit after failed DELETE")
  })

  it("aborts deletion if content changes programmatically while autosave drains", async () => {
    let resolvePreparation
    let content = "created baseline"
    const releaseLock = vi.fn()
    const autosave = {
      prepareForFileDeletion: vi.fn(() => new Promise((resolve) => { resolvePreparation = resolve })),
      resumeAfterTransition: vi.fn()
    }
    const codemirror = {
      getValue: vi.fn(() => content),
      acquireReadOnlyLock: vi.fn(() => releaseLock)
    }
    const app = makeApp({ currentFile: "created.md", autosave, codemirror })
    const boundary = {
      path: "created.md",
      initialContent: content,
      initialRevision: "creation-revision",
      previousPath: null
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)

    app.onUndoAtHistoryStart("created.md")
    await vi.waitFor(() => expect(autosave.prepareForFileDeletion).toHaveBeenCalledOnce())
    content = "programmatic edit during save drain"
    resolvePreparation({ ok: true, revision: "latest-own-save" })
    await vi.waitFor(() => expect(app.showTemporaryMessage).toHaveBeenCalledWith("errors.failed_to_delete", 5000))

    expect(global.fetch).not.toHaveBeenCalled()
    expect(boundary.deleted).toBeUndefined()
    expect(codemirror.getValue()).toBe("programmatic edit during save drain")
    expect(releaseLock).toHaveBeenCalledOnce()
    expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce()
  })

  it("recreates a deleted note from its boundary and reopens it for its remaining redo steps", async () => {
    const autosave = {
      prepareForTransition: vi.fn(() => ({ ok: true })),
      resumeAfterTransition: vi.fn()
    }
    const codemirror = { getValue: vi.fn(() => "previous note") }
    const app = makeApp({ currentFile: "previous.md", autosave, codemirror })
    const boundary = {
      path: "nested/created note.md",
      initialContent: "server generated baseline\n",
      initialRevision: "initial-revision",
      previousPath: "previous.md",
      deleted: true
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)
    global.fetch
      .mockResolvedValueOnce(response({
        status: 201,
        json: { path: boundary.path, message: "created" }
      }))
      .mockResolvedValueOnce(response({
        json: { content: boundary.initialContent, revision: "recreated-revision" }
      }))

    expect(app.onRedoAtHistoryEnd("previous.md")).toBe(true)
    await vi.waitFor(() => expect(app.currentFile).toBe(boundary.path))

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[0][0]).toBe("/notes")
    expect(global.fetch.mock.calls[0][1].method).toBe("POST")
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      path: boundary.path,
      content: boundary.initialContent
    })
    expect(app.showEditor).toHaveBeenCalledWith(boundary.initialContent, "markdown", "recreated-revision")
    expect(app.refreshTree).toHaveBeenCalledWith(1)
    expect(boundary.deleted).toBe(false)
    expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce()
  })

  it.each([
    { key: "z", shiftKey: true },
    { key: "y", shiftKey: false }
  ])("supports root-boundary redo with Ctrl+Shift+Z or Ctrl+Y after undoing creation", async ({ key, shiftKey }) => {
    const autosave = {
      prepareForFileDeletion: vi.fn().mockResolvedValue({ ok: true, revision: "latest-revision" }),
      prepareForTransition: vi.fn(() => ({ ok: true })),
      resumeAfterTransition: vi.fn(),
      deleteFile: vi.fn(() => ({ ok: true }))
    }
    const releaseEditorLock = vi.fn()
    const codemirror = {
      getValue: vi.fn(() => "generated baseline"),
      acquireReadOnlyLock: vi.fn(() => releaseEditorLock)
    }
    const app = makeApp({ currentFile: "root-created.md", autosave, codemirror })
    const boundary = {
      path: "root-created.md",
      initialContent: "generated baseline",
      initialRevision: "creation-revision",
      previousPath: null
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)
    global.fetch
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ status: 201, json: { path: boundary.path } }))
      .mockResolvedValueOnce(response({ json: { content: boundary.initialContent, revision: "recreated-revision" } }))
    app.setupKeyboardShortcuts()

    expect(app.onUndoAtHistoryStart(boundary.path)).toBe(true)
    await vi.waitFor(() => expect(app.currentFile).toBeNull())
    expect(boundary.deleted).toBe(true)
    expect(releaseEditorLock).toHaveBeenCalledOnce()

    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: true,
      shiftKey,
      bubbles: true,
      cancelable: true
    })
    document.body.dispatchEvent(event)
    await vi.waitFor(() => expect(app.currentFile).toBe(boundary.path))

    expect(event.defaultPrevented).toBe(true)
    expect(boundary.deleted).toBe(false)
    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(global.fetch.mock.calls[0][1].method).toBe("DELETE")
    expect(global.fetch.mock.calls[1][1].method).toBe("POST")
    expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce()
    document.removeEventListener("keydown", app.boundKeydownHandler)
    document.removeEventListener("keydown", app.boundRootRedoHandler)
  })

  it("does not route root-boundary redo from an input field", () => {
    const app = makeApp({ currentFile: null, autosave: { prepareForTransition: vi.fn(() => ({ ok: true })) } })
    app.createdNoteBoundaries.set("root-created.md", {
      path: "root-created.md",
      initialContent: "baseline",
      previousPath: null,
      deleted: true
    })
    app.setupKeyboardShortcuts()
    const input = document.createElement("input")
    document.body.append(input)

    const event = new KeyboardEvent("keydown", {
      key: "y",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })
    input.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
    input.remove()
    document.removeEventListener("keydown", app.boundKeydownHandler)
    document.removeEventListener("keydown", app.boundRootRedoHandler)
  })

  it("chooses the newest deleted creation boundary when multiple notes share a predecessor", async () => {
    const autosave = { prepareForTransition: vi.fn(() => ({ ok: true })) }
    const app = makeApp({ currentFile: "previous.md", autosave })
    const olderBoundary = {
      path: "older.md",
      initialContent: "older baseline",
      previousPath: "previous.md",
      deleted: true
    }
    const newerBoundary = {
      path: "newer.md",
      initialContent: "newer baseline",
      previousPath: "previous.md",
      deleted: true
    }
    app.createdNoteBoundaries.set(olderBoundary.path, olderBoundary)
    app.createdNoteBoundaries.set(newerBoundary.path, newerBoundary)
    global.fetch
      .mockResolvedValueOnce(response({ status: 201, json: { path: "newer.md" } }))
      .mockResolvedValueOnce(response({ json: { content: "newer baseline", revision: "revision" } }))

    expect(app.onRedoAtHistoryEnd("previous.md")).toBe(true)
    await vi.waitFor(() => expect(app.currentFile).toBe("newer.md"))

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).path).toBe("newer.md")
    expect(olderBoundary.deleted).toBe(true)
    expect(newerBoundary.deleted).toBe(false)
  })

  it("keeps the boundary deleted and active file unchanged when recreation conflicts", async () => {
    const autosave = {
      prepareForTransition: vi.fn(() => ({ ok: true })),
      resumeAfterTransition: vi.fn()
    }
    const app = makeApp({ currentFile: "previous.md", autosave })
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      previousPath: "previous.md",
      deleted: true
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)
    global.fetch.mockResolvedValueOnce(response({
      ok: false,
      status: 422,
      json: { error: "Destination already exists" }
    }))

    expect(app.onRedoAtHistoryEnd("previous.md")).toBe(true)
    await vi.waitFor(() => expect(app.showTemporaryMessage).toHaveBeenCalledWith("Destination already exists", 5000))

    expect(global.fetch).toHaveBeenCalledOnce()
    expect(boundary.deleted).toBe(true)
    expect(app.currentFile).toBe("previous.md")
    expect(app.showEditor).not.toHaveBeenCalled()
    expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce()
  })

  it("resumes autosave when creation redo throws", async () => {
    const autosave = {
      prepareForTransition: vi.fn(() => ({ ok: true })),
      resumeAfterTransition: vi.fn()
    }
    const app = makeApp({ currentFile: "previous.md", autosave })
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      previousPath: "previous.md",
      deleted: true
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)
    global.fetch.mockRejectedValueOnce(new Error("network failed"))

    expect(app.onRedoAtHistoryEnd("previous.md")).toBe(true)
    await vi.waitFor(() => expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce())

    expect(boundary.deleted).toBe(true)
    expect(app._pendingCreatedNoteRedo.has(boundary.path)).toBe(false)
  })

  it("resumes autosave if preparing the outgoing note for redo throws", () => {
    const autosave = {
      prepareForTransition: vi.fn(() => { throw new Error("draft flush failed") }),
      resumeAfterTransition: vi.fn()
    }
    const app = makeApp({ currentFile: "previous.md", autosave })
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      previousPath: "previous.md",
      deleted: true
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)

    expect(app.onRedoAtHistoryEnd("previous.md")).toBe(true)

    expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(boundary.deleted).toBe(true)
  })

  it("resumes autosave and preserves the user's navigation when redo completes stale", async () => {
    let resolveCreate
    const autosave = {
      prepareForTransition: vi.fn(() => ({ ok: true })),
      resumeAfterTransition: vi.fn()
    }
    const app = makeApp({ currentFile: "previous.md", autosave })
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      previousPath: "previous.md",
      deleted: true
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)
    global.fetch.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))

    expect(app.onRedoAtHistoryEnd("previous.md")).toBe(true)
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
    app.currentFile = "newly-selected.md"
    app._navigationGeneration += 1
    resolveCreate(response({ status: 201, json: { path: boundary.path } }))
    await vi.waitFor(() => expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce())

    expect(app.currentFile).toBe("newly-selected.md")
    expect(boundary.deleted).toBe(false)
    expect(global.fetch).toHaveBeenCalledOnce()
    expect(app._pendingCreatedNoteRedo.has(boundary.path)).toBe(false)
  })

  it("does not delete or hand off if the active navigation changes while autosave drains", async () => {
    let finishPreparation
    const autosave = {
      prepareForFileDeletion: vi.fn(() => new Promise((resolve) => { finishPreparation = resolve })),
      resumeAfterTransition: vi.fn(),
      deleteFile: vi.fn()
    }
    const releaseEditorLock = vi.fn()
    const codemirror = {
      getValue: vi.fn(() => "created baseline"),
      acquireReadOnlyLock: vi.fn(() => releaseEditorLock)
    }
    const app = makeApp({ currentFile: "created.md", autosave, codemirror })
    const boundary = {
      path: "created.md",
      initialContent: "created baseline",
      initialRevision: "creation-revision",
      previousPath: "previous.md"
    }
    app.createdNoteBoundaries.set(boundary.path, boundary)

    app.onUndoAtHistoryStart("created.md")
    await vi.waitFor(() => expect(autosave.prepareForFileDeletion).toHaveBeenCalledOnce())
    app.currentFile = "another.md"
    app._navigationGeneration += 1
    finishPreparation({ ok: true, revision: "latest-own-save" })
    await vi.waitFor(() => expect(autosave.resumeAfterTransition).toHaveBeenCalledOnce())

    expect(global.fetch).not.toHaveBeenCalled()
    expect(releaseEditorLock).toHaveBeenCalledOnce()
    expect(boundary.deleted).toBeUndefined()
    expect(app.currentFile).toBe("another.md")
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
