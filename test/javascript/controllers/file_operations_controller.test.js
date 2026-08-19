/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import FileOperationsController from "../../../app/javascript/controllers/file_operations_controller.js"

describe("FileOperationsController", () => {
  let application, controller, element

  beforeEach(() => {
    // Mock window.t for translations
    window.t = vi.fn((key, params) => {
      if (params) return `${key} ${JSON.stringify(params)}`
      return key
    })

    // Add CSRF token
    document.head.innerHTML = '<meta name="csrf-token" content="test-token">'

    document.body.innerHTML = `
      <div data-controller="file-operations">
        <div data-file-operations-target="contextMenu" class="hidden">
          <button data-action="click->file-operations#renameItem">Rename</button>
          <button data-action="click->file-operations#deleteItem">Delete</button>
          <button data-action="click->file-operations#newNoteInFolder">New Note</button>
          <button data-action="click->file-operations#newFolderInFolder">New Folder</button>
        </div>
        <dialog data-file-operations-target="renameDialog">
          <input data-file-operations-target="renameInput" type="text" />
        </dialog>
        <dialog data-file-operations-target="newNoteDialog">
          <input data-file-operations-target="newNoteInput" type="text" />
          <button data-file-operations-target="newNoteTemplateCard" data-template="empty" aria-pressed="true">Empty Document</button>
          <button data-file-operations-target="newNoteTemplateCard" data-template="hugo" aria-pressed="false">Hugo Blog Post</button>
          <div><span data-file-operations-target="newNotePath"></span></div>
          <button data-file-operations-target="newNoteSubmit" disabled>Create</button>
        </dialog>
        <dialog data-file-operations-target="newItemDialog">
          <h3 data-file-operations-target="newItemTitle"></h3>
          <p data-file-operations-target="newItemLocation"></p>
          <input data-file-operations-target="newItemInput" type="text" />
        </dialog>
      </div>
    `

    // Mock showModal and close for dialog
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.open = false
    })

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ path: "test.md" }),
      text: () => Promise.resolve('{"path": "test.md"}')
    })

    // Mock confirm
    global.confirm = vi.fn().mockReturnValue(true)

    element = document.querySelector('[data-controller="file-operations"]')
    application = Application.start()
    application.register("file-operations", FileOperationsController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "file-operations")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("initializes context item to null", () => {
      expect(controller.contextItem).toBeNull()
    })

    it("initializes new item type to null", () => {
      expect(controller.newItemType).toBeNull()
    })

    it("initializes new item parent to empty string", () => {
      expect(controller.newItemParent).toBe("")
    })

    it("initializes the new note template to empty document", () => {
      expect(controller.newNoteTemplate).toBe("empty")
    })
  })

  describe("showContextMenu()", () => {
    it("shows context menu at click position", () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 200,
        currentTarget: {
          dataset: { path: "test.md", type: "file" }
        }
      }

      controller.showContextMenu(event)

      expect(controller.contextMenuTarget.classList.contains("hidden")).toBe(false)
      expect(controller.contextMenuTarget.style.left).toBe("100px")
      expect(controller.contextMenuTarget.style.top).toBe("200px")
    })

    it("stores context item", () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 200,
        currentTarget: {
          dataset: { path: "folder/test.md", type: "file" }
        }
      }

      controller.showContextMenu(event)

      expect(controller.contextItem).toEqual({ path: "folder/test.md", type: "file" })
    })

    it("does not show for config files", () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 200,
        currentTarget: {
          dataset: { path: "config.yml", type: "file", fileType: "config" }
        }
      }

      controller.showContextMenu(event)

      expect(controller.contextMenuTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("hideContextMenu()", () => {
    it("hides the context menu", () => {
      controller.contextMenuTarget.classList.remove("hidden")

      controller.hideContextMenu()

      expect(controller.contextMenuTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("newNote()", () => {
    it("opens the new note dialog directly", () => {
      controller.newNote()

      expect(controller.newNoteDialogTarget.showModal).toHaveBeenCalled()
    })

    it("clears a stale parent from a prior folder-scoped new note", () => {
      // Simulate a cancelled "New Note in Folder" having left a parent behind.
      controller.newItemParent = "some/folder"

      controller.newNote()

      expect(controller.newItemParent).toBe("")
    })

    it("resets the input and selects the empty template", () => {
      controller.newNoteInputTarget.value = "leftover"

      controller.newNote()

      expect(controller.newNoteInputTarget.value).toBe("")
      expect(controller.newNoteTemplate).toBe("empty")
      expect(controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "empty").getAttribute("aria-pressed")).toBe("true")
      expect(controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo").getAttribute("aria-pressed")).toBe("false")
    })

    it("disables create while the name is empty", () => {
      controller.newNote()

      expect(controller.newNoteSubmitTarget.disabled).toBe(true)
    })
  })

  describe("newNoteInFolder()", () => {
    it("hides context menu and opens the new note dialog with the folder as parent", () => {
      controller.contextItem = { path: "parent/folder", type: "folder" }
      controller.contextMenuTarget.classList.remove("hidden")

      controller.newNoteInFolder()

      expect(controller.contextMenuTarget.classList.contains("hidden")).toBe(true)
      expect(controller.newNoteDialogTarget.showModal).toHaveBeenCalled()
      expect(controller.newItemParent).toBe("parent/folder")
    })

    it("previews the path inside the parent folder", () => {
      controller.contextItem = { path: "parent/folder", type: "folder" }
      controller.newNoteInFolder()
      controller.newNoteInputTarget.value = "my-note"
      controller.onNewNoteInput()

      expect(controller.newNotePathTarget.textContent).toBe("parent/folder/my-note.md")
    })

    it("does nothing if context item is not a folder", () => {
      controller.contextItem = { path: "test.md", type: "file" }

      controller.newNoteInFolder()

      expect(controller.newNoteDialogTarget.showModal).not.toHaveBeenCalled()
    })

    it("does nothing if no context item", () => {
      controller.contextItem = null

      controller.newNoteInFolder()

      expect(controller.newNoteDialogTarget.showModal).not.toHaveBeenCalled()
    })
  })

  describe("selectNewNoteTemplate()", () => {
    it("switches the selection to the hugo card", () => {
      controller.newNote()

      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo") })

      expect(controller.newNoteTemplate).toBe("hugo")
      expect(controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "empty").getAttribute("aria-pressed")).toBe("false")
      expect(controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo").getAttribute("aria-pressed")).toBe("true")
    })

    it("styles the selected card with the accent border", () => {
      controller.newNote()

      const hugoCard = controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo")
      controller.selectNewNoteTemplate({ currentTarget: hugoCard })

      expect(hugoCard.classList.contains("border-[var(--theme-accent)]")).toBe(true)
      expect(hugoCard.classList.contains("ring-1")).toBe(true)
      expect(hugoCard.classList.contains("bg-[var(--theme-bg-hover)]")).toBe(true)
      expect(hugoCard.classList.contains("border-[var(--theme-border)]")).toBe(false)
    })

    it("switches the preview to a dated hugo page bundle", () => {
      controller.newNote()
      controller.newNoteInputTarget.value = "my-post"

      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo") })

      // window.t is mocked to return the key, so the root segment is the key
      expect(controller.newNotePathTarget.textContent).toMatch(/\/\d{4}\/\d{2}\/\d{2}\/my-post\/index\.md$/)
    })

    it("switches back to the empty document preview", () => {
      controller.newNote()
      controller.newNoteInputTarget.value = "my-post"
      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo") })

      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "empty") })

      expect(controller.newNoteTemplate).toBe("empty")
      expect(controller.newNotePathTarget.textContent).toBe("dialogs.new_note.root/my-post.md")
    })
  })

  describe("updateNewNotePreview() / onNewNoteInput()", () => {
    it("shows the muted placeholder slot while the name is empty", () => {
      controller.newNote()

      expect(controller.newNotePathTarget.textContent).toBe("dialogs.new_note.root/dialogs.new_note.name_slot.md")
      expect(controller.newNotePathTarget.classList.contains("text-[var(--theme-text-faint)]")).toBe(true)
      expect(controller.newNoteSubmitTarget.disabled).toBe(true)
    })

    it("previews root/<name>.md as the user types", () => {
      controller.newNote()
      controller.newNoteInputTarget.value = "my-note"
      controller.onNewNoteInput()

      expect(controller.newNotePathTarget.textContent).toBe("dialogs.new_note.root/my-note.md")
      expect(controller.newNoteSubmitTarget.disabled).toBe(false)
      expect(controller.newNotePathTarget.classList.contains("text-[var(--theme-text-muted)]")).toBe(true)
    })

    it("flags slash-containing names as invalid", () => {
      controller.newNote()
      controller.newNoteInputTarget.value = "nested/path"
      controller.onNewNoteInput()

      expect(controller.newNotePathTarget.classList.contains("text-[var(--theme-error)]")).toBe(true)
      expect(controller.newNoteSubmitTarget.disabled).toBe(true)
      expect(controller.newNotePathTarget.parentElement.title).toBe("dialogs.new_note.invalid_name")
    })

    it("flags hugo names that slugify to nothing as invalid", () => {
      controller.newNote()
      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo") })
      controller.newNoteInputTarget.value = "!!!"
      controller.onNewNoteInput()

      expect(controller.newNoteSubmitTarget.disabled).toBe(true)
      expect(controller.newNotePathTarget.classList.contains("text-[var(--theme-error)]")).toBe(true)
    })

    it("enables create for a valid hugo name", () => {
      controller.newNote()
      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo") })
      controller.newNoteInputTarget.value = "My Post"
      controller.onNewNoteInput()

      expect(controller.newNoteSubmitTarget.disabled).toBe(false)
    })
  })

  describe("closeNewNoteDialog()", () => {
    it("closes the new note dialog", () => {
      controller.newNote()
      controller.closeNewNoteDialog()

      expect(controller.newNoteDialogTarget.close).toHaveBeenCalled()
    })

    it("resets state", () => {
      controller.newNote()
      controller.newItemParent = "parent"

      controller.closeNewNoteDialog()

      expect(controller.newItemType).toBeNull()
      expect(controller.newItemParent).toBe("")
      expect(controller.newNoteTemplate).toBe("empty")
    })
  })

  describe("submitNewNote()", () => {
    it("does nothing with empty input", async () => {
      controller.newNote()
      controller.newNoteInputTarget.value = ""

      await controller.submitNewNote()

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("does nothing with an invalid name (slashes)", async () => {
      controller.newNote()
      controller.newNoteInputTarget.value = "nested/path"

      await controller.submitNewNote()

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("creates an empty-document note via API", async () => {
      controller.newNote()
      controller.newNoteInputTarget.value = "test"

      await controller.submitNewNote()

      expect(global.fetch).toHaveBeenCalledWith("/notes/test.md", expect.objectContaining({
        method: "POST"
      }))
    })

    it("creates a hugo post via the template API", async () => {
      controller.newNote()
      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo") })
      controller.newNoteInputTarget.value = "My Post"

      await controller.submitNewNote()

      expect(global.fetch).toHaveBeenCalledWith("/notes", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"template":"hugo"')
      }))
      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.title).toBe("My Post")
      expect(body.parent).toBe("")
    })

    it("passes the parent folder for folder-scoped notes", async () => {
      controller.contextItem = { path: "docs", type: "folder" }
      controller.newNoteInFolder()
      controller.newNoteInputTarget.value = "My Post"
      controller.selectNewNoteTemplate({ currentTarget: controller.newNoteTemplateCardTargets.find(c => c.dataset.template === "hugo") })

      await controller.submitNewNote()

      const body = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(body.parent).toBe("docs")
    })

    it("dispatches file-created event", async () => {
      const handler = vi.fn()
      element.addEventListener("file-operations:file-created", handler)

      controller.newNote()
      controller.newNoteInputTarget.value = "test"

      await controller.submitNewNote()

      expect(handler).toHaveBeenCalled()
    })

    it("closes the dialog after successful creation", async () => {
      controller.newNote()
      controller.newNoteInputTarget.value = "test"

      await controller.submitNewNote()

      expect(controller.newNoteDialogTarget.close).toHaveBeenCalled()
    })

    it("keeps the dialog open and alerts on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ error: "already exists" }),
        text: () => Promise.resolve('{"error": "already exists"}')
      })
      global.alert = vi.fn()
      controller.newNote()
      controller.newNoteInputTarget.value = "test"

      await controller.submitNewNote()

      expect(global.alert).toHaveBeenCalledWith("already exists")
      expect(controller.newNoteDialogTarget.close).not.toHaveBeenCalled()
    })
  })

  describe("newFolder()", () => {
    it("opens new item dialog for folder", () => {
      const openSpy = vi.spyOn(controller, "openNewItemDialog")

      controller.newFolder()

      expect(openSpy).toHaveBeenCalledWith("folder", "")
    })
  })

  describe("openNewItemDialog() location", () => {
    it("shows the parent path when creating inside a folder", () => {
      controller.openNewItemDialog("folder", "docs/guides")

      expect(controller.newItemLocationTarget.textContent).toContain("docs/guides")
      expect(controller.newItemLocationTarget.title).toBe("docs/guides")
    })

    it("shows the root location label when creating at the root", () => {
      controller.openNewItemDialog("folder", "")

      expect(controller.newItemLocationTarget.textContent).toContain("dialogs.new_item.root_location")
    })
  })

  describe("newFolderInFolder()", () => {
    it("hides context menu and opens new item dialog for folder", () => {
      controller.contextItem = { path: "parent/myfolder", type: "folder" }
      controller.contextMenuTarget.classList.remove("hidden")
      const openSpy = vi.spyOn(controller, "openNewItemDialog")

      controller.newFolderInFolder()

      expect(controller.contextMenuTarget.classList.contains("hidden")).toBe(true)
      expect(openSpy).toHaveBeenCalledWith("folder", "parent/myfolder")
    })

    it("does nothing if context item is not a folder", () => {
      controller.contextItem = { path: "test.md", type: "file" }
      const openSpy = vi.spyOn(controller, "openNewItemDialog")

      controller.newFolderInFolder()

      expect(openSpy).not.toHaveBeenCalled()
    })

    it("does nothing if no context item", () => {
      controller.contextItem = null
      const openSpy = vi.spyOn(controller, "openNewItemDialog")

      controller.newFolderInFolder()

      expect(openSpy).not.toHaveBeenCalled()
    })
  })

  describe("openNewItemDialog()", () => {
    it("shows the new item dialog", () => {
      controller.openNewItemDialog("folder", "")

      expect(controller.newItemDialogTarget.showModal).toHaveBeenCalled()
    })

    it("sets new item type", () => {
      controller.openNewItemDialog("folder", "parent")

      expect(controller.newItemType).toBe("folder")
      expect(controller.newItemParent).toBe("parent")
    })

    it("always shows the folder title", () => {
      controller.openNewItemDialog("folder", "")

      expect(controller.newItemTitleTarget.textContent).toBe("dialogs.new_item.new_folder")
    })
  })

  describe("closeNewItemDialog()", () => {
    it("closes the new item dialog", () => {
      controller.openNewItemDialog("folder", "")
      controller.closeNewItemDialog()

      expect(controller.newItemDialogTarget.close).toHaveBeenCalled()
    })

    it("resets state", () => {
      controller.newItemType = "folder"
      controller.newItemParent = "parent"

      controller.closeNewItemDialog()

      expect(controller.newItemType).toBeNull()
      expect(controller.newItemParent).toBe("")
    })
  })

  describe("submitNewItem()", () => {
    it("does nothing with empty input", async () => {
      controller.openNewItemDialog("folder", "")
      controller.newItemInputTarget.value = ""

      await controller.submitNewItem()

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("creates folder via API", async () => {
      controller.openNewItemDialog("folder", "")
      controller.newItemInputTarget.value = "newfolder"

      await controller.submitNewItem()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/folders/newfolder"),
        expect.objectContaining({ method: "POST" })
      )
    })

    it("dispatches folder-created event", async () => {
      const handler = vi.fn()
      element.addEventListener("file-operations:folder-created", handler)

      controller.openNewItemDialog("folder", "")
      controller.newItemInputTarget.value = "newfolder"

      await controller.submitNewItem()

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("renameItem()", () => {
    it("hides context menu", () => {
      controller.contextItem = { path: "test.md", type: "file" }
      controller.renameItem()

      expect(controller.contextMenuTarget.classList.contains("hidden")).toBe(true)
    })

    it("shows rename dialog", () => {
      controller.contextItem = { path: "test.md", type: "file" }
      controller.renameItem()

      expect(controller.renameDialogTarget.showModal).toHaveBeenCalled()
    })

    it("populates input with file name without extension", () => {
      controller.contextItem = { path: "folder/myfile.md", type: "file" }
      controller.renameItem()

      expect(controller.renameInputTarget.value).toBe("myfile")
    })

    it("populates input with folder name", () => {
      controller.contextItem = { path: "parent/myfolder", type: "folder" }
      controller.renameItem()

      expect(controller.renameInputTarget.value).toBe("myfolder")
    })
  })

  describe("closeRenameDialog()", () => {
    it("closes the rename dialog", () => {
      controller.contextItem = { path: "test.md", type: "file" }
      controller.renameItem()
      controller.closeRenameDialog()

      expect(controller.renameDialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("submitRename()", () => {
    it("does nothing with empty input", async () => {
      controller.contextItem = { path: "test.md", type: "file" }
      controller.renameInputTarget.value = ""

      await controller.submitRename()

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("adds .md extension for files", async () => {
      controller.contextItem = { path: "test.md", type: "file" }
      controller.renameInputTarget.value = "newname"

      await controller.submitRename()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/notes/"),
        expect.objectContaining({
          body: expect.stringContaining("newname.md")
        })
      )
    })

    it("dispatches file-renamed event", async () => {
      const handler = vi.fn()
      element.addEventListener("file-operations:file-renamed", handler)

      controller.contextItem = { path: "old.md", type: "file" }
      controller.renameInputTarget.value = "new"

      await controller.submitRename()

      expect(handler).toHaveBeenCalled()
      const detail = handler.mock.calls[0][0].detail
      expect(detail.oldPath).toBe("old.md")
      expect(detail.newPath).toBe("new.md")
    })

    it("closes dialog after successful rename", async () => {
      controller.contextItem = { path: "test.md", type: "file" }
      controller.renameInputTarget.value = "newname"

      await controller.submitRename()

      expect(controller.renameDialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("deleteItem()", () => {
    it("hides context menu", async () => {
      controller.contextItem = { path: "test.md", type: "file" }
      await controller.deleteItem()

      expect(controller.contextMenuTarget.classList.contains("hidden")).toBe(true)
    })

    it("shows confirmation dialog", async () => {
      controller.contextItem = { path: "test.md", type: "file" }
      await controller.deleteItem()

      expect(global.confirm).toHaveBeenCalled()
    })

    it("does not delete if confirmation cancelled", async () => {
      global.confirm = vi.fn().mockReturnValue(false)
      controller.contextItem = { path: "test.md", type: "file" }

      await controller.deleteItem()

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it("calls delete API", async () => {
      controller.contextItem = { path: "test.md", type: "file" }

      await controller.deleteItem()

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/notes/"),
        expect.objectContaining({ method: "DELETE" })
      )
    })

    it("dispatches file-deleted event", async () => {
      const handler = vi.fn()
      element.addEventListener("file-operations:file-deleted", handler)

      controller.contextItem = { path: "test.md", type: "file" }

      await controller.deleteItem()

      expect(handler).toHaveBeenCalled()
      expect(handler.mock.calls[0][0].detail.path).toBe("test.md")
    })
  })

  describe("onRenameKeydown()", () => {
    it("submits on Enter", () => {
      const submitSpy = vi.spyOn(controller, "submitRename")
      const event = { key: "Enter", preventDefault: vi.fn() }

      controller.onRenameKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(submitSpy).toHaveBeenCalled()
    })

    it("closes on Escape", () => {
      const closeSpy = vi.spyOn(controller, "closeRenameDialog")
      const event = { key: "Escape", preventDefault: vi.fn() }

      controller.onRenameKeydown(event)

      expect(closeSpy).toHaveBeenCalled()
    })
  })

  describe("onNewItemKeydown()", () => {
    it("submits on Enter", () => {
      const submitSpy = vi.spyOn(controller, "submitNewItem")
      const event = { key: "Enter", preventDefault: vi.fn() }

      controller.onNewItemKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(submitSpy).toHaveBeenCalled()
    })

    it("closes on Escape", () => {
      const closeSpy = vi.spyOn(controller, "closeNewItemDialog")
      const event = { key: "Escape", preventDefault: vi.fn() }

      controller.onNewItemKeydown(event)

      expect(closeSpy).toHaveBeenCalled()
    })
  })

  describe("onNewNoteKeydown()", () => {
    it("submits on Enter", () => {
      const submitSpy = vi.spyOn(controller, "submitNewNote")
      const event = { key: "Enter", preventDefault: vi.fn() }

      controller.onNewNoteKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(submitSpy).toHaveBeenCalled()
    })

    it("closes on Escape", () => {
      const closeSpy = vi.spyOn(controller, "closeNewNoteDialog")
      const event = { key: "Escape", preventDefault: vi.fn() }

      controller.onNewNoteKeydown(event)

      expect(closeSpy).toHaveBeenCalled()
    })
  })
})
