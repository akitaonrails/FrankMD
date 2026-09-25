/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Application } from "@hotwired/stimulus"
import { undo } from "@codemirror/commands"
import draftStorage from "../../../app/javascript/lib/draft_storage"

// Mock @codemirror/commands before importing the controller
vi.mock("@codemirror/commands", () => ({
  undo: vi.fn()
}))

import AutosaveController from "../../../app/javascript/controllers/autosave_controller"
import RecoveryDiffController from "../../../app/javascript/controllers/recovery_diff_controller"

function ensureLocalStorage() {
  if (typeof globalThis.localStorage !== "undefined" && typeof globalThis.localStorage.clear === "function") return

  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    get length() { return values.size },
    key: (index) => Array.from(values.keys())[index] ?? null
  }
}

describe("AutosaveController — Content Loss Detection", () => {
  let application
  let container
  let controller
  let mockCodemirrorValue = ""
  let visibilityStateDescriptor

  const mockCodemirrorController = {
    getValue: () => mockCodemirrorValue,
    setValue: vi.fn(),
    loadContent: vi.fn((content) => { mockCodemirrorValue = content }),
    focus: vi.fn(),
    getEditorView: vi.fn(() => ({})),
  }

  beforeEach(async () => {
    visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState")
    ensureLocalStorage()
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    })

    // Mock window.t
    window.t = vi.fn().mockReturnValue("")

    // Setup minimal DOM with only the targets needed for autosave
    document.body.innerHTML = `
      <div data-controller="autosave" data-autosave-recovery-diff-outlet='[data-controller~="recovery-diff"]'>
        <div data-autosave-target="contentLossBanner" class="hidden"></div>
        <span data-autosave-target="saveStatus" class="hidden"></span>
        <div data-controller="recovery-diff" data-action="recovery-diff:resolved->autosave#onRecoveryResolved">
          <dialog data-recovery-diff-target="dialog" data-action="cancel->recovery-diff#preventDismiss">
            <div data-recovery-diff-target="serverText"></div>
            <div data-recovery-diff-target="backupText"></div>
            <span data-recovery-diff-target="backupTimestamp"></span>
          </dialog>
        </div>
      </div>
    `

    container = document.querySelector('[data-controller="autosave"]')

    // Setup Stimulus
    application = Application.start()
    application.register("autosave", AutosaveController)
    application.register("recovery-diff", RecoveryDiffController)

    const recoveryDialog = container.querySelector("dialog")
    recoveryDialog.showModal = vi.fn(function() { this.setAttribute("open", "") })
    recoveryDialog.close = vi.fn(function() { this.removeAttribute("open") })

    // Wait for Stimulus to initialize
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller = application.getControllerForElementAndIdentifier(container, "autosave")

    // Override getCodemirrorController to return our mock
    controller.getCodemirrorController = () => mockCodemirrorController

    // Reset mock state
    mockCodemirrorValue = ""
    mockCodemirrorController.setValue.mockClear()
    mockCodemirrorController.loadContent.mockClear()
    undo.mockReset()
    global.fetch.mockClear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    // Clear all timeouts
    if (controller) {
      controller.disconnect()
    }
    vi.restoreAllMocks()
    application.stop()
    if (visibilityStateDescriptor) {
      Object.defineProperty(document, "visibilityState", visibilityStateDescriptor)
    } else {
      delete document.visibilityState
    }
    document.body.innerHTML = ""
    localStorage.clear()
  })

  // Helper to generate a string of a given length
  function makeContent(length) {
    return "x".repeat(length)
  }

  describe("saveNow()", () => {
    it("no warning for small deletion (< 20% or < 50 chars)", async () => {
      controller.setFile("test.md", makeContent(200), "revision-test")
      mockCodemirrorValue = makeContent(180) // 10% loss, 20 chars lost

      await controller.saveNow()

      // Should have called fetch (proceeded with save)
      expect(global.fetch).toHaveBeenCalled()
      // Banner should remain hidden
      const banner = container.querySelector('[data-autosave-target="contentLossBanner"]')
      expect(banner.classList.contains("hidden")).toBe(true)
    })

    it("shows warning for large deletion (> 20% AND > 50 chars)", async () => {
      controller.setFile("test.md", makeContent(300), "revision-test")
      mockCodemirrorValue = "" // 100% loss, 300 chars lost

      await controller.saveNow()

      // Should NOT have called fetch (save blocked)
      expect(global.fetch).not.toHaveBeenCalled()
      // Banner should be visible
      const banner = container.querySelector('[data-autosave-target="contentLossBanner"]')
      expect(banner.classList.contains("hidden")).toBe(false)
      expect(banner.classList.contains("flex")).toBe(true)
      expect(controller._contentLossWarningActive).toBe(true)
      expect(draftStorage.readDraft("test.md").draft).toMatchObject({
        content: "",
        baseRevision: "revision-test"
      })
    })

    it("no warning when _contentLossOverride is true", async () => {
      controller.setFile("test.md", makeContent(300), "revision-test")
      mockCodemirrorValue = "" // 100% loss
      controller._contentLossOverride = true

      await controller.saveNow()

      // Should have called fetch despite massive deletion
      expect(global.fetch).toHaveBeenCalled()
    })

    it("no warning when _lastSavedContent is null (fresh file)", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = null
      mockCodemirrorValue = "some new content"

      await controller.saveNow()

      // Should proceed normally with fetch
      expect(global.fetch).toHaveBeenCalled()
    })

    it("resets _contentLossOverride after successful save", async () => {
      controller.setFile("test.md", makeContent(300), "revision-test")
      mockCodemirrorValue = "" // 100% loss
      controller._contentLossOverride = true

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      })

      await controller.saveNow()

      expect(controller._contentLossOverride).toBe(false)
    })
  })

  describe("scheduleAutoSave()", () => {
    it("blocked while warning is active", () => {
      controller._contentLossWarningActive = true
      controller.saveTimeout = null

      controller.scheduleAutoSave()

      // No timeout should have been created
      expect(controller.saveTimeout).toBeNull()
      // But unsaved changes should be tracked
      expect(controller.hasUnsavedChanges).toBe(true)
    })
  })

  describe("browser lifecycle draft flush", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      controller.setFile("lifecycle.md", "server content", "revision-lifecycle")
      mockCodemirrorValue = "local content"
      controller.scheduleAutoSave()
    })

    it("flushes immediately when the document becomes hidden without a server request", () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })

      document.dispatchEvent(new Event("visibilitychange"))

      expect(draftStorage.readDraft("lifecycle.md").draft).toMatchObject({
        content: "local content",
        baseRevision: "revision-lifecycle"
      })
      expect(global.fetch).not.toHaveBeenCalled()
      expect(controller._draftWriteTimeouts.size).toBe(0)
    })

    it("flushes immediately on pagehide without a server request", () => {
      window.dispatchEvent(new Event("pagehide"))

      expect(draftStorage.readDraft("lifecycle.md").draft).toMatchObject({
        content: "local content",
        baseRevision: "revision-lifecycle"
      })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it.each(["visibilitychange", "pagehide"])("flushes a dirty empty draft on %s", (eventName) => {
      mockCodemirrorValue = ""
      if (eventName === "visibilitychange") {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
        document.dispatchEvent(new Event(eventName))
      } else {
        window.dispatchEvent(new Event(eventName))
      }

      expect(draftStorage.readDraft("lifecycle.md").draft).toMatchObject({ content: "" })
    })

    it("does not rewrite an unchanged draft for repeated lifecycle events", () => {
      expect(draftStorage.readDraft("lifecycle.md").draft).toBeNull()
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })

      document.dispatchEvent(new Event("visibilitychange"))
      const firstDraft = draftStorage.readDraft("lifecycle.md").draft
      expect(firstDraft).toMatchObject({
        content: "local content",
        baseRevision: "revision-lifecycle"
      })

      window.dispatchEvent(new Event("pagehide"))

      expect(draftStorage.readDraft("lifecycle.md").draft).toEqual(firstDraft)
    })

    it("shows a storage error and requests a best-effort unload warning when persistence fails", () => {
      const error = new Error("storage quota exceeded")
      vi.spyOn(draftStorage, "writeDraft").mockReturnValue({ ok: false, error })
      vi.spyOn(console, "error").mockImplementation(() => {})
      window.t.mockImplementation((key) => key)
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })

      document.dispatchEvent(new Event("visibilitychange"))
      const beforeUnload = new Event("beforeunload", { cancelable: true })
      window.dispatchEvent(beforeUnload)

      expect(controller.saveStatusTarget.textContent).toBe("status.draft_storage_error")
      expect(controller.saveStatusTarget.classList.contains("text-red-500")).toBe(true)
      expect(beforeUnload.defaultPrevented).toBe(true)

      draftStorage.writeDraft.mockRestore()
      window.dispatchEvent(new Event("pagehide"))

      expect(controller.saveStatusTarget.textContent).toBe("status.unsaved")
      expect(controller._beforeUnloadListenerActive).toBe(false)
    })
  })

  describe("large-deletion warning file scope", () => {
    it("does not let file A's warning block autosave for file B", async () => {
      vi.useFakeTimers()
      controller.setFile("a.md", makeContent(300), "revision-a")
      mockCodemirrorValue = ""
      await controller.saveNow()
      expect(controller._contentLossWarningActive).toBe(true)
      expect(draftStorage.readDraft("a.md").draft.content).toBe("")

      controller.prepareForTransition()
      controller.setFile("b.md", "server B", "revision-b")
      mockCodemirrorValue = "edited B"
      controller.scheduleAutoSave()
      await vi.advanceTimersByTimeAsync(AutosaveController.SAVE_DEBOUNCE_MS)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch.mock.calls[0][0]).toContain("/notes/b.md")
      expect(controller._contentLossWarningActive).toBe(false)
      expect(draftStorage.readDraft("a.md").draft.content).toBe("")
    })

    it("does not reuse save-anyway approval for a later editor snapshot", async () => {
      controller.setFile("a.md", makeContent(300), "revision-a")
      mockCodemirrorValue = ""
      controller._contentLossOverride = true
      mockCodemirrorValue = makeContent(100)

      await controller.saveNow()

      expect(global.fetch).not.toHaveBeenCalled()
      expect(controller._contentLossWarningActive).toBe(true)
      expect(draftStorage.readDraft("a.md").draft.content).toBe(makeContent(100))
    })

    it("recomputes the warning when a protected draft is restored against its baseline", () => {
      const baseline = makeContent(300)
      draftStorage.writeDraft("a.md", "", "revision-a")

      controller.setFile("a.md", baseline, "revision-a")
      expect(controller.recoverDraft(baseline, "revision-a")).toBe("")

      expect(controller._contentLossWarningActive).toBe(true)
      expect(container.querySelector('[data-autosave-target="contentLossBanner"]').classList.contains("hidden")).toBe(false)
    })

    it("recomputes a divergent recovered draft against the latest server baseline", () => {
      const latestBaseline = makeContent(300)
      const draft = draftStorage.writeDraft("a.md", "", "old-revision").draft
      controller.setFile("a.md", latestBaseline, "latest-revision")
      controller.recoverDraft(latestBaseline, "latest-revision")

      controller.onRecoveryResolved({
        detail: {
          source: "draft",
          content: "",
          draftRevision: draft.draftRevision
        }
      })

      expect(controller._contentLossWarningActive).toBe(true)
      expect(draftStorage.readDraft("a.md").draft).toMatchObject({
        content: "",
        baseRevision: "latest-revision"
      })
    })

    it("undo clears the saved draft when it restores the server baseline", async () => {
      const baseline = makeContent(300)
      controller.setFile("a.md", baseline, "revision-a")
      mockCodemirrorValue = ""
      await controller.saveNow()
      expect(draftStorage.readDraft("a.md").draft).not.toBeNull()

      undo.mockImplementation(() => {
        mockCodemirrorValue = baseline
        return true
      })
      controller.undoContentLoss()

      expect(controller._contentLossWarningActive).toBe(false)
      expect(draftStorage.readDraft("a.md").draft).toBeNull()
    })

    it("undo updates the protected draft when the deletion remains large", async () => {
      const baseline = makeContent(300)
      controller.setFile("a.md", baseline, "revision-a")
      mockCodemirrorValue = ""
      await controller.saveNow()

      undo.mockImplementation(() => {
        mockCodemirrorValue = makeContent(100)
        return true
      })
      controller.undoContentLoss()

      expect(controller._contentLossWarningActive).toBe(true)
      expect(draftStorage.readDraft("a.md").draft).toMatchObject({
        content: makeContent(100),
        baseRevision: "revision-a"
      })
    })

    it("restores the server baseline when a recovered deletion has no editor history", async () => {
      const baseline = makeContent(300)
      controller.setFile("a.md", baseline, "revision-a")
      mockCodemirrorValue = makeContent(100)
      const savedDraft = controller.flushDraftWrite("a.md", mockCodemirrorValue, "revision-a")
      controller._draftRevision = savedDraft.draft.draftRevision
      controller.showContentLossWarning()

      undo.mockReturnValue(false)
      controller.undoContentLoss()

      expect(controller.getCodemirrorController().loadContent).toHaveBeenCalledWith(baseline)
      expect(mockCodemirrorValue).toBe(baseline)
      expect(controller._contentLossWarningActive).toBe(false)
      expect(draftStorage.readDraft("a.md").draft).toBeNull()
    })

    it("save anyway removes the matching draft only after success", async () => {
      controller.setFile("a.md", makeContent(300), "revision-a")
      mockCodemirrorValue = ""
      await controller.saveNow()
      const revision = draftStorage.readDraft("a.md").draft.draftRevision

      await controller.saveAnywayAfterWarning()

      expect(draftStorage.removeDraftIfRevision("a.md", revision)).toEqual({ ok: true, removed: false })
      expect(draftStorage.readDraft("a.md").draft).toBeNull()
    })

    it("failed save anyway keeps its local draft", async () => {
      controller.setFile("a.md", makeContent(300), "revision-a")
      mockCodemirrorValue = ""
      await controller.saveNow()
      const savedDraft = draftStorage.readDraft("a.md").draft
      global.fetch.mockResolvedValue({ ok: false })

      await controller.saveAnywayAfterWarning()

      expect(draftStorage.readDraft("a.md").draft.draftRevision).toBe(savedDraft.draftRevision)
    })
  })

  describe("file transition preparation and save scoping", () => {
    it("flushes the outgoing snapshot before cancelling timers without forcing a server save", () => {
      vi.useFakeTimers()
      controller.setFile("a.md", "server A", "revision-a")
      mockCodemirrorValue = "local draft A"
      controller.scheduleAutoSave()
      const saveNow = vi.spyOn(controller, "saveNow")

      const result = controller.prepareForTransition()

      expect(result.ok).toBe(true)
      expect(draftStorage.readDraft("a.md").draft).toMatchObject({
        content: "local draft A",
        baseRevision: "revision-a"
      })
      expect(controller.saveTimeout).toBeNull()
      expect(controller.saveMaxIntervalTimeout).toBeNull()
      expect(saveNow).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("keeps the outgoing file active and does not cancel its save timers when draft storage fails", () => {
      vi.useFakeTimers()
      const error = new Error("storage unavailable")
      vi.spyOn(draftStorage, "writeDraft").mockReturnValue({ ok: false, error })
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("a.md", "server A", "revision-a")
      mockCodemirrorValue = "local draft A"
      controller.scheduleAutoSave()

      const result = controller.prepareForTransition()

      expect(result).toMatchObject({ ok: false, error })
      expect(controller.currentFile).toBe("a.md")
      expect(controller.saveTimeout).not.toBeNull()
      expect(controller.saveMaxIntervalTimeout).not.toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("blocks a dirty transition when the file has no server revision to anchor its draft", () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("a.md", "server A")
      mockCodemirrorValue = "local draft A"

      const result = controller.prepareForTransition()

      expect(result.ok).toBe(false)
      expect(controller.currentFile).toBe("a.md")
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("never lets an autosave scheduled for A read or save B", async () => {
      vi.useFakeTimers()
      controller.setFile("a.md", "server A", "revision-a")
      mockCodemirrorValue = "draft A"
      controller.scheduleAutoSave()

      // Simulate a transition that changed the controller before the old timer
      // callback ran. The snapshot guard must still keep it scoped to A.
      controller.setFile("b.md", "server B", "revision-b")
      mockCodemirrorValue = "draft B"
      await vi.advanceTimersByTimeAsync(AutosaveController.SAVE_DEBOUNCE_MS)

      expect(global.fetch).not.toHaveBeenCalled()
      expect(controller.currentFile).toBe("b.md")
    })

    it("does not require a server save while offline before preparing a transition", () => {
      vi.useFakeTimers()
      controller.isOffline = true
      controller.setFile("a.md", "server A", "revision-a")
      mockCodemirrorValue = "local draft A"
      controller.scheduleAutoSave()
      const saveNow = vi.spyOn(controller, "saveNow")

      const result = controller.prepareForTransition()

      expect(result.ok).toBe(true)
      expect(draftStorage.readDraft("a.md").draft.content).toBe("local draft A")
      expect(saveNow).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("does not apply an in-flight A save response to the active B state", async () => {
      controller.setFile("a.md", "server A", "revision-a")
      mockCodemirrorValue = "draft A"
      let resolveFetch
      global.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve }))
      const savePromise = controller.saveNow()
      await vi.waitFor(() => expect(resolveFetch).toBeDefined())

      controller.setFile("b.md", "server B", "revision-b")
      mockCodemirrorValue = "draft B"
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ revision: "saved-revision-a" })
      })
      await savePromise

      expect(controller.currentFile).toBe("b.md")
      expect(controller._baseRevision).toBe("revision-b")
      expect(controller._lastSavedContent).toBe("server B")
      expect(controller.saveStatusTarget.textContent).toBe("")
    })
  })

  describe("online draft persistence and recovery", () => {
    it("debounces an online empty draft and stores it independently by path", async () => {
      vi.useFakeTimers()
      controller.setFile("empty.md", "server content", "server-revision")
      mockCodemirrorValue = ""

      controller.scheduleAutoSave()
      await vi.advanceTimersByTimeAsync(AutosaveController.DRAFT_DEBOUNCE_MS)

      expect(draftStorage.readDraft("empty.md")).toMatchObject({
        ok: true,
        draft: { path: "empty.md", content: "", baseRevision: "server-revision" }
      })
    })

    it("keeps pending snapshots for different files independent", async () => {
      vi.useFakeTimers()
      controller.setFile("first.md", "first server", "first-revision")
      mockCodemirrorValue = "first draft"
      controller.scheduleDraftWrite()

      controller.setFile("second.md", "second server", "second-revision")
      mockCodemirrorValue = "second draft"
      controller.scheduleDraftWrite()
      await vi.advanceTimersByTimeAsync(AutosaveController.DRAFT_DEBOUNCE_MS)

      expect(draftStorage.readDraft("first.md").draft).toMatchObject({ content: "first draft", baseRevision: "first-revision" })
      expect(draftStorage.readDraft("second.md").draft).toMatchObject({ content: "second draft", baseRevision: "second-revision" })
    })

    it("automatically restores a draft when its server baseline still matches", () => {
      draftStorage.writeDraft("test.md", "local draft", "same-baseline")
      controller.setFile("test.md", "server version", "same-baseline")

      expect(controller.recoverDraft("server version", "same-baseline")).toBe("local draft")
      expect(controller.hasUnsavedChanges).toBe(true)
    })

    it("clears a draft when the server already contains its content", () => {
      const write = draftStorage.writeDraft("test.md", "already saved", "old-baseline")
      controller.setFile("test.md", "already saved", "current-baseline")

      expect(controller.recoverDraft("already saved", "current-baseline")).toBe("already saved")
      expect(draftStorage.removeDraftIfRevision("test.md", write.draft.draftRevision)).toEqual({ ok: true, removed: false })
      expect(draftStorage.readDraft("test.md").draft).toBeNull()
    })

    it("preserves and opens a diverged draft in the recovery workflow", () => {
      const write = draftStorage.writeDraft("test.md", "local draft", "old-baseline")
      const recovery = { open: vi.fn() }
      controller.getRecoveryDiffController = () => recovery
      controller.setFile("test.md", "different server version", "new-baseline")

      expect(controller.recoverDraft("different server version", "new-baseline")).toBe("different server version")
      expect(recovery.open).toHaveBeenCalledWith({
        path: "test.md",
        serverContent: "different server version",
        backupContent: "local draft",
        backupTimestamp: write.draft.updatedAt,
        source: "draft",
        draftRevision: write.draft.draftRevision
      })
      expect(draftStorage.readDraft("test.md").draft.draftRevision).toBe(write.draft.draftRevision)
    })

    it("opens a collision recovery choice and promotes the selected moved draft safely", () => {
      const recovery = { open: vi.fn() }
      controller.getRecoveryDiffController = () => recovery
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("old.md", "source server", "source-revision")
      mockCodemirrorValue = "source local draft"
      const source = draftStorage.writeDraft("old.md", "source local draft", "source-revision").draft
      const destination = draftStorage.writeDraft("new.md", "destination local draft", "destination-revision").draft

      controller.renameFile("old.md", "new.md", "file")
      const conflict = draftStorage.listDraftConflicts("new.md").conflicts[0]

      expect(recovery.open).toHaveBeenCalledWith(expect.objectContaining({
        path: "new.md",
        serverContent: "source server",
        backupContent: "source local draft",
        source: "draft-conflict",
        conflictId: conflict.conflictId
      }))
      expect(draftStorage.readDraft("old.md").draft).toBeNull()
      expect(draftStorage.listDraftConflicts("new.md").conflicts).toContainEqual(expect.objectContaining({
        sourcePath: "old.md",
        content: source.content
      }))
      expect(draftStorage.readDraft("new.md").draft).toEqual(destination)

      controller.resolveDraftConflict({
        path: "new.md",
        conflictId: conflict.conflictId,
        draftRevision: conflict.draftRevision,
        content: conflict.content,
        accepted: true
      })

      expect(draftStorage.readDraft("new.md").draft.content).toBe("source local draft")
      expect(draftStorage.readDraft("old.md").draft).toBeNull()
      expect(draftStorage.listDraftConflicts("new.md").conflicts).toEqual([
        expect.objectContaining({
          sourcePath: "new.md",
          content: "destination local draft",
          draftRevision: destination.draftRevision
        })
      ])
      expect(controller._draftBlockedPaths.has("new.md")).toBe(false)
    })

    it("keeps the destination draft as a recovery copy when the user chooses the server version", () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("old.md", "source server", "source-revision")
      mockCodemirrorValue = "source local draft"
      const source = draftStorage.writeDraft("old.md", "source local draft", "source-revision").draft
      const destination = draftStorage.writeDraft("new.md", "destination local draft", "destination-revision").draft
      controller.renameFile("old.md", "new.md", "file")
      const conflict = draftStorage.listDraftConflicts("new.md").conflicts[0]

      controller.onRecoveryResolved({ detail: {
        source: "server",
        path: "new.md",
        serverContent: "source server",
        conflictId: conflict.conflictId,
        draftRevision: conflict.draftRevision
      } })

      expect(mockCodemirrorController.setValue).toHaveBeenCalledWith("source server")
      expect(draftStorage.readDraft("old.md").draft).toBeNull()
      expect(draftStorage.readDraft("new.md").draft).toBeNull()
      expect(draftStorage.listDraftConflicts("new.md").conflicts).toEqual([
        expect.objectContaining({
          content: "destination local draft",
          draftRevision: destination.draftRevision
        })
      ])
      expect(draftStorage.listDraftConflicts("new.md").conflicts[0].draftRevision).not.toBe(source.draftRevision)
    })

    it("keeps a divergent draft recoverable after Escape is canceled and an edit schedules autosave", async () => {
      vi.useFakeTimers()
      const original = draftStorage.writeDraft("test.md", "original divergent draft", "old-baseline")
      controller.setFile("test.md", "server version", "new-baseline")

      expect(controller.recoverDraft("server version", "new-baseline")).toBe("server version")

      const dialog = container.querySelector("dialog")
      expect(dialog.open).toBe(true)
      const cancelEvent = new Event("cancel", { cancelable: true })
      dialog.dispatchEvent(cancelEvent)

      expect(cancelEvent.defaultPrevented).toBe(true)
      expect(dialog.open).toBe(true)

      mockCodemirrorValue = "edit after attempted dismissal"
      controller.scheduleAutoSave()
      await vi.advanceTimersByTimeAsync(AutosaveController.SAVE_DEBOUNCE_MS + AutosaveController.DRAFT_DEBOUNCE_MS)

      expect(global.fetch).not.toHaveBeenCalled()
      expect(draftStorage.readDraft("test.md").draft).toMatchObject({
        content: "original divergent draft",
        baseRevision: "old-baseline",
        draftRevision: original.draft.draftRevision
      })
    })

    it("prefers a draft over a stale legacy backup and removes the superseded backup", () => {
      const write = draftStorage.writeDraft("test.md", "new draft", "baseline")
      localStorage.setItem("frankmd:backup:test.md", JSON.stringify({ content: "old backup", timestamp: write.draft.updatedAt - 1 }))
      controller.setFile("test.md", "server", "baseline")

      expect(controller.recoverDraft("server", "baseline")).toBe("new draft")
      expect(localStorage.getItem("frankmd:backup:test.md")).toBeNull()
    })

    it("opens a newer, different legacy backup for an explicit recovery choice", () => {
      const write = draftStorage.writeDraft("test.md", "draft", "baseline")
      const backup = { content: "newer backup", timestamp: write.draft.updatedAt + 1 }
      localStorage.setItem("frankmd:backup:test.md", JSON.stringify(backup))
      const recovery = { open: vi.fn() }
      controller.getRecoveryDiffController = () => recovery
      controller.setFile("test.md", "server", "baseline")

      controller.recoverDraft("server", "baseline")

      expect(recovery.open).toHaveBeenCalledWith({
        path: "test.md",
        serverContent: "server",
        backupContent: "newer backup",
        backupTimestamp: backup.timestamp,
        source: "backup",
        draftRevision: write.draft.draftRevision
      })
      expect(draftStorage.readDraft("test.md").draft.draftRevision).toBe(write.draft.draftRevision)
    })

    it("reports draft storage failures through the save status", async () => {
      vi.useFakeTimers()
      const error = new Error("storage unavailable")
      vi.spyOn(draftStorage, "writeDraft").mockReturnValue({ ok: false, error })
      window.t.mockImplementation((key) => key)
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("test.md", "server", "baseline")
      mockCodemirrorValue = "local edit"

      controller.scheduleDraftWrite()
      await vi.advanceTimersByTimeAsync(AutosaveController.DRAFT_DEBOUNCE_MS)

      expect(controller.saveStatusTarget.textContent).toBe("status.draft_storage_error")
      expect(controller.saveStatusTarget.classList.contains("text-red-500")).toBe(true)
    })

    it("restores an explicitly selected empty draft", () => {
      const write = draftStorage.writeDraft("test.md", "", "old-baseline")
      controller.setFile("test.md", "server content", "current-baseline")

      controller.onRecoveryResolved({
        detail: { source: "draft", content: "", draftRevision: write.draft.draftRevision }
      })

      expect(mockCodemirrorController.setValue).toHaveBeenCalledWith("")
      expect(draftStorage.readDraft("test.md").draft).toMatchObject({ content: "", baseRevision: "current-baseline" })
    })

    it("keeps a newer draft when an earlier save completes", async () => {
      controller.setFile("test.md", "server", "baseline")
      mockCodemirrorValue = "saved snapshot"

      let resolveFetch
      global.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve }))
      const savePromise = controller.saveNow()
      await vi.waitFor(() => expect(resolveFetch).toBeDefined())

      const sentDraft = draftStorage.readDraft("test.md").draft
      mockCodemirrorValue = "newer edit"
      controller.scheduleDraftWrite()
      await new Promise((resolve) => setTimeout(resolve, AutosaveController.DRAFT_DEBOUNCE_MS + 20))
      const newerDraft = draftStorage.readDraft("test.md").draft
      expect(newerDraft.draftRevision).not.toBe(sentDraft.draftRevision)

      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ revision: "saved-revision" })
      })
      await savePromise

      expect(draftStorage.readDraft("test.md").draft).toMatchObject({
        content: "newer edit",
        baseRevision: "saved-revision"
      })
    })
  })

  describe("dismissContentLossWarning()", () => {
    it("hides banner and resets flags", () => {
      // Show the banner first
      controller.showContentLossWarning()
      expect(controller._contentLossWarningActive).toBe(true)

      const banner = container.querySelector('[data-autosave-target="contentLossBanner"]')
      expect(banner.classList.contains("hidden")).toBe(false)

      // Dismiss it
      controller.dismissContentLossWarning()

      expect(banner.classList.contains("hidden")).toBe(true)
      expect(banner.classList.contains("flex")).toBe(false)
      expect(controller._contentLossWarningActive).toBe(false)
      expect(controller._contentLossOverride).toBe(false)
    })
  })

  describe("saveAnywayAfterWarning()", () => {
    it("sets override, dismisses banner, and calls saveNow", async () => {
      controller.setFile("test.md", makeContent(300), "revision-test")
      mockCodemirrorValue = ""

      // Show warning first
      controller.showContentLossWarning()

      const saveNowSpy = vi.spyOn(controller, "saveNow").mockResolvedValue()

      controller.saveAnywayAfterWarning()

      // Banner should be dismissed
      const banner = container.querySelector('[data-autosave-target="contentLossBanner"]')
      expect(banner.classList.contains("hidden")).toBe(true)
      // Override should be set so saveNow bypasses content loss check
      expect(controller._contentLossOverride).toBe(true)
      expect(saveNowSpy).toHaveBeenCalled()
    })
  })

  describe("checkContentRestored()", () => {
    it("auto-dismisses warning when content is restored (e.g. Ctrl+Z)", () => {
      const originalContent = makeContent(300)
      controller._lastSavedContent = originalContent
      controller._contentLossWarningActive = true

      // Show banner
      controller.showContentLossWarning()

      // Simulate content being restored (e.g., user pressed Ctrl+Z)
      controller.checkContentRestored(originalContent)

      // Warning should be auto-dismissed
      expect(controller._contentLossWarningActive).toBe(false)
      const banner = container.querySelector('[data-autosave-target="contentLossBanner"]')
      expect(banner.classList.contains("hidden")).toBe(true)
    })

    it("warning stays if content is still below threshold", () => {
      controller._lastSavedContent = makeContent(300)
      controller._contentLossWarningActive = true

      // Show banner
      controller.showContentLossWarning()

      // Content is still empty
      controller.checkContentRestored("")

      // Warning should remain
      expect(controller._contentLossWarningActive).toBe(true)
      const banner = container.querySelector('[data-autosave-target="contentLossBanner"]')
      expect(banner.classList.contains("hidden")).toBe(false)
    })
  })

  // === Race condition and save concurrency tests ===

  describe("saveNow() — concurrent save guard", () => {
    it("prevents concurrent saves (_isSaving blocks second call)", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "new"

      // Make fetch hang (never resolves) to keep _isSaving true
      let resolveFetch
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise((resolve) => { resolveFetch = resolve })
      )

      // Start first save (will hang at await fetch)
      const savePromise = controller.saveNow()
      expect(controller._isSaving).toBe(true)

      // Second call should be a no-op
      await controller.saveNow()
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Clean up: resolve the hanging fetch
      resolveFetch({ ok: true })
      await savePromise
      expect(controller._isSaving).toBe(false)
    })

    it("clears _isSaving after fetch error", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "new"

      global.fetch = vi.fn().mockRejectedValue(new Error("network error"))

      await controller.saveNow()

      expect(controller._isSaving).toBe(false)
    })

    it("reschedules save if content changed during fetch", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "version1"

      // Fetch resolves, but while it's in flight we'll change the editor content
      let resolveFetch
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise((resolve) => { resolveFetch = resolve })
      )

      const savePromise = controller.saveNow()

      // User types while save is in flight — content changes
      mockCodemirrorValue = "version2"

      // Complete the fetch
      resolveFetch({ ok: true })
      await savePromise

      // Post-save check should detect the change and reschedule
      expect(controller.hasUnsavedChanges).toBe(true)
      expect(controller.saveTimeout).not.toBeNull()
    })

    it("does not reschedule if content unchanged after save", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "new"

      await controller.saveNow()

      // Content didn't change during save
      expect(controller.hasUnsavedChanges).toBe(false)
      expect(controller.saveTimeout).toBeNull()
    })
  })

  // === Offline localStorage backup tests ===

  describe("offline localStorage backup", () => {
    let mockBackupController

    beforeEach(() => {
      mockBackupController = {
        save: vi.fn(),
        check: vi.fn().mockReturnValue(null),
        clear: vi.fn(),
        clearAll: vi.fn()
      }
      controller.getOfflineBackupController = () => mockBackupController
      controller.getRecoveryDiffController = () => null
    })

    it("scheduleOfflineBackup while offline triggers backup (debounced)", async () => {
      controller.currentFile = "test.md"
      controller.isOffline = true
      mockCodemirrorValue = "offline content"

      controller.scheduleOfflineBackup()

      // Backup should NOT be called immediately (debounced)
      expect(mockBackupController.save).not.toHaveBeenCalled()

      // Wait for debounce (1 second)
      await new Promise((resolve) => setTimeout(resolve, 1100))

      expect(mockBackupController.save).toHaveBeenCalledWith("test.md", "offline content")
    })

    it("scheduleOfflineBackup while online does NOT backup", () => {
      controller.currentFile = "test.md"
      controller.isOffline = false
      mockCodemirrorValue = "online content"

      controller.scheduleOfflineBackup()

      // Should not schedule backup when online
      expect(controller._offlineBackupTimeout).toBeNull()
    })

    it("onConnectionLost immediately backs up unsaved content", () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "saved version"
      mockCodemirrorValue = "unsaved version"

      controller.onConnectionLost()

      expect(mockBackupController.save).toHaveBeenCalledWith("test.md", "unsaved version")
    })

    it("onConnectionLost does NOT backup if content unchanged", () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "same content"
      mockCodemirrorValue = "same content"

      controller.onConnectionLost()

      expect(mockBackupController.save).not.toHaveBeenCalled()
    })

    it("saveNow success clears backup", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "new"

      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      await controller.saveNow()

      expect(mockBackupController.clear).toHaveBeenCalledWith("test.md")
    })

    it("checkOfflineBackup with differing backup shows recovery dialog", () => {
      const mockRecoveryController = {
        open: vi.fn()
      }
      controller.getRecoveryDiffController = () => mockRecoveryController
      controller.currentFile = "test.md"

      mockBackupController.check.mockReturnValue({
        content: "backup content",
        timestamp: 1700000000000
      })

      controller.checkOfflineBackup("server content")

      expect(mockBackupController.check).toHaveBeenCalledWith("test.md", "server content")
      expect(mockRecoveryController.open).toHaveBeenCalledWith({
        path: "test.md",
        serverContent: "server content",
        backupContent: "backup content",
        backupTimestamp: 1700000000000,
        source: "backup",
        draftRevision: null
      })
    })

    it("checkOfflineBackup with matching backup does NOT show dialog", () => {
      const mockRecoveryController = {
        open: vi.fn()
      }
      controller.getRecoveryDiffController = () => mockRecoveryController
      controller.currentFile = "test.md"

      // check returns null when content matches (auto-cleared)
      mockBackupController.check.mockReturnValue(null)

      controller.checkOfflineBackup("server content")

      expect(mockRecoveryController.open).not.toHaveBeenCalled()
    })

    it("onRecoveryResolved with 'backup' sets editor content and marks unsaved", () => {
      controller.setFile("test.md", "server content", "server-revision")
      controller.hasUnsavedChanges = false
      const timestamp = Date.now()
      localStorage.setItem("frankmd:backup:test.md", JSON.stringify({ content: "backup content", timestamp }))

      controller.onRecoveryResolved({
        detail: {
          source: "backup",
          content: "backup content",
          backupContent: "backup content",
          backupTimestamp: timestamp
        }
      })

      expect(mockCodemirrorController.setValue).toHaveBeenCalledWith("backup content")
      expect(controller._lastSavedContent).toBe("server content")
      expect(controller.hasUnsavedChanges).toBe(true)
      expect(draftStorage.readDraft("test.md").draft).toMatchObject({ content: "backup content", baseRevision: "server-revision" })
      expect(localStorage.getItem("frankmd:backup:test.md")).toBeNull()
    })

    it("consumes an accepted legacy backup and does not offer it again", () => {
      controller.setFile("test.md", "server content", "server-revision")
      const timestamp = Date.now()
      const backup = { content: "backup content", timestamp }
      localStorage.setItem("frankmd:backup:test.md", JSON.stringify(backup))

      const recoveryElement = container.querySelector('[data-controller~="recovery-diff"]')
      const recoveryController = application.getControllerForElementAndIdentifier(recoveryElement, "recovery-diff")
      controller.getRecoveryDiffController = () => recoveryController
      expect(controller.recoverDraft("server content", "server-revision")).toBe("server content")
      const dialog = recoveryElement.querySelector("dialog")
      expect(dialog.showModal).toHaveBeenCalledTimes(1)

      recoveryController.acceptBackup()

      expect(localStorage.getItem("frankmd:backup:test.md")).toBeNull()
      expect(draftStorage.readDraft("test.md").draft).toMatchObject({
        content: "backup content",
        baseRevision: "server-revision"
      })

      expect(controller.recoverDraft("server content", "server-revision")).toBe("backup content")
      expect(dialog.showModal).toHaveBeenCalledTimes(1)
    })
  })

  describe("offline → in-flight save → online flow", () => {
    it("saves pending changes after reconnection even if in-flight save completed during offline", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "original"
      mockCodemirrorValue = "version1"

      // Start a save that will hang
      let resolveFetch
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise((resolve) => { resolveFetch = resolve })
      )

      const savePromise = controller.saveNow()

      // Connection drops while save is in flight
      controller.onConnectionLost()
      expect(controller.isOffline).toBe(true)

      // User types while offline
      mockCodemirrorValue = "version2"
      controller.scheduleAutoSave() // returns early (offline), but marks unsaved
      expect(controller.hasUnsavedChanges).toBe(true)

      // In-flight save completes during offline
      resolveFetch({ ok: true })
      await savePromise

      // Connection restored
      global.fetch = vi.fn().mockResolvedValue({ ok: true })
      controller.onConnectionRestored()
      expect(controller.isOffline).toBe(false)

      // onConnectionRestored should see hasUnsavedChanges and call saveNow
      // Wait for the save to complete
      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
    })

    it("onConnectionLost clears all pending save timers", () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "new"

      // Create save timers
      controller.scheduleAutoSave()
      expect(controller.saveTimeout).not.toBeNull()
      expect(controller.saveMaxIntervalTimeout).not.toBeNull()

      // Go offline
      controller.onConnectionLost()

      // All timers should be cleared
      expect(controller.saveTimeout).toBeNull()
      expect(controller.saveMaxIntervalTimeout).toBeNull()
      expect(controller.hasUnsavedChanges).toBe(true)
    })

    it("scheduleAutoSave is a no-op while offline", () => {
      controller.isOffline = true
      controller.saveTimeout = null

      controller.scheduleAutoSave()

      expect(controller.saveTimeout).toBeNull()
      expect(controller.hasUnsavedChanges).toBe(true)
    })

    it("saveNow is a no-op while offline", async () => {
      controller.isOffline = true
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "new"

      await controller.saveNow()

      expect(global.fetch).not.toHaveBeenCalled()
      expect(controller.hasUnsavedChanges).toBe(true)
    })

    it("onConnectionRestored triggers saveNow when there are pending changes", async () => {
      controller.currentFile = "test.md"
      controller._lastSavedContent = "old"
      mockCodemirrorValue = "new"
      controller.isOffline = true
      controller.hasUnsavedChanges = true

      const saveNowSpy = vi.spyOn(controller, "saveNow").mockResolvedValue()

      controller.onConnectionRestored()

      expect(controller.isOffline).toBe(false)
      expect(saveNowSpy).toHaveBeenCalled()
    })

    it("onConnectionRestored does NOT save when there are no pending changes", () => {
      controller.currentFile = "test.md"
      controller.isOffline = true
      controller.hasUnsavedChanges = false

      const saveNowSpy = vi.spyOn(controller, "saveNow")

      controller.onConnectionRestored()

      expect(saveNowSpy).not.toHaveBeenCalled()
    })
  })

  describe("file lifecycle changes", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      controller.setFile("foo.md", "saved content")
      mockCodemirrorValue = "edited content"
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("renames a pending autosave without clearing dirty state", async () => {
      controller.setFile("foo.md", "saved content", "revision-foo")
      controller.scheduleAutoSave()

      expect(controller.renameFile("foo.md", "bar.md", "file")).toBe(true)
      expect(controller.currentFile).toBe("bar.md")
      expect(controller._lastSavedContent).toBe("saved content")
      expect(controller.hasUnsavedChanges).toBe(true)

      await vi.advanceTimersByTimeAsync(AutosaveController.SAVE_DEBOUNCE_MS)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch.mock.calls[0][0]).toContain("/notes/bar.md")
      expect(global.fetch.mock.calls[0][0]).not.toContain("/notes/foo.md")
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ content: "edited content" })
      expect(controller.hasUnsavedChanges).toBe(false)
    })

    it("remaps a pending autosave inside a renamed folder", async () => {
      controller.setFile("docs/foo.md", "saved content", "revision-docs")
      controller.scheduleAutoSave()

      expect(controller.renameFile("docs", "archive", "folder")).toBe(true)
      expect(controller.currentFile).toBe("archive/foo.md")
      expect(controller.hasUnsavedChanges).toBe(true)

      await vi.advanceTimersByTimeAsync(AutosaveController.SAVE_DEBOUNCE_MS)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch.mock.calls[0][0]).toContain("/notes/archive/foo.md")
      expect(global.fetch.mock.calls[0][0]).not.toContain("/notes/docs/foo.md")
    })

    it("moves the active local draft before scheduling a save at the renamed path", async () => {
      controller.setFile("foo.md", "saved content", "revision-foo")
      controller.scheduleAutoSave()
      controller.flushDraftWrite("foo.md", "edited content", "revision-foo")
      const original = draftStorage.readDraft("foo.md").draft

      expect(controller.renameFile("foo.md", "bar.md", "file")).toBe(true)

      expect(draftStorage.readDraft("foo.md").draft).toBeNull()
      expect(draftStorage.readDraft("bar.md").draft).toEqual({ ...original, path: "bar.md" })
      expect(controller.currentFile).toBe("bar.md")
      expect(controller.saveTimeout).not.toBeNull()

      await vi.advanceTimersByTimeAsync(AutosaveController.SAVE_DEBOUNCE_MS)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch.mock.calls[0][0]).toContain("/notes/bar.md")
    })

    it("makes a remap failure recoverable and blocks writes until the user resolves it", () => {
      const error = new Error("draft remap failed")
      vi.spyOn(draftStorage, "remapDrafts").mockReturnValue({
        ok: false,
        error,
        sourcePath: "foo.md",
        destinationPath: "bar.md",
        affectedPaths: ["bar.md"]
      })
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("foo.md", "saved content", "revision-foo")
      mockCodemirrorValue = "recoverable local draft"

      expect(controller.renameFile("foo.md", "bar.md", "file")).toBe(true)

      const conflict = draftStorage.listDraftConflicts("bar.md").conflicts[0]
      expect(controller.currentFile).toBe("bar.md")
      expect(conflict).toMatchObject({
        sourcePath: "foo.md",
        content: "recoverable local draft",
        baseRevision: "revision-foo"
      })
      expect(draftStorage.readDraft("foo.md").draft.content).toBe("recoverable local draft")
      expect(controller._draftBlockedPaths.has("bar.md")).toBe(true)
      expect(controller.hasPendingRecovery("bar.md")).toBe(true)

      controller.scheduleAutoSave()
      const blockedWrite = controller.writeDraftSnapshot({
        path: "bar.md",
        content: "later edit",
        baseRevision: "revision-foo"
      })

      expect(blockedWrite.ok).toBe(false)
      expect(controller.saveTimeout).toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()
      expect(draftStorage.listDraftConflicts("bar.md").conflicts).toContainEqual(expect.objectContaining({
        conflictId: conflict.conflictId,
        content: "recoverable local draft"
      }))

      const recoveryElement = container.querySelector('[data-controller~="recovery-diff"]')
      const recoveryController = application.getControllerForElementAndIdentifier(recoveryElement, "recovery-diff")
      recoveryController.acceptBackup()

      expect(draftStorage.readDraft("bar.md").draft.content).toBe("recoverable local draft")
      expect(draftStorage.readDraft("foo.md").draft).toBeNull()
      expect(draftStorage.listDraftConflicts("bar.md").conflicts).toEqual([])
      expect(controller._draftBlockedPaths.has("bar.md")).toBe(false)
      expect(controller.hasPendingRecovery("bar.md")).toBe(false)
      expect(controller.saveTimeout).not.toBeNull()
    })

    it("retains the source draft and retries recovery when fallback storage also fails", () => {
      const remapError = new Error("draft remap failed")
      const preserveError = new Error("recovery storage unavailable")
      vi.spyOn(draftStorage, "remapDrafts").mockReturnValue({
        ok: false,
        error: remapError,
        sourcePath: "foo.md",
        destinationPath: "bar.md",
        affectedPaths: ["bar.md"]
      })
      vi.spyOn(draftStorage, "preserveDraftConflict").mockReturnValueOnce({ ok: false, error: preserveError })
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("foo.md", "saved content", "revision-foo")
      mockCodemirrorValue = "recoverable local draft"

      controller.renameFile("foo.md", "bar.md", "file")

      expect(draftStorage.readDraft("foo.md").draft.content).toBe("recoverable local draft")
      expect(draftStorage.listDraftConflicts("bar.md").conflicts).toEqual([])
      expect(controller._pendingRemapRecoveries.get("bar.md")).toBe("foo.md")
      expect(controller._draftBlockedPaths.has("bar.md")).toBe(true)

      controller.scheduleAutoSave()
      expect(controller.saveTimeout).toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()

      expect(controller.recoverDraft("server content", "revision-foo")).toBe("server content")

      expect(controller._pendingRemapRecoveries.has("bar.md")).toBe(false)
      expect(draftStorage.listDraftConflicts("bar.md").conflicts).toContainEqual(expect.objectContaining({
        sourcePath: "foo.md",
        content: "recoverable local draft"
      }))
      expect(controller.hasPendingRecovery("bar.md")).toBe(true)
    })

    it("does not let a late save response remove the source draft after remap failure", async () => {
      let resolveFetch
      global.fetch = vi.fn().mockImplementation(() => new Promise(resolve => {
        resolveFetch = resolve
      }))
      vi.spyOn(draftStorage, "remapDrafts").mockReturnValue({
        ok: false,
        error: new Error("draft remap failed"),
        sourcePath: "foo.md",
        destinationPath: "bar.md",
        affectedPaths: ["bar.md"]
      })
      vi.spyOn(draftStorage, "preserveDraftConflict").mockReturnValueOnce({
        ok: false,
        error: new Error("recovery storage unavailable")
      })
      vi.spyOn(console, "error").mockImplementation(() => {})
      controller.setFile("foo.md", "saved content", "revision-foo")
      mockCodemirrorValue = "recoverable local draft"
      controller.scheduleAutoSave()
      const savePromise = controller.saveNow()

      controller.renameFile("foo.md", "bar.md", "file")
      resolveFetch({ ok: true, json: () => Promise.resolve({ revision: "new-server-revision" }) })
      await savePromise

      expect(draftStorage.readDraft("foo.md").draft).toMatchObject({
        content: "recoverable local draft",
        baseRevision: "revision-foo"
      })
      expect(draftStorage.listDraftConflicts("bar.md").conflicts).toEqual([])
      expect(controller._pendingRemapRecoveries.get("bar.md")).toBe("foo.md")
      expect(controller.saveTimeout).toBeNull()

      controller.recoverDraft("saved content", "revision-foo")

      expect(draftStorage.listDraftConflicts("bar.md").conflicts).toContainEqual(expect.objectContaining({
        sourcePath: "foo.md",
        content: "recoverable local draft"
      }))
      expect(controller.hasPendingRecovery("bar.md")).toBe(true)
    })

    it("does not overwrite a destination draft collision and blocks local writes there", () => {
      controller.setFile("foo.md", "saved content", "revision-source")
      controller.flushDraftWrite("foo.md", "source edit", "revision-source")
      const source = draftStorage.readDraft("foo.md").draft
      const destination = draftStorage.writeDraft("bar.md", "other note draft", "revision-destination").draft
      vi.spyOn(console, "error").mockImplementation(() => {})
      mockCodemirrorValue = "source edit"

      expect(controller.renameFile("foo.md", "bar.md", "file")).toBe(true)

      expect(controller.currentFile).toBe("bar.md")
      expect(draftStorage.readDraft("foo.md").draft).toBeNull()
      expect(draftStorage.listDraftConflicts("bar.md").conflicts).toContainEqual(expect.objectContaining({
        sourcePath: "foo.md",
        content: source.content
      }))
      expect(draftStorage.readDraft("bar.md").draft).toEqual(destination)
      expect(controller._draftBlockedPaths.has("bar.md")).toBe(true)
      expect(controller.saveTimeout).toBeNull()
      expect(controller.writeDraftSnapshot({ path: "bar.md", content: "new edit", baseRevision: "revision-source" }).ok).toBe(false)
      expect(draftStorage.readDraft("bar.md").draft).toEqual(destination)
    })

    it("does not remap a path that only shares a folder prefix", () => {
      controller.setFile("docs-old/foo.md", "saved content")

      expect(controller.renameFile("docs", "archive", "folder")).toBe(false)
      expect(controller.currentFile).toBe("docs-old/foo.md")
    })

    it("clears a pending autosave when the note is deleted", async () => {
      controller.scheduleAutoSave()

      expect(controller.deleteFile("foo.md", "file")).toMatchObject({ ok: true })
      expect(controller.currentFile).toBeNull()
      expect(controller.saveTimeout).toBeNull()
      expect(controller.saveMaxIntervalTimeout).toBeNull()
      expect(controller.hasUnsavedChanges).toBe(false)

      await vi.advanceTimersByTimeAsync(AutosaveController.SAVE_DEBOUNCE_MS)

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("removes file drafts and legacy backups after a successful deletion", () => {
      controller.setFile("foo.md", "saved content", "revision-foo")
      draftStorage.writeDraft("foo.md", "edited content", "revision-foo")
      draftStorage.writeBackup("foo.md", "offline content")

      expect(controller.deleteFile("foo.md", "file")).toMatchObject({ ok: true, removed: 2 })
      expect(controller.currentFile).toBeNull()
      expect(draftStorage.readDraft("foo.md").draft).toBeNull()
      expect(draftStorage.readBackup("foo.md").backup).toBeNull()
    })

    it("clears active state even when local deletion cleanup fails", () => {
      controller.setFile("foo.md", "saved content", "revision-foo")
      const error = new Error("storage unavailable")
      vi.spyOn(draftStorage, "removeDrafts").mockReturnValue({ ok: false, error, removed: 0 })
      vi.spyOn(console, "error").mockImplementation(() => {})

      expect(controller.deleteFile("foo.md", "file")).toMatchObject({ ok: false, error })
      expect(controller.currentFile).toBeNull()
      expect(controller.hasUnsavedChanges).toBe(false)
      expect(controller.saveTimeout).toBeNull()
    })

    it("ignores a late response from a save started before deletion", async () => {
      let resolveFetch
      global.fetch = vi.fn().mockImplementation(() => new Promise((resolve) => {
        resolveFetch = resolve
      }))

      controller.scheduleAutoSave()
      const savePromise = controller.saveNow()
      expect(controller._isSaving).toBe(true)

      controller.deleteFile("foo.md", "file")
      resolveFetch({ ok: true })
      await savePromise

      expect(controller.currentFile).toBeNull()
      expect(controller.hasUnsavedChanges).toBe(false)
      expect(controller._lastSavedContent).toBeNull()
    })

    it("reschedules the renamed note when the old in-flight save fails", async () => {
      let resolveFetch
      global.fetch = vi.fn().mockImplementation(() => new Promise((resolve) => {
        resolveFetch = resolve
      }))

      controller.scheduleAutoSave()
      const savePromise = controller.saveNow()
      controller.renameFile("foo.md", "bar.md", "file")
      resolveFetch({ ok: false })
      await savePromise

      expect(controller.currentFile).toBe("bar.md")
      expect(controller.hasUnsavedChanges).toBe(true)
      expect(controller.saveTimeout).not.toBeNull()
    })

    it("keeps the remapped newer draft when an old-path save response arrives", async () => {
      let resolveFetch
      global.fetch = vi.fn().mockImplementation(() => new Promise((resolve) => {
        resolveFetch = resolve
      }))

      controller.setFile("foo.md", "saved content", "revision-foo")
      controller.scheduleAutoSave()
      const savePromise = controller.saveNow()
      mockCodemirrorValue = "newer edit"
      controller.scheduleAutoSave()
      controller.renameFile("foo.md", "bar.md", "file")
      const movedDraft = draftStorage.readDraft("bar.md").draft

      resolveFetch({ ok: true, json: () => Promise.resolve({ revision: "new-server-revision" }) })
      await savePromise

      expect(controller.currentFile).toBe("bar.md")
      expect(draftStorage.readDraft("foo.md").draft).toBeNull()
      expect(draftStorage.readDraft("bar.md").draft).toEqual(movedDraft)
      expect(movedDraft.content).toBe("newer edit")
      expect(controller.hasUnsavedChanges).toBe(true)
    })
  })
})
