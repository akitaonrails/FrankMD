import { Controller } from "@hotwired/stimulus"
import { patch } from "@rails/request.js"
import { encodePath } from "lib/url_utils"
import draftStorage from "lib/draft_storage"
import { undo } from "@codemirror/commands"

export default class extends Controller {
  static targets = ["contentLossBanner", "saveStatus"]
  static outlets = ["codemirror", "offline-backup", "recovery-diff"]

  // Auto-save configuration
  static SAVE_DEBOUNCE_MS = 2000      // Wait 2 seconds after last keystroke
  static SAVE_MAX_INTERVAL_MS = 30000 // Force save every 30 seconds if continuously typing
  static DRAFT_DEBOUNCE_MS = 300

  connect() {
    this.currentFile = null
    this.saveTimeout = null
    this.saveMaxIntervalTimeout = null
    this.isOffline = false
    this.hasUnsavedChanges = false
    this._isSaving = false
    this._lastSavedContent = null
    this._lastSaveTime = 0
    this._fileVersion = 0
    this._contentLossState = {
      path: null,
      baseRevision: null,
      warningActive: false,
      override: false,
      overrideContent: null
    }
    this._draftPersistenceFailures = new Set()
    this._draftBlockedPaths = new Set()
    this._pendingRemapRecoveries = new Map()
    this._draftStorageErrorVisible = false
    this._offlineBackupTimeout = null
    this._draftWriteTimeouts = new Map()
    this._knownBaseRevisions = new Map()
    this._baseRevision = null
    this._draftRevision = null
    this._saveScheduleGeneration = 0
    this._scheduledSaveSnapshot = null

    this._visibilityChangeHandler = this.handleVisibilityChange.bind(this)
    this._pageHideHandler = this.handlePageHide.bind(this)
    this._beforeUnloadHandler = this.handleBeforeUnload.bind(this)
    this._beforeUnloadListenerActive = false
    document.addEventListener("visibilitychange", this._visibilityChangeHandler)
    window.addEventListener("pagehide", this._pageHideHandler)
    this._pendingRecovery = null
  }

  disconnect() {
    document.removeEventListener("visibilitychange", this._visibilityChangeHandler)
    window.removeEventListener("pagehide", this._pageHideHandler)
    if (this._beforeUnloadListenerActive) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler)
      this._beforeUnloadListenerActive = false
    }
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    if (this.saveMaxIntervalTimeout) clearTimeout(this.saveMaxIntervalTimeout)
    if (this._offlineBackupTimeout) clearTimeout(this._offlineBackupTimeout)
    for (const timeout of this._draftWriteTimeouts.values()) clearTimeout(timeout)
    this._draftWriteTimeouts.clear()
  }

  // === Controller Getters (via Stimulus Outlets) ===

  getCodemirrorController() { return this.codemirrorOutlets[0] ?? null }
  getOfflineBackupController() { return this.offlineBackupOutlets[0] ?? null }
  getRecoveryDiffController() { return this.recoveryDiffOutlets[0] ?? null }

  hasPendingRecovery(path = this.currentFile) {
    return this._pendingRecovery?.path === path
  }

  // === Public API (called by app controller) ===

  currentContentLossState() {
    if (!this._contentLossState ||
      this._contentLossState.path !== this.currentFile ||
      this._contentLossState.baseRevision !== this._baseRevision) {
      this._contentLossState = {
        path: this.currentFile,
        baseRevision: this._baseRevision,
        warningActive: false,
        override: false,
        overrideContent: null
      }
    }
    return this._contentLossState
  }

  get _contentLossWarningActive() {
    return this.currentContentLossState().warningActive
  }

  set _contentLossWarningActive(value) {
    this.currentContentLossState().warningActive = Boolean(value)
  }

  get _contentLossOverride() {
    return this.currentContentLossState().override
  }

  set _contentLossOverride(value) {
    const state = this.currentContentLossState()
    state.override = Boolean(value)
    state.overrideContent = value ? (this.getCodemirrorController()?.getValue() ?? null) : null
  }

  setFile(path, content, revision = null) {
    this.dismissContentLossWarning()
    this.currentFile = path
    this._lastSavedContent = content
    this._baseRevision = typeof revision === "string" && revision ? revision : null
    this._contentLossState = {
      path,
      baseRevision: this._baseRevision,
      warningActive: false,
      override: false,
      overrideContent: null
    }
    this._draftRevision = null
    if (this._baseRevision) this._knownBaseRevisions.set(path, this._baseRevision)
    this.hasUnsavedChanges = false
    this._fileVersion += 1
    this.updateBeforeUnloadListener()
  }

  prepareForTransition() {
    const path = this.currentFile
    if (!path) {
      this.clearPendingTimers()
      return { ok: true, draft: null }
    }

    const codemirrorController = this.getCodemirrorController()
    const content = codemirrorController ? codemirrorController.getValue() : ""
    if (content !== this._lastSavedContent && !this._baseRevision) {
      const error = new Error("Cannot persist the outgoing draft without a server revision")
      this._draftPersistenceFailures.add(path)
      this.updateBeforeUnloadListener()
      this.showDraftStorageError(error)
      return { ok: false, error }
    }
    const result = this.flushDraftWrite(path, content, this._baseRevision)
    if (!result.ok) return result

    // A transition must never let an outgoing save or backup timer inspect the
    // newly active editor. Flush the local draft first, then invalidate timers.
    this.clearPendingTimers()
    return result
  }

  clearFile() {
    this.clearPendingTimers()
    if (this.currentFile) this.clearDraftWriteTimeout(this.currentFile)
    this.currentFile = null
    this._lastSavedContent = null
    this._baseRevision = null
    this._draftRevision = null
    this.hasUnsavedChanges = false
    this._fileVersion += 1
    this.dismissContentLossWarning()
    this.showSaveStatus("")
    this.updateBeforeUnloadListener()
  }

  // Keep autosave attached to a note when its path changes without loading it
  // as a new file. In particular, do not reset the dirty state here: a rename
  // must not make pending editor changes look persisted.
  renameFile(oldPath, newPath, type = "file") {
    const currentPath = this.currentFile
    const remappedPath = this.remapPath(currentPath, oldPath, newPath, type)
    const cm = this.getCodemirrorController()
    const activeDraftFlush = remappedPath !== currentPath
      ? this.flushDraftWrite(currentPath, cm ? cm.getValue() : "", this._baseRevision)
      : { ok: true }
    const remapResult = activeDraftFlush.ok
      ? draftStorage.remapDrafts(oldPath, newPath, type)
      : activeDraftFlush
    const remapRecovery = !remapResult.ok && !remapResult.collision
      ? this.preserveFailedDraftRemap(oldPath, newPath, type, remapResult, activeDraftFlush.draft)
      : null
    if (!remapResult.ok) {
      const affectedPaths = remapResult.affectedPaths?.length
        ? remapResult.affectedPaths
        : (remappedPath !== currentPath ? [remappedPath] : [])
      for (const path of affectedPaths) this._draftBlockedPaths.add(path)
      if (remappedPath !== currentPath) {
        this.clearPendingTimers()
        this._draftPersistenceFailures.add(remappedPath)
        this._draftRevision = null
      }
      this.updateBeforeUnloadListener()
      this.showDraftStorageError(remapResult.error)
    }
    if (remappedPath === currentPath) return false

    this.currentFile = remappedPath
    this._fileVersion += 1
    if (this._baseRevision) this._knownBaseRevisions.set(remappedPath, this._baseRevision)
    this.updateBeforeUnloadListener()

    if (remapResult.ok) {
      const movedDraft = draftStorage.readDraft(remappedPath)
      this._draftRevision = movedDraft.ok ? movedDraft.draft?.draftRevision ?? null : null
      this._draftPersistenceFailures.delete(remappedPath)
    }

    if (this._scheduledSaveSnapshot?.path === currentPath) {
      this._scheduledSaveSnapshot = {
        ...this._scheduledSaveSnapshot,
        path: remappedPath,
        fileVersion: this._fileVersion
      }
    }

    if (remapResult.ok && this.hasUnsavedChanges) this.scheduleAutoSave()
    if (remapResult.collision && remappedPath === this.currentFile) {
      const conflicts = draftStorage.listDraftConflicts(remappedPath)
      if (conflicts.ok && conflicts.conflicts.length > 0) {
        const conflict = conflicts.conflicts[conflicts.conflicts.length - 1]
        this.openRecovery({
          path: remappedPath,
          serverContent: this._lastSavedContent ?? "",
          content: conflict.content,
          timestamp: conflict.updatedAt,
          source: "draft-conflict",
          draftRevision: conflict.draftRevision,
          conflictId: conflict.conflictId
        })
      }
    } else if (remapRecovery?.recoveries) {
      const recovery = remapRecovery.recoveries.find(item => item.destinationPath === remappedPath)
      if (recovery) {
        this.openRecovery({
          path: remappedPath,
          serverContent: this._lastSavedContent ?? "",
          content: recovery.conflict.content,
          timestamp: recovery.conflict.updatedAt,
          source: "draft-conflict",
          draftRevision: recovery.conflict.draftRevision,
          conflictId: recovery.conflict.conflictId
        })
      }
    }
    return true
  }

  // A server rename has already succeeded by the time this method runs. If
  // the storage remap failed, copy every still-present source draft into a
  // verified recovery record at its new path before leaving it blocked. Keep
  // the source record until the user resolves that recovery copy.
  preserveFailedDraftRemap(oldPath, newPath, type, remapResult, activeDraft = null) {
    const listed = draftStorage.listDrafts()
    const candidates = new Map()
    const failedSources = new Map()
    const addCandidate = draft => {
      if (draft && this.pathMatches(draft.path, oldPath, type)) candidates.set(draft.path, draft)
    }

    if (listed.ok) {
      for (const draft of listed.drafts) addCandidate(draft)
    }
    addCandidate(activeDraft)

    const sourcePaths = new Set()
    if (this.pathMatches(this.currentFile, oldPath, type)) sourcePaths.add(this.currentFile)
    if (typeof remapResult.sourcePath === "string") sourcePaths.add(remapResult.sourcePath)
    for (const destinationPath of remapResult.affectedPaths ?? []) {
      const sourcePath = this.reverseRemapPath(destinationPath, oldPath, newPath, type)
      if (sourcePath) sourcePaths.add(sourcePath)
    }

    for (const sourcePath of sourcePaths) {
      if (candidates.has(sourcePath)) continue
      const source = draftStorage.readDraft(sourcePath)
      if (!source.ok) {
        const destinationPath = this.remapPath(sourcePath, oldPath, newPath, type) ||
          (sourcePath === remapResult.sourcePath ? remapResult.destinationPath : null)
        if (destinationPath) failedSources.set(destinationPath, sourcePath)
      } else if (source.draft) {
        addCandidate(source.draft)
      }
    }

    const recoveries = []
    for (const draft of candidates.values()) {
      const destinationPath = this.remapPath(draft.path, oldPath, newPath, type)
      if (!destinationPath || destinationPath === draft.path) continue

      const listedConflicts = draftStorage.listDraftConflicts(destinationPath)
      if (!listedConflicts.ok) {
        failedSources.set(destinationPath, draft.path)
        continue
      }

      let conflict = listedConflicts.conflicts.find(item =>
        item.sourcePath === draft.path &&
        item.content === draft.content &&
        item.baseRevision === draft.baseRevision &&
        item.draftRevision === draft.draftRevision &&
        item.updatedAt === draft.updatedAt
      )
      if (!conflict) {
        const preserved = draftStorage.preserveDraftConflict(destinationPath, draft)
        if (!preserved.ok) {
          failedSources.set(destinationPath, draft.path)
          continue
        }
        conflict = preserved.conflict
      }

      this._pendingRemapRecoveries.delete(destinationPath)
      recoveries.push({ destinationPath, conflict })
    }

    for (const [destinationPath, sourcePath] of failedSources) {
      this._pendingRemapRecoveries.set(destinationPath, sourcePath)
    }

    return { recoveries }
  }

  reverseRemapPath(path, oldPath, newPath, type = "file") {
    if (type === "folder") {
      if (path === newPath || path.startsWith(`${newPath}/`)) {
        return `${oldPath}${path.slice(newPath.length)}`
      }
      return null
    }
    return path === newPath ? oldPath : null
  }

  retryPendingRemapRecovery(path) {
    const sourcePath = this._pendingRemapRecoveries.get(path)
    if (!sourcePath) return { ok: true, conflict: null }

    const source = draftStorage.readDraft(sourcePath)
    if (!source.ok) return source
    if (!source.draft) {
      this._pendingRemapRecoveries.delete(path)
      return { ok: true, conflict: null }
    }

    const preserved = draftStorage.preserveDraftConflict(path, source.draft)
    if (!preserved.ok) return preserved
    this._pendingRemapRecoveries.delete(path)
    return { ok: true, conflict: preserved.conflict }
  }

  // Invalidate all autosave state for a deleted note. A save already in flight
  // cannot be cancelled reliably, so saveNow() also verifies its captured file
  // version before applying a response.
  deleteFile(path, type = "file") {
    const cleanup = draftStorage.removeDrafts(path, type)
    const deletesActiveFile = this.pathMatches(this.currentFile, path, type)

    if (deletesActiveFile) {
      this.clearPendingTimers()
      this.clearDraftWriteTimeout(this.currentFile)
      this.currentFile = null
      this._lastSavedContent = null
      this._baseRevision = null
      this._draftRevision = null
      this.hasUnsavedChanges = false
      this._fileVersion += 1
      this.dismissContentLossWarning()
      this.showSaveStatus("")
      this.updateBeforeUnloadListener()
    }

    if (!cleanup.ok) this.showDraftStorageError(cleanup.error)
    return cleanup
  }

  // Rename/delete requests pause autosave after flushing a local snapshot.
  // If the server rejects the operation, let the still-active file resume.
  resumeAfterTransition() {
    if (this.currentFile && this.hasUnsavedChanges) this.scheduleAutoSave()
  }

  remapPath(path, oldPath, newPath, type = "file") {
    if (!path) return path

    if (type === "folder") {
      if (path === oldPath || path.startsWith(`${oldPath}/`)) {
        return `${newPath}${path.slice(oldPath.length)}`
      }
      return path
    }

    return path === oldPath ? newPath : path
  }

  pathMatches(path, targetPath, type = "file") {
    if (!path) return false
    if (type === "folder") {
      return path === targetPath || path.startsWith(`${targetPath}/`)
    }
    return path === targetPath
  }

  clearPendingTimers() {
    this._saveScheduleGeneration += 1
    this._scheduledSaveSnapshot = null
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    if (this.saveMaxIntervalTimeout) {
      clearTimeout(this.saveMaxIntervalTimeout)
      this.saveMaxIntervalTimeout = null
    }
    if (this._offlineBackupTimeout) {
      clearTimeout(this._offlineBackupTimeout)
      this._offlineBackupTimeout = null
    }
  }

  scheduleDraftWrite() {
    const path = this.currentFile
    const baseRevision = this._baseRevision
    if (!path || !baseRevision || this.hasPendingRecovery(path) || this._draftBlockedPaths.has(path)) return

    const cm = this.getCodemirrorController()
    const content = cm ? cm.getValue() : ""
    if (content === this._lastSavedContent) {
      this.clearDraftWriteTimeout(path)
      if (this._draftRevision) this.removeDraftIfRevision(path, this._draftRevision)
      return
    }

    const previousTimeout = this._draftWriteTimeouts.get(path)
    if (previousTimeout) clearTimeout(previousTimeout)

    const snapshot = { path, content, baseRevision }
    const timeout = setTimeout(() => {
      this._draftWriteTimeouts.delete(path)
      this.writeDraftSnapshot(snapshot)
    }, this.constructor.DRAFT_DEBOUNCE_MS)
    this._draftWriteTimeouts.set(path, timeout)
  }

  flushDraftWrite(path = this.currentFile, content = null, baseRevision = this._baseRevision) {
    if (!path || !baseRevision || this.hasPendingRecovery(path)) return { ok: true, draft: null }

    const cm = this.getCodemirrorController()
    const snapshotContent = content === null ? (cm ? cm.getValue() : "") : content
    this.clearDraftWriteTimeout(path)

    if (snapshotContent === this._lastSavedContent && path === this.currentFile) {
      this._draftPersistenceFailures.delete(path)
      this.updateBeforeUnloadListener()
      if (this._draftRevision) {
        const result = draftStorage.removeDraftIfRevision(path, this._draftRevision)
        if (!result.ok) this.showDraftStorageError(result.error)
        else {
          this._draftRevision = null
          this.clearDraftStorageError()
        }
        return result
      }
      this.clearDraftStorageError()
      return { ok: true, draft: null }
    }

    if (!baseRevision) {
      const error = new Error("Cannot persist a local draft without a server revision")
      this._draftPersistenceFailures.add(path)
      this.updateBeforeUnloadListener()
      if (path === this.currentFile) this.showDraftStorageError(error)
      return { ok: false, error }
    }

    return this.writeDraftSnapshot({ path, content: snapshotContent, baseRevision })
  }

  writeDraftSnapshot(snapshot) {
    if (this._draftBlockedPaths.has(snapshot.path)) {
      const error = new Error(`Draft persistence is blocked for ${snapshot.path} until its recovery conflict is resolved`)
      this._draftPersistenceFailures.add(snapshot.path)
      this.updateBeforeUnloadListener()
      if (snapshot.path === this.currentFile) this.showDraftStorageError(error)
      return { ok: false, error }
    }
    if (this.hasPendingRecovery(snapshot.path)) return { ok: true, draft: null, blocked: true }

    const latestBaseRevision = this._knownBaseRevisions.get(snapshot.path)
    const baseRevision = latestBaseRevision || snapshot.baseRevision
    const result = draftStorage.writeDraft(snapshot.path, snapshot.content, baseRevision)

    if (!result.ok) {
      this._draftPersistenceFailures.add(snapshot.path)
      this.updateBeforeUnloadListener()
      if (snapshot.path === this.currentFile) this.showDraftStorageError(result.error)
      return result
    }

    this._draftPersistenceFailures.delete(snapshot.path)
    this.updateBeforeUnloadListener()
    if (snapshot.path === this.currentFile) {
      this._draftRevision = result.draft.draftRevision
      this.clearDraftStorageError()
    }
    return result
  }

  flushActiveDraft() {
    const path = this.currentFile
    if (!path) return { ok: true, draft: null }

    const cm = this.getCodemirrorController()
    const content = cm ? cm.getValue() : ""
    return this.flushDraftWrite(path, content, this._baseRevision)
  }

  handleVisibilityChange() {
    if (document.visibilityState === "hidden" || document.hidden) this.flushActiveDraft()
  }

  handlePageHide() {
    this.flushActiveDraft()
  }

  handleBeforeUnload(event) {
    const result = this.flushActiveDraft()
    const path = this.currentFile
    if (result.ok || !path || !this._draftPersistenceFailures.has(path)) return

    event.preventDefault()
    event.returnValue = ""
  }

  updateBeforeUnloadListener() {
    const shouldListen = Boolean(this.currentFile && this._draftPersistenceFailures.has(this.currentFile))
    if (shouldListen && !this._beforeUnloadListenerActive) {
      window.addEventListener("beforeunload", this._beforeUnloadHandler)
      this._beforeUnloadListenerActive = true
    } else if (!shouldListen && this._beforeUnloadListenerActive) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler)
      this._beforeUnloadListenerActive = false
    }
  }

  clearDraftWriteTimeout(path) {
    const timeout = this._draftWriteTimeouts.get(path)
    if (timeout) {
      clearTimeout(timeout)
      this._draftWriteTimeouts.delete(path)
    }
  }

  removeDraftIfRevision(path, revision) {
    const result = draftStorage.removeDraftIfRevision(path, revision)
    if (!result.ok) {
      if (path === this.currentFile) this.showDraftStorageError(result.error)
      else console.error("Unable to remove saved local draft:", result.error)
    } else if (result.removed && path === this.currentFile && revision === this._draftRevision) {
      this._draftRevision = null
    }
    return result
  }

  showDraftStorageError(error) {
    this._draftStorageErrorVisible = true
    console.error("Unable to persist local draft:", error)
    this.showSaveStatus(window.t("status.draft_storage_error"), true)
  }

  clearDraftStorageError() {
    if (!this._draftStorageErrorVisible) return
    this._draftStorageErrorVisible = false
    this.showSaveStatus(this.hasUnsavedChanges ? window.t("status.unsaved") : "")
  }

  readLegacyBackup(path, serverContent) {
    const result = draftStorage.readBackup(path)
    if (!result.ok) {
      this.showDraftStorageError(result.error)
      return null
    }

    const backup = result.backup
    if (backup && backup.content === serverContent) {
      const removal = draftStorage.removeBackup(path)
      if (!removal.ok) this.showDraftStorageError(removal.error)
      return null
    }
    return backup
  }

  openRecovery({ path, serverContent, content, timestamp, source, draftRevision = null, conflictId = null }) {
    const recovery = this.getRecoveryDiffController()
    if (!recovery) return false

    if (path === this.currentFile) {
      this.clearDraftWriteTimeout(path)
      this.clearPendingTimers()
    }

    const recoveryOptions = {
      path,
      serverContent,
      backupContent: content,
      backupTimestamp: timestamp,
      source,
      draftRevision
    }
    if (conflictId) recoveryOptions.conflictId = conflictId
    recovery.open(recoveryOptions)
    this._pendingRecovery = { path, draftRevision }
    return true
  }

  recoverDraft(serverContent, serverRevision) {
    const path = this.currentFile
    if (!path) return serverContent

    const pendingRemap = this.retryPendingRemapRecovery(path)
    if (!pendingRemap.ok) {
      this.showDraftStorageError(pendingRemap.error)
      return serverContent
    }

    const conflictsResult = draftStorage.listDraftConflicts(path)
    if (!conflictsResult.ok) {
      this.showDraftStorageError(conflictsResult.error)
      return serverContent
    }
    if (conflictsResult.conflicts.length > 0) {
      const conflict = conflictsResult.conflicts[conflictsResult.conflicts.length - 1]
      this.openRecovery({
        path,
        serverContent,
        content: conflict.content,
        timestamp: conflict.updatedAt,
        source: "draft-conflict",
        draftRevision: conflict.draftRevision,
        conflictId: conflict.conflictId
      })
      return serverContent
    }

    const readResult = draftStorage.readDraft(path)
    if (!readResult.ok) {
      this.showDraftStorageError(readResult.error)
      const backup = this.readLegacyBackup(path, serverContent)
      if (backup) this.openRecovery({ path, serverContent, content: backup.content, timestamp: backup.timestamp, source: "backup" })
      return serverContent
    }

    const draft = readResult.draft
    const backup = this.readLegacyBackup(path, serverContent)

    if (!draft) {
      if (backup) this.openRecovery({ path, serverContent, content: backup.content, timestamp: backup.timestamp, source: "backup" })
      return serverContent
    }

    // Draft records are the new source of truth. A legacy backup only takes
    // precedence when it is a different, later snapshot; that case requires an
    // explicit recovery choice instead of silently overwriting either copy.
    if (backup && backup.content !== draft.content && backup.timestamp > draft.updatedAt) {
      this.openRecovery({
        path,
        serverContent,
        content: backup.content,
        timestamp: backup.timestamp,
        source: "backup",
        draftRevision: draft.draftRevision
      })
      return serverContent
    }

    if (backup) {
      const removal = draftStorage.removeBackup(path)
      if (!removal.ok) this.showDraftStorageError(removal.error)
    }

    if (draft.content === serverContent) {
      this.removeDraftIfRevision(path, draft.draftRevision)
      return serverContent
    }

    if (draft.baseRevision === serverRevision) {
      this._draftRevision = draft.draftRevision
      this.hasUnsavedChanges = true
      this.showSaveStatus(window.t("status.unsaved"))
      if (this.isLargeDeletion(serverContent, draft.content)) this.showContentLossWarning()
      return draft.content
    }

    this.openRecovery({
      path,
      serverContent,
      content: draft.content,
      timestamp: draft.updatedAt,
      source: "draft",
      draftRevision: draft.draftRevision
    })
    return serverContent
  }

  checkOfflineBackup(serverContent) {
    const backup = this.getOfflineBackupController()
    if (!backup) return
    const data = backup.check(this.currentFile, serverContent)
    if (!data) return
    const recovery = this.getRecoveryDiffController()
    if (recovery) {
      this.openRecovery({
        path: this.currentFile,
        serverContent,
        content: data.content,
        timestamp: data.timestamp,
        source: "backup"
      })
    }
  }

  checkContentRestored(currentContent) {
    if (!this._contentLossWarningActive || typeof this._lastSavedContent !== "string") return

    if (!this.isLargeDeletion(this._lastSavedContent, currentContent)) {
      this.dismissContentLossWarning()
    }
  }

  isLargeDeletion(baseline, content) {
    if (typeof baseline !== "string" || typeof content !== "string" || baseline.length === 0) return false

    const lostChars = baseline.length - content.length
    const lostPercent = lostChars / baseline.length
    return lostPercent > 0.2 && lostChars > 50
  }

  // === Offline Backup ===

  scheduleOfflineBackup() {
    if (!this.isOffline || !this.currentFile) return

    const path = this.currentFile
    const cm = this.getCodemirrorController()
    const content = cm ? cm.getValue() : ""
    if (this._offlineBackupTimeout) clearTimeout(this._offlineBackupTimeout)
    this._offlineBackupTimeout = setTimeout(() => {
      this._offlineBackupTimeout = null
      const backup = this.getOfflineBackupController()
      if (backup) backup.save(path, content)
    }, 1000)
  }

  // === Auto Save ===

  scheduleAutoSave() {
    if (this.hasPendingRecovery() || this._draftBlockedPaths.has(this.currentFile)) return

    this.scheduleDraftWrite()

    if (this.isOffline) {
      this.hasUnsavedChanges = true
      return
    }

    if (this._contentLossWarningActive) {
      this.hasUnsavedChanges = true
      return
    }

    if (!this.hasUnsavedChanges) {
      this.hasUnsavedChanges = true
      this.showSaveStatus(window.t("status.unsaved"))
    }

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    const snapshot = this.captureSaveSnapshot()
    this._scheduledSaveSnapshot = snapshot
    const generation = this._saveScheduleGeneration

    this.saveTimeout = setTimeout(() => {
      if (generation !== this._saveScheduleGeneration) return
      this.saveTimeout = null
      const scheduledSnapshot = this._scheduledSaveSnapshot
      if (scheduledSnapshot && this.isCurrentSaveSnapshot(scheduledSnapshot)) {
        this.saveNow(scheduledSnapshot)
      }
    }, this.constructor.SAVE_DEBOUNCE_MS)

    if (!this.saveMaxIntervalTimeout) {
      this.saveMaxIntervalTimeout = setTimeout(() => {
        if (generation !== this._saveScheduleGeneration) return
        this.saveMaxIntervalTimeout = null
        const scheduledSnapshot = this._scheduledSaveSnapshot
        if (this.hasUnsavedChanges && scheduledSnapshot && this.isCurrentSaveSnapshot(scheduledSnapshot)) {
          this.saveNow(scheduledSnapshot)
        }
      }, this.constructor.SAVE_MAX_INTERVAL_MS)
    }
  }

  captureSaveSnapshot() {
    const codemirrorController = this.getCodemirrorController()
    return {
      path: this.currentFile,
      fileVersion: this._fileVersion,
      content: codemirrorController ? codemirrorController.getValue() : "",
      baseRevision: this._baseRevision
    }
  }

  isCurrentSaveSnapshot(snapshot) {
    return snapshot.path === this.currentFile && snapshot.fileVersion === this._fileVersion
  }

  async saveNow(snapshot = null) {
    if (this.hasPendingRecovery() || this._draftBlockedPaths.has(this.currentFile)) return
    if (this.isOffline) {
      this.hasUnsavedChanges = true
      return
    }

    if (!this.currentFile) return
    if (snapshot && !this.isCurrentSaveSnapshot(snapshot)) return
    if (this._isSaving) return

    const saveSnapshot = snapshot || this.captureSaveSnapshot()
    const filePath = saveSnapshot.path
    const fileVersion = saveSnapshot.fileVersion
    this.clearPendingTimers()

    const codemirrorController = this.getCodemirrorController()
    const content = saveSnapshot.content
    const baseRevision = saveSnapshot.baseRevision
    const isConfigFile = filePath === ".fed"
    const savedDraft = this.flushDraftWrite(filePath, content, baseRevision)
    const savedDraftRevision = savedDraft.ok ? savedDraft.draft?.draftRevision : null

    if (content === this._lastSavedContent) {
      this.hasUnsavedChanges = false
      this.showSaveStatus("")
      return
    }

    const hasContentLossOverride = this._contentLossOverride && this.currentContentLossState().overrideContent === content
    if (!hasContentLossOverride && this.isLargeDeletion(this._lastSavedContent, content)) {
      if (!savedDraft.ok) return
      this.showContentLossWarning()
      return
    }

    this._isSaving = true
    try {
      const response = await patch(`/notes/${encodePath(filePath)}`, {
        body: { content },
        responseKind: "json"
      })

      if (!response.ok) {
        throw new Error(window.t("errors.failed_to_save"))
      }

      const responseData = typeof response.json === "function" ? await response.json() : await response.json
      const newRevision = typeof responseData?.revision === "string" ? responseData.revision : null
      if (newRevision) this._knownBaseRevisions.set(filePath, newRevision)

      // A rename, delete, or file load may have happened while the request was
      // in flight. Do not let a stale response remove the only source draft.
      if (this.currentFile !== filePath || this._fileVersion !== fileVersion) {
        if (this.currentFile && this.hasUnsavedChanges) this.scheduleAutoSave()
        return
      }

      // Remove only the snapshot captured for this request. A newer edit may
      // already have replaced it while the request was in flight.
      if (savedDraftRevision) this.removeDraftIfRevision(filePath, savedDraftRevision)

      const rebaseNewerDraft = () => {
        if (!newRevision) return
        if (this._draftBlockedPaths.has(filePath)) return
        const latestResult = draftStorage.readDraft(filePath)
        if (!latestResult.ok) {
          if (this.currentFile === filePath) this.showDraftStorageError(latestResult.error)
          return
        }

        const latestDraft = latestResult.draft
        if (latestDraft && latestDraft.content !== content && latestDraft.baseRevision !== newRevision) {
          const rebaseResult = draftStorage.writeDraft(filePath, latestDraft.content, newRevision)
          if (!rebaseResult.ok) {
            if (this.currentFile === filePath) this.showDraftStorageError(rebaseResult.error)
          } else if (this.currentFile === filePath) {
            this._draftRevision = rebaseResult.draft.draftRevision
          }
        }
      }

      rebaseNewerDraft()

      this._lastSavedContent = content
      if (newRevision) {
        this._baseRevision = newRevision
        this._contentLossState = {
          path: filePath,
          baseRevision: newRevision,
          warningActive: false,
          override: false,
          overrideContent: null
        }
      }
      this._lastSaveTime = Date.now()
      this._contentLossOverride = false
      this.hasUnsavedChanges = false
      const backupController = this.getOfflineBackupController()
      if (backupController) backupController.clear(filePath)
      this.showSaveStatus(window.t("status.saved"))
      setTimeout(() => this.showSaveStatus(""), 2000)

      if (isConfigFile) {
        this.dispatch("config-saved")
      }

      const freshContent = codemirrorController ? codemirrorController.getValue() : ""
      if (freshContent !== content) {
        this.hasUnsavedChanges = true
        if (this._baseRevision) this.writeDraftSnapshot({ path: filePath, content: freshContent, baseRevision: this._baseRevision })
        if (!this.isOffline) {
          this.scheduleAutoSave()
        }
      }
    } catch (error) {
      if (this.currentFile !== filePath || this._fileVersion !== fileVersion) {
        if (this.currentFile && this.hasUnsavedChanges) this.scheduleAutoSave()
      } else {
        console.error("Error saving:", error)
        this.showSaveStatus(window.t("status.error_saving"), true)
      }
    } finally {
      this._isSaving = false
    }
  }

  // === Connection Status ===

  onConnectionLost() {
    this.isOffline = true

    // Preserve the latest editor snapshot synchronously before relying on the
    // legacy offline backup path.
    this.flushDraftWrite()

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
      this.hasUnsavedChanges = true
    }
    if (this.saveMaxIntervalTimeout) {
      clearTimeout(this.saveMaxIntervalTimeout)
      this.saveMaxIntervalTimeout = null
    }

    this.dispatch("offline-changed", { detail: { offline: true } })

    this.showSaveStatus(window.t("connection.disconnected"), true)

    if (this.currentFile) {
      const cm = this.getCodemirrorController()
      const content = cm ? cm.getValue() : ""
      const backup = this.getOfflineBackupController()
      if (backup && content && content !== this._lastSavedContent) {
        backup.save(this.currentFile, content)
      }
    }
  }

  onConnectionRestored() {
    this.isOffline = false
    this.showSaveStatus("")

    if (this.hasUnsavedChanges && this.currentFile) {
      this.saveNow()
    }
  }

  // === Content Loss Warning ===

  showContentLossWarning() {
    this._contentLossWarningActive = true
    if (this.hasContentLossBannerTarget) {
      this.contentLossBannerTarget.classList.remove("hidden")
      this.contentLossBannerTarget.classList.add("flex")
    }
  }

  dismissContentLossWarning() {
    this._contentLossWarningActive = false
    this._contentLossOverride = false
    if (this.hasContentLossBannerTarget) {
      this.contentLossBannerTarget.classList.add("hidden")
      this.contentLossBannerTarget.classList.remove("flex")
    }
  }

  undoContentLoss() {
    const codemirrorController = this.getCodemirrorController()
    let undidEditorChange = false
    if (codemirrorController) {
      const view = codemirrorController.getEditorView()
      if (view) {
        undidEditorChange = undo(view)
      }
    }

    // A draft recovered after a reload has no prior CodeMirror edit history.
    // In that case, restore the server baseline directly instead of leaving
    // the content-loss action without anything to undo.
    if (!undidEditorChange && this._contentLossWarningActive &&
      typeof this._lastSavedContent === "string" && codemirrorController) {
      codemirrorController.loadContent(this._lastSavedContent)
    }

    const content = codemirrorController ? codemirrorController.getValue() : ""
    this.checkContentRestored(content)
    this.flushDraftWrite(this.currentFile, content, this._baseRevision)
  }

  saveAnywayAfterWarning() {
    this.dismissContentLossWarning()
    this._contentLossOverride = true
    return this.saveNow()
  }

  // === Recovery ===

  onRecoveryResolved(event) {
    const { source, content, draftRevision, backupContent, backupTimestamp, conflictId } = event.detail
    const path = this.currentFile
    const removeSelectedBackup = () => {
      if (typeof backupContent !== "string" || !Number.isFinite(backupTimestamp) || !path) return
      const result = draftStorage.removeBackupIfSnapshot(path, backupContent, backupTimestamp)
      if (!result.ok) this.showDraftStorageError(result.error)
    }

    if (conflictId) {
      this.resolveDraftConflict({
        path,
        conflictId,
        draftRevision,
        content,
        serverContent: event.detail.serverContent,
        accepted: source !== "server" && typeof content === "string"
      })
      return
    }

    if (draftRevision && path) {
      const latestResult = draftStorage.readDraft(path)
      if (!latestResult.ok) {
        this.showDraftStorageError(latestResult.error)
        return
      }
      if (latestResult.draft && latestResult.draft.draftRevision !== draftRevision) {
        this.showDraftStorageError(new Error("The local draft changed while recovery was open"))
        return
      }
    }

    if (source === "server") {
      if (path && draftRevision) {
        const removal = this.removeDraftIfRevision(path, draftRevision)
        if (!removal.ok) return
      }
      removeSelectedBackup()
      if (draftRevision === this._draftRevision) this._draftRevision = null
      if (this.hasPendingRecovery(path)) this._pendingRecovery = null
      this.hasUnsavedChanges = false
      this.showSaveStatus("")
      return
    }

    if ((source === "backup" || source === "draft") && typeof content === "string") {
      if (this.hasPendingRecovery(path)) this._pendingRecovery = null
      const cm = this.getCodemirrorController()
      if (cm) cm.setValue(content)
      this.clearDraftWriteTimeout(path)
      this.hasUnsavedChanges = true
      this._contentLossOverride = false

      const shouldWarnForLargeDeletion = this.isLargeDeletion(this._lastSavedContent, content)

      const writeResult = this.flushDraftWrite(path, content, this._baseRevision)
      if (writeResult.ok && writeResult.draft) {
        this._draftRevision = writeResult.draft.draftRevision
        removeSelectedBackup()
      } else if (draftRevision) {
        // Keep the selected source intact if it could not be migrated into the
        // versioned draft store.
        this._draftRevision = draftRevision
      }

      if (shouldWarnForLargeDeletion) {
        this.showContentLossWarning()
        this.clearPendingTimers()
      } else {
        this.scheduleAutoSave()
      }
    }
  }

  resolveDraftConflict({ path, conflictId, draftRevision, content, serverContent, accepted }) {
    if (!path || !conflictId) return
    const conflictsResult = draftStorage.listDraftConflicts(path)
    if (!conflictsResult.ok) {
      this.showDraftStorageError(conflictsResult.error)
      return
    }
    const selected = conflictsResult.conflicts.find(conflict =>
      conflict.conflictId === conflictId && conflict.draftRevision === draftRevision
    )
    if (!selected) {
      this.showDraftStorageError(new Error("The recovery copy changed while the dialog was open"))
      return
    }

    const removeSelectedConflict = () => {
      const result = draftStorage.removeDraftConflictIfRevision(path, conflictId, draftRevision)
      if (!result.ok) this.showDraftStorageError(result.error)
      return result
    }

    const currentResult = draftStorage.readDraft(path)
    if (!currentResult.ok) {
      this.showDraftStorageError(currentResult.error)
      return
    }

    if (!accepted || typeof content !== "string") {
      if (currentResult.draft) {
        if (currentResult.draft.draftRevision !== draftRevision) {
          const preserved = draftStorage.preserveDraftConflict(path, currentResult.draft)
          if (!preserved.ok) {
            this.showDraftStorageError(preserved.error)
            return
          }
        }
        const primaryRemoval = draftStorage.removeDraftIfRevision(path, currentResult.draft.draftRevision)
        if (!primaryRemoval.ok) {
          this.showDraftStorageError(primaryRemoval.error)
          return
        }
      }
      const removal = removeSelectedConflict()
      if (!removal.ok) return
      if (selected.sourcePath !== path) {
        const sourceRemoval = this.removeDraftIfRevision(selected.sourcePath, draftRevision)
        if (!sourceRemoval.ok) return
      }
      const codemirrorController = this.getCodemirrorController()
      if (typeof serverContent === "string" && codemirrorController) codemirrorController.setValue(serverContent)
      this.hasUnsavedChanges = false
      this._draftRevision = null
      if (this.hasPendingRecovery(path)) this._pendingRecovery = null
      this._draftBlockedPaths.delete(path)
      this._draftPersistenceFailures.delete(path)
      this.clearDraftStorageError()
      this.updateBeforeUnloadListener()
      return
    }

    if (currentResult.draft && currentResult.draft.draftRevision !== draftRevision) {
      const preserved = draftStorage.preserveDraftConflict(path, currentResult.draft)
      if (!preserved.ok) {
        this.showDraftStorageError(preserved.error)
        return
      }
    }

    const writeResult = content === this._lastSavedContent
      ? { ok: true, draft: null }
      : draftStorage.writeDraft(path, content, this._baseRevision)
    if (!writeResult.ok) {
      this.showDraftStorageError(writeResult.error)
      return
    }

    const conflictRemoval = removeSelectedConflict()
    if (!conflictRemoval.ok) return
    if (selected.sourcePath !== path) {
      const sourceRemoval = this.removeDraftIfRevision(selected.sourcePath, draftRevision)
      if (!sourceRemoval.ok) return
    }

    this._draftRevision = writeResult.draft?.draftRevision ?? null
    this.hasUnsavedChanges = content !== this._lastSavedContent
    const codemirrorController = this.getCodemirrorController()
    if (codemirrorController) codemirrorController.setValue(content)

    if (this.hasPendingRecovery(path)) this._pendingRecovery = null
    this._draftBlockedPaths.delete(path)
    this._draftPersistenceFailures.delete(path)
    this.clearDraftStorageError()
    this.updateBeforeUnloadListener()

    if (this.isLargeDeletion(this._lastSavedContent, content)) {
      this.showContentLossWarning()
      this.clearPendingTimers()
    } else if (this.hasUnsavedChanges) {
      this.scheduleAutoSave()
    }
  }

  // === UI ===

  showSaveStatus(text, isError = false) {
    if (!this.hasSaveStatusTarget) return
    this.saveStatusTarget.textContent = text
    this.saveStatusTarget.classList.toggle("hidden", !text)
    this.saveStatusTarget.classList.toggle("text-red-500", isError)
    this.saveStatusTarget.classList.toggle("dark:text-red-400", isError)
  }

}
