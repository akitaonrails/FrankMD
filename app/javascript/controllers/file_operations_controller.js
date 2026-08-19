import { Controller } from "@hotwired/stimulus"
import { post, destroy } from "@rails/request.js"
import { encodePath } from "lib/url_utils"
import { previewNotePath, canCreateNote } from "lib/new_note_utils"

// File Operations Controller
// Handles file/folder creation, renaming, deletion and context menu
// Dispatches events: file-created, file-renamed, file-deleted, folder-created

export default class extends Controller {
  static targets = [
    "contextMenu",
    "renameDialog",
    "renameInput",
    "newNoteDialog",
    "newNoteInput",
    "newNoteTemplateCard",
    "newNotePath",
    "newNoteSubmit",
    "newItemDialog",
    "newItemTitle",
    "newItemInput",
    "newItemLocation"
  ]

  connect() {
    this.contextItem = null
    this.newItemType = null
    this.newItemParent = ""
    this.newNoteTemplate = "empty"
    this.contextClickX = 0
    this.contextClickY = 0

    this.setupContextMenuClose()
    this.setupDialogClickOutside()
  }

  get expandedFolders() {
    const appEl = document.querySelector('[data-controller~="app"]')
    if (!appEl) return ""
    const app = this.application.getControllerForElementAndIdentifier(appEl, "app")
    return app?.expandedFolders ? [...app.expandedFolders].join(",") : ""
  }

  setupContextMenuClose() {
    this.boundContextMenuClose = (event) => {
      if (!this.hasContextMenuTarget) return
      if (!this.contextMenuTarget.contains(event.target)) {
        this.contextMenuTarget.classList.add("hidden")
      }
    }
    document.addEventListener("click", this.boundContextMenuClose)
  }

  setupDialogClickOutside() {
    const dialogs = [
      this.renameDialogTarget,
      this.newItemDialogTarget,
      this.newNoteDialogTarget
    ].filter(d => d)

    dialogs.forEach(dialog => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          dialog.close()
        }
      })
    })
  }

  disconnect() {
    if (this.boundContextMenuClose) {
      document.removeEventListener("click", this.boundContextMenuClose)
    }
  }

  // Context Menu
  showContextMenu(event) {
    event.preventDefault()
    event.stopPropagation()

    const target = event.currentTarget
    const path = target.dataset.path
    const type = target.dataset.type
    const fileType = target.dataset.fileType

    // Don't show context menu for config files
    if (fileType === "config") return

    this.contextItem = { path, type }
    this.contextClickX = event.clientX
    this.contextClickY = event.clientY

    // Update menu items based on type
    const renameItem = this.contextMenuTarget.querySelector('[data-action*="renameItem"]')
    const deleteItem = this.contextMenuTarget.querySelector('[data-action*="deleteItem"]')
    const newNoteItem = this.contextMenuTarget.querySelector('[data-action*="newNoteInFolder"]')

    if (renameItem) renameItem.classList.toggle("hidden", false)
    if (deleteItem) deleteItem.classList.toggle("hidden", false)
    if (newNoteItem) newNoteItem.classList.toggle("hidden", type !== "folder")

    const newFolderItem = this.contextMenuTarget.querySelector('[data-action*="newFolderInFolder"]')
    if (newFolderItem) newFolderItem.classList.toggle("hidden", type !== "folder")

    // Position and show menu
    this.contextMenuTarget.style.left = `${event.clientX}px`
    this.contextMenuTarget.style.top = `${event.clientY}px`
    this.contextMenuTarget.classList.remove("hidden")

    // Adjust if menu would go off screen
    const menuRect = this.contextMenuTarget.getBoundingClientRect()
    if (menuRect.right > window.innerWidth) {
      this.contextMenuTarget.style.left = `${window.innerWidth - menuRect.width - 10}px`
    }
    if (menuRect.bottom > window.innerHeight) {
      this.contextMenuTarget.style.top = `${window.innerHeight - menuRect.height - 10}px`
    }
  }

  hideContextMenu() {
    if (this.hasContextMenuTarget) {
      this.contextMenuTarget.classList.add("hidden")
    }
  }

  // New Note (root). Clear any parent left over from a prior folder-scoped
  // "New Note in Folder" that was cancelled, so a root note is created at the
  // root — and the path preview reflects that.
  newNote() {
    this.openNewNoteDialog("")
  }

  // New Note in Folder (from context menu)
  newNoteInFolder() {
    this.hideContextMenu()
    if (!this.contextItem || this.contextItem.type !== "folder") return
    this.openNewNoteDialog(this.contextItem.path)
  }

  // Single-step New Note dialog: name input + type cards + live path preview.
  openNewNoteDialog(parent = "") {
    this.newItemType = "note"
    this.newItemParent = parent || ""
    this.setNewNoteTemplate("empty")

    if (this.hasNewNoteInputTarget) {
      this.newNoteInputTarget.value = ""
    }

    this.updateNewNotePreview()

    if (this.hasNewNoteDialogTarget) {
      this.newNoteDialogTarget.showModal()
      this.focusNewNoteInput()
    }
  }

  closeNewNoteDialog() {
    if (this.hasNewNoteDialogTarget) {
      this.newNoteDialogTarget.close()
    }
    this.newItemType = null
    this.newItemParent = ""
    this.newNoteTemplate = "empty"
  }

  focusNewNoteInput() {
    // Card clicks move focus to the card; return it to the input so typing
    // and Enter-to-create keep working without an extra click.
    this.newNoteInputTarget?.focus()
  }

  // Select a note type card ("empty" or "hugo")
  selectNewNoteTemplate(event) {
    const template = event.currentTarget.dataset.template
    if (template) this.setNewNoteTemplate(template)
    this.updateNewNotePreview()
    this.focusNewNoteInput()
  }

  setNewNoteTemplate(template) {
    this.newNoteTemplate = template

    this.newNoteTemplateCardTargets.forEach(card => {
      const selected = card.dataset.template === template
      card.setAttribute("aria-pressed", String(selected))
      card.classList.toggle("border-[var(--theme-border)]", !selected)
      card.classList.toggle("border-[var(--theme-accent)]", selected)
      card.classList.toggle("ring-1", selected)
      card.classList.toggle("ring-[var(--theme-accent)]", selected)
      card.classList.toggle("bg-[var(--theme-bg-hover)]", selected)
    })
  }

  // Live-update the path preview and the Create button state as the user types
  onNewNoteInput() {
    this.updateNewNotePreview()
  }

  updateNewNotePreview() {
    if (!this.hasNewNotePathTarget) return

    const result = previewNotePath({
      name: this.hasNewNoteInputTarget ? this.newNoteInputTarget.value : "",
      parent: this.newItemParent,
      template: this.newNoteTemplate,
      namePlaceholder: window.t("dialogs.new_note.name_slot"),
      rootSegment: window.t("dialogs.new_note.root")
    })

    this.newNotePathTarget.textContent = result.path
    this.newNotePathTarget.classList.toggle("text-[var(--theme-text-muted)]", result.valid)
    this.newNotePathTarget.classList.toggle("text-[var(--theme-text-faint)]", result.empty)
    this.newNotePathTarget.classList.toggle("text-[var(--theme-error)]", !result.valid && !result.empty)
    this.newNotePathTarget.parentElement.title = !result.valid && !result.empty
      ? window.t("dialogs.new_note.invalid_name")
      : ""

    if (this.hasNewNoteSubmitTarget) {
      this.newNoteSubmitTarget.disabled = !result.valid
    }
  }

  async submitNewNote() {
    if (!this.hasNewNoteInputTarget) return

    const name = this.newNoteInputTarget.value.trim()
    const template = this.newNoteTemplate
    // The Create button is disabled for invalid names, but Enter can still
    // fire — gate the keyboard path with the same rule.
    if (!canCreateNote(name, template)) return

    const parent = this.newItemParent

    try {
      await this.createNote(name, parent, template)
      this.closeNewNoteDialog()
    } catch (error) {
      console.error("Failed to create note:", error)
      alert(error.message || window.t("errors.failed_to_create"))
    }
  }

  onNewNoteKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault()
      this.submitNewNote()
    } else if (event.key === "Escape") {
      this.closeNewNoteDialog()
    }
  }

  // New Folder
  newFolder() {
    this.openNewItemDialog("folder", "")
  }

  // New Folder in Folder (from context menu)
  newFolderInFolder() {
    this.hideContextMenu()
    if (!this.contextItem || this.contextItem.type !== "folder") return
    this.openNewItemDialog("folder", this.contextItem.path)
  }

  openNewItemDialog(type, parent = "") {
    this.newItemType = type
    this.newItemParent = parent || ""

    if (this.hasNewItemTitleTarget) {
      this.newItemTitleTarget.textContent = window.t("dialogs.new_item.new_folder")
    }

    if (this.hasNewItemLocationTarget) {
      const where = this.newItemParent && this.newItemParent.length
        ? this.newItemParent
        : window.t("dialogs.new_item.root_location")
      this.newItemLocationTarget.textContent = `${window.t("dialogs.new_item.creating_in")} ${where}`
      this.newItemLocationTarget.title = where
    }

    if (this.hasNewItemInputTarget) {
      this.newItemInputTarget.value = ""
      this.newItemInputTarget.placeholder = window.t("dialogs.new_item.folder_placeholder")
    }

    if (this.hasNewItemDialogTarget) {
      this.newItemDialogTarget.showModal()
      this.newItemInputTarget?.focus()
    }
  }

  closeNewItemDialog() {
    if (this.hasNewItemDialogTarget) {
      this.newItemDialogTarget.close()
    }
    this.newItemType = null
    this.newItemParent = ""
  }

  async submitNewItem() {
    if (!this.hasNewItemInputTarget) return

    const name = this.newItemInputTarget.value.trim()
    if (!name) return

    const parent = this.newItemParent

    try {
      await this.createFolder(name, parent)
      this.closeNewItemDialog()
    } catch (error) {
      console.error("Failed to create item:", error)
      alert(error.message || window.t("errors.failed_to_create"))
    }
  }

  async createNote(name, parent, template) {
    let response
    const expanded = this.expandedFolders

    if (template === "hugo") {
      // Hugo posts: server generates path and content
      const title = name.replace(/\.md$/, "")
      response = await post("/notes", {
        body: { template: "hugo", title, parent: parent || "", expanded },
        responseKind: "turbo-stream"
      })
    } else {
      // Regular notes use simple filename
      const fileName = name.endsWith(".md") ? name : `${name}.md`
      const path = parent ? `${parent}/${fileName}` : fileName

      response = await post(`/notes/${encodePath(path)}`, {
        body: { content: "", expanded },
        responseKind: "turbo-stream"
      })
    }

    if (!response.ok) {
      const data = await response.json
      throw new Error(data.error || window.t("errors.failed_to_create"))
    }

    // Turbo Stream responses are auto-processed by request.js
    // For JSON fallback, extract the path
    const path = response.isTurboStream
      ? (response.headers.get("X-Created-Path") || this.inferCreatedPath(name, parent, template))
      : (await response.json).path
    this.dispatch("file-created", { detail: { path } })
  }

  // Infer the path for a created note when using turbo stream (no JSON body)
  inferCreatedPath(name, parent, template) {
    if (template === "hugo") {
      // The server marks the created file as selected in the turbo-stream response.
      // By the time post() resolves, Turbo has updated the DOM, so just query for it.
      const treeEl = document.getElementById("file-tree-content")
      const selected = treeEl?.querySelector('.tree-item.selected[data-type="file"]')
      if (selected?.dataset.path) return selected.dataset.path
      return name
    }
    const fileName = name.endsWith(".md") ? name : `${name}.md`
    return parent ? `${parent}/${fileName}` : fileName
  }

  async createFolder(name, parent) {
    const path = parent ? `${parent}/${name}` : name
    const expanded = this.expandedFolders

    const response = await post(`/folders/${encodePath(path)}?expanded=${encodeURIComponent(expanded)}`, {
      responseKind: "turbo-stream"
    })

    if (!response.ok) {
      const data = await response.json
      throw new Error(data.error || window.t("errors.failed_to_create"))
    }

    // Turbo Stream response auto-processed by request.js
    this.dispatch("folder-created", { detail: { path } })
  }

  // Rename
  renameItem() {
    this.hideContextMenu()
    if (!this.contextItem) return

    if (this.hasRenameInputTarget) {
      // Show just the name, not the full path
      const name = this.contextItem.path.split("/").pop()
      // Remove .md extension for display
      this.renameInputTarget.value = this.contextItem.type === "file"
        ? name.replace(/\.md$/, "")
        : name
    }

    if (this.hasRenameDialogTarget) {
      this.renameDialogTarget.showModal()
      this.renameInputTarget?.focus()
      this.renameInputTarget?.select()
    }
  }

  closeRenameDialog() {
    if (this.hasRenameDialogTarget) {
      this.renameDialogTarget.close()
    }
  }

  async submitRename() {
    if (!this.contextItem || !this.hasRenameInputTarget) return

    let newName = this.renameInputTarget.value.trim()
    if (!newName) return

    // Add .md extension for files if not present
    if (this.contextItem.type === "file" && !newName.endsWith(".md")) {
      newName = `${newName}.md`
    }

    // Build new path
    const pathParts = this.contextItem.path.split("/")
    pathParts[pathParts.length - 1] = newName
    const newPath = pathParts.join("/")

    // Don't rename if path is the same
    if (newPath === this.contextItem.path) {
      this.closeRenameDialog()
      return
    }

    try {
      const endpoint = this.contextItem.type === "file" ? "notes" : "folders"
      const expanded = this.expandedFolders
      const response = await post(`/${endpoint}/${encodePath(this.contextItem.path)}/rename`, {
        body: { new_path: newPath, expanded },
        responseKind: "turbo-stream"
      })

      if (!response.ok) {
        const data = await response.json
        throw new Error(data.error || window.t("errors.failed_to_rename"))
      }

      // Turbo Stream response auto-processed by request.js

      this.dispatch("file-renamed", {
        detail: {
          oldPath: this.contextItem.path,
          newPath: newPath,
          type: this.contextItem.type
        }
      })

      this.closeRenameDialog()
    } catch (error) {
      console.error("Failed to rename:", error)
      alert(error.message || window.t("errors.failed_to_rename"))
    }
  }

  // Delete
  async deleteItem() {
    this.hideContextMenu()
    if (!this.contextItem) return

    const itemName = this.contextItem.path.split("/").pop()
    const confirmKey = this.contextItem.type === "folder"
      ? "dialogs.confirm.delete_folder"
      : "dialogs.confirm.delete_file"

    if (!confirm(window.t(confirmKey, { name: itemName }))) {
      return
    }

    try {
      const endpoint = this.contextItem.type === "file" ? "notes" : "folders"
      const expanded = this.expandedFolders
      const response = await destroy(`/${endpoint}/${encodePath(this.contextItem.path)}?expanded=${encodeURIComponent(expanded)}`, {
        responseKind: "turbo-stream"
      })

      if (!response.ok) {
        const data = await response.json
        throw new Error(data.error || window.t("errors.failed_to_delete"))
      }

      // Turbo Stream response auto-processed by request.js

      this.dispatch("file-deleted", {
        detail: {
          path: this.contextItem.path,
          type: this.contextItem.type
        }
      })
    } catch (error) {
      console.error("Failed to delete:", error)
      alert(error.message || window.t("errors.failed_to_delete"))
    }
  }

  // Keyboard handlers
  onRenameKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault()
      this.submitRename()
    } else if (event.key === "Escape") {
      this.closeRenameDialog()
    }
  }

  onNewItemKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault()
      this.submitNewItem()
    } else if (event.key === "Escape") {
      this.closeNewItemDialog()
    }
  }
}
