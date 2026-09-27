import { Controller } from "@hotwired/stimulus"
import { post } from "@rails/request.js"
import { encodePath } from "lib/url_utils"
import { appAlert } from "lib/app_prompt"

// Drag and Drop Controller
// Handles file and folder drag-and-drop in the file tree
// Dispatches drag-drop:item-moved event with { oldPath, newPath, type }

export default class extends Controller {
  static targets = ["tree"]

  get expandedFolders() {
    const appEl = document.querySelector('[data-controller~="app"]')
    if (!appEl) return ""
    const app = this.application.getControllerForElementAndIdentifier(appEl, "app")
    return app?.expandedFolders ? [...app.expandedFolders].join(",") : ""
  }

  getAppController() {
    const appEl = document.querySelector('[data-controller~="app"]')
    return appEl ? this.application.getControllerForElementAndIdentifier(appEl, "app") : null
  }

  preparePathOperation(path, type) {
    const app = this.getAppController()
    const activePath = app?.currentFile
    const matches = type === "folder"
      ? activePath === path || activePath?.startsWith(`${path}/`)
      : activePath === path
    if (!activePath || !matches) return { ok: true, prepared: false }

    const autosave = app.getAutosaveController?.()
    if (!autosave?.prepareForTransition) {
      return { ok: false, needsAlert: true }
    }

    const result = autosave.prepareForTransition()
    return { ...result, prepared: result.ok, autosave }
  }

  resumePathOperation(prepared) {
    if (prepared?.prepared) prepared.autosave?.resumeAfterTransition?.()
  }

  connect() {
    this.draggedItem = null
    this.activeDropTargetId = null
  }

  disconnect() {
    this.draggedItem = null
    this.activeDropTargetId = null
  }

  // Item drag start
  onDragStart(event) {
    const target = event.currentTarget
    this.draggedItem = {
      path: target.dataset.path,
      type: target.dataset.type
    }
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", target.dataset.path)
    target.classList.add("dragging")
    this.clearActiveDropTarget()

    // Add a slight delay to show the dragging state
    setTimeout(() => {
      target.classList.add("drag-ghost")
    }, 0)
  }

  // Item drag end
  onDragEnd(event) {
    event.currentTarget.classList.remove("dragging", "drag-ghost")
    this.draggedItem = null
    this.clearActiveDropTarget()

    if (this.hasTreeTarget) {
      this.treeTarget.classList.remove("drop-highlight-root")
    }
  }

  // Allow drop
  onDragOver(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  // Keep a single active row highlight for the current pointer position.
  updateActiveDropTargetFromEvent(event) {
    if (!this.draggedItem || !this.hasTreeTarget) {
      this.clearActiveDropTarget()
      return
    }

    const eventTarget = event.target
    const targetElement = eventTarget instanceof Element
      ? eventTarget
      : (eventTarget instanceof Node ? eventTarget.parentElement : null)

    if (!(targetElement instanceof Element)) {
      this.clearActiveDropTarget()
      return
    }

    const candidate = targetElement.closest("[data-drop-id]")
    if (!candidate || !this.treeTarget.contains(candidate) || !this.isValidDropTarget(candidate)) {
      this.clearActiveDropTarget()
      return
    }

    this.setActiveDropTarget(candidate.dataset.dropId)
  }

  setActiveDropTarget(dropTargetId) {
    if (this.activeDropTargetId === dropTargetId) return
    this.activeDropTargetId = dropTargetId
    this.renderActiveDropTarget()
  }

  clearActiveDropTarget() {
    if (this.activeDropTargetId === null) {
      this.renderActiveDropTarget()
      return
    }

    this.setActiveDropTarget(null)
  }

  renderActiveDropTarget() {
    if (!this.hasTreeTarget) return

    this.treeTarget.querySelectorAll("[data-drop-id]").forEach(row => {
      row.classList.toggle("drop-highlight", row.dataset.dropId === this.activeDropTargetId)
    })
  }

  isValidDropTarget(target) {
    if (!this.draggedItem) return false
    if (target.dataset.type !== "folder") return false
    if (!target.dataset.path) return false

    const draggedPath = this.draggedItem.path

    // Don't allow dropping on itself or descendants.
    if (draggedPath === target.dataset.path) return false
    if (target.dataset.path.startsWith(draggedPath + "/")) return false

    // Don't highlight the current parent (moving to same location is a no-op).
    const currentParent = draggedPath.split("/").slice(0, -1).join("/")
    if (currentParent === target.dataset.path) return false

    return true
  }

  // Handle drop on folder
  async onDrop(event) {
    event.preventDefault()
    event.stopPropagation()

    const target = event.currentTarget
    this.clearActiveDropTarget()

    if (!this.draggedItem) return
    if (!this.isValidDropTarget(target)) return

    const sourcePath = this.draggedItem.path
    const targetFolder = target.dataset.path

    const itemName = sourcePath.split("/").pop()
    const newPath = `${targetFolder}/${itemName}`

    await this.moveItem(sourcePath, newPath, this.draggedItem.type)
  }

  // Root tree drag over
  onDragOverRoot(event) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move"
    }

    this.updateActiveDropTargetFromEvent(event)
  }

  // Root tree drag enter
  onDragEnterRoot(event) {
    event.preventDefault()
    if (!this.draggedItem) return
    if (!this.hasTreeTarget) return

    // Only highlight if the item is not already at root
    if (this.draggedItem.path.includes("/")) {
      this.treeTarget.classList.add("drop-highlight-root")
    }
  }

  // Root tree drag leave
  onDragLeaveRoot(event) {
    if (!this.hasTreeTarget) return

    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && this.treeTarget.contains(relatedTarget)) return

    if (!relatedTarget && typeof document.elementFromPoint === "function") {
      const hasPoint = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      if (hasPoint) {
        const elementUnderPointer = document.elementFromPoint(event.clientX, event.clientY)
        if (elementUnderPointer instanceof Node && this.treeTarget.contains(elementUnderPointer)) return
      }
    }

    this.treeTarget.classList.remove("drop-highlight-root")
    this.clearActiveDropTarget()
  }

  // Handle drop to root
  async onDropToRoot(event) {
    event.preventDefault()
    event.stopPropagation()

    if (this.hasTreeTarget) {
      this.treeTarget.classList.remove("drop-highlight-root")
    }
    this.clearActiveDropTarget()

    if (!this.draggedItem) return

    const sourcePath = this.draggedItem.path

    // If already at root, do nothing
    if (!sourcePath.includes("/")) return

    const itemName = sourcePath.split("/").pop()
    const newPath = itemName

    await this.moveItem(sourcePath, newPath, this.draggedItem.type)
  }

  // Move item to new location
  async moveItem(oldPath, newPath, type) {
    const prepared = this.preparePathOperation(oldPath, type)
    if (!prepared.ok) {
      if (prepared.needsAlert) appAlert(window.t("status.draft_storage_error"))
      return
    }

    try {
      const endpoint = type === "file" ? "notes" : "folders"
      const response = await post(`/${endpoint}/${encodePath(oldPath)}/rename`, {
        body: { new_path: newPath, expanded: this.expandedFolders },
        responseKind: "turbo-stream"
      })

      if (!response.ok) {
        throw new Error(window.t("errors.failed_to_move"))
      }

      // Dispatch event for parent controller to handle state updates
      this.dispatch("item-moved", {
        detail: { oldPath, newPath, type }
      })
    } catch (error) {
      this.resumePathOperation(prepared)
      console.error("Error moving item:", error)
      appAlert(error.message)
    }
  }
}
