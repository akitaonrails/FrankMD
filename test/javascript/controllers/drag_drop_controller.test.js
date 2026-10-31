/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
vi.mock("lib/app_prompt", () => ({ appAlert: vi.fn().mockResolvedValue(undefined) }))
import { Application } from "@hotwired/stimulus"
import DragDropController from "../../../app/javascript/controllers/drag_drop_controller.js"
import AppController from "../../../app/javascript/controllers/app_controller.js"
import { appAlert } from "lib/app_prompt"

// Mock window.t translation function
global.window = global.window || {}
window.t = (key) => key

describe("DragDropController", () => {
  let application, controller, element

  beforeEach(() => {
    vi.clearAllMocks()
    appAlert.mockResolvedValue(undefined)
    document.body.innerHTML = `
      <div data-controller="drag-drop">
        <div data-drag-drop-target="tree" class="file-tree">
          <div class="tree-item" data-path="folder1" data-drop-id="folder1" data-type="folder" draggable="true">
            <svg class="tree-icon"></svg>
            <span class="tree-label">Folder 1</span>
          </div>
          <div class="tree-item" data-path="folder1/subfolder" data-drop-id="folder1/subfolder" data-type="folder" draggable="true">
            <svg class="tree-icon"></svg>
            <span class="tree-label">Subfolder</span>
          </div>
          <div class="tree-item" data-path="folder1/file1.md" data-type="file" draggable="true">
            <svg class="tree-icon"></svg>
            <span class="tree-label">File 1</span>
          </div>
          <div class="tree-item" data-path="folder2" data-drop-id="folder2" data-type="folder" draggable="true">
            <svg class="tree-icon"></svg>
            <span class="tree-label">Folder 2</span>
          </div>
        </div>
      </div>
    `

    // Mock CSRF token
    const meta = document.createElement("meta")
    meta.name = "csrf-token"
    meta.content = "test-token"
    document.head.appendChild(meta)

    element = document.querySelector('[data-controller="drag-drop"]')
    application = Application.start()
    application.register("drag-drop", DragDropController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "drag-drop")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
    document.head.querySelector('meta[name="csrf-token"]')?.remove()
  })

  describe("connect()", () => {
    it("initializes with null state", () => {
      expect(controller.draggedItem).toBeNull()
      expect(controller.activeDropTargetId).toBeNull()
    })
  })

  describe("onDragStart()", () => {
    it("stores dragged item info", () => {
      const item = element.querySelector('[data-path="folder1/file1.md"]')
      const event = {
        currentTarget: item,
        dataTransfer: {
          effectAllowed: null,
          setData: vi.fn()
        }
      }

      controller.onDragStart(event)

      expect(controller.draggedItem).toEqual({
        path: "folder1/file1.md",
        type: "file"
      })
    })

    it("drags the whole selection when the grabbed item is selected (#266)", () => {
      const selection = [
        { path: "folder1/file1.md", type: "file" },
        { path: "notes.md", type: "file" },
        { path: "folder2", type: "folder" }
      ]
      controller.getAppController = () => ({ getSelectedExplorerItems: () => selection })
      const item = element.querySelector('[data-path="folder1/file1.md"]')

      controller.onDragStart({ currentTarget: item, dataTransfer: { effectAllowed: null, setData: vi.fn() } })

      expect(controller.draggedItems).toEqual(selection)
    })

    it("drags a single item when the grabbed item is not selected", () => {
      controller.getAppController = () => ({ getSelectedExplorerItems: () => [{ path: "other.md", type: "file" }] })
      const item = element.querySelector('[data-path="folder1/file1.md"]')

      controller.onDragStart({ currentTarget: item, dataTransfer: { effectAllowed: null, setData: vi.fn() } })

      expect(controller.draggedItems).toEqual([{ path: "folder1/file1.md", type: "file" }])
    })

    it("drags a single item when it is the only selection", () => {
      controller.getAppController = () => ({ getSelectedExplorerItems: () => [{ path: "folder1/file1.md", type: "file" }] })
      const item = element.querySelector('[data-path="folder1/file1.md"]')

      controller.onDragStart({ currentTarget: item, dataTransfer: { effectAllowed: null, setData: vi.fn() } })

      expect(controller.draggedItems).toEqual([{ path: "folder1/file1.md", type: "file" }])
    })

    it("excludes items covered by a selected ancestor folder (#266)", () => {
      controller.getAppController = () => ({
        getSelectedExplorerItems: () => [
          { path: "notes.md", type: "file" },
          { path: "folder1", type: "folder" },
          { path: "folder1/file1.md", type: "file" },
          { path: "folder1/subfolder", type: "folder" }
        ]
      })
      const item = element.querySelector('[data-path="folder1"]')

      controller.onDragStart({ currentTarget: item, dataTransfer: { effectAllowed: null, setData: vi.fn() } })

      expect(controller.draggedItems).toEqual([
        { path: "notes.md", type: "file" },
        { path: "folder1", type: "folder" }
      ])
    })

    it("sets dataTransfer data", () => {
      const item = element.querySelector('[data-path="folder1/file1.md"]')
      const setDataMock = vi.fn()
      const event = {
        currentTarget: item,
        dataTransfer: {
          effectAllowed: null,
          setData: setDataMock
        }
      }

      controller.onDragStart(event)

      expect(event.dataTransfer.effectAllowed).toBe("move")
      expect(setDataMock).toHaveBeenCalledWith("text/plain", "folder1/file1.md")
    })

    it("adds dragging class", () => {
      const item = element.querySelector('[data-path="folder1/file1.md"]')
      const event = {
        currentTarget: item,
        dataTransfer: {
          effectAllowed: null,
          setData: vi.fn()
        }
      }

      controller.onDragStart(event)

      expect(item.classList.contains("dragging")).toBe(true)
    })

    it("clears active drop target highlight", () => {
      const item = element.querySelector('[data-path="folder1/file1.md"]')
      const folder = element.querySelector('[data-path="folder2"]')
      folder.classList.add("drop-highlight")
      controller.activeDropTargetId = "folder2"
      const event = {
        currentTarget: item,
        dataTransfer: {
          effectAllowed: null,
          setData: vi.fn()
        }
      }

      controller.onDragStart(event)

      expect(controller.activeDropTargetId).toBeNull()
      expect(folder.classList.contains("drop-highlight")).toBe(false)
    })
  })

  describe("onDragEnd()", () => {
    it("clears draggedItem", () => {
      controller.draggedItem = { path: "test.md", type: "file" }
      const item = element.querySelector('[data-path="folder1/file1.md"]')
      item.classList.add("dragging", "drag-ghost")

      controller.onDragEnd({ currentTarget: item })

      expect(controller.draggedItem).toBeNull()
    })

    it("removes dragging classes", () => {
      const item = element.querySelector('[data-path="folder1/file1.md"]')
      item.classList.add("dragging", "drag-ghost")

      controller.onDragEnd({ currentTarget: item })

      expect(item.classList.contains("dragging")).toBe(false)
      expect(item.classList.contains("drag-ghost")).toBe(false)
    })

    it("clears active row and root highlights", () => {
      const item = element.querySelector('[data-path="folder1/file1.md"]')
      const folder = element.querySelector('[data-path="folder2"]')
      controller.activeDropTargetId = "folder2"
      controller.renderActiveDropTarget()
      controller.treeTarget.classList.add("drop-highlight-root")

      controller.onDragEnd({ currentTarget: item })

      expect(controller.activeDropTargetId).toBeNull()
      expect(folder.classList.contains("drop-highlight")).toBe(false)
      expect(controller.treeTarget.classList.contains("drop-highlight-root")).toBe(false)
    })
  })

  describe("onDragOver()", () => {
    it("prevents default and sets drop effect", () => {
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null }
      }

      controller.onDragOver(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.dataTransfer.dropEffect).toBe("move")
    })
  })

  describe("onDragOverRoot()", () => {
    it("prevents default and sets drop effect", () => {
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: controller.treeTarget
      }

      controller.onDragOverRoot(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.dataTransfer.dropEffect).toBe("move")
    })

    it("highlights folder under nested child target", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const folder = element.querySelector('[data-path="folder2"]')
      const nestedTarget = folder.querySelector(".tree-label")

      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: nestedTarget
      })

      expect(folder.classList.contains("drop-highlight")).toBe(true)
      expect(controller.activeDropTargetId).toBe("folder2")
    })

    it("highlights folder when drag target is a text node", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const folder = element.querySelector('[data-path="folder2"]')
      const textNodeTarget = folder.querySelector(".tree-label").firstChild

      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: textNodeTarget
      })

      expect(folder.classList.contains("drop-highlight")).toBe(true)
      expect(controller.activeDropTargetId).toBe("folder2")
    })

    it("keeps exactly one highlighted row while moving between folders", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const folder1 = element.querySelector('[data-path="folder1"]')
      const folder2 = element.querySelector('[data-path="folder2"]')
      const folder1Label = folder1.querySelector(".tree-label")
      const folder2Label = folder2.querySelector(".tree-label")

      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: folder1Label
      })

      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: folder2Label
      })

      expect(folder1.classList.contains("drop-highlight")).toBe(false)
      expect(folder2.classList.contains("drop-highlight")).toBe(true)
      expect(controller.treeTarget.querySelectorAll(".drop-highlight")).toHaveLength(1)
    })

    it("clears highlight for invalid targets", () => {
      const folder2 = element.querySelector('[data-path="folder2"]')
      const fileLabel = element.querySelector('[data-path="folder1/file1.md"] .tree-label')
      const folder1Label = element.querySelector('[data-path="folder1"] .tree-label')
      const subfolderLabel = element.querySelector('[data-path="folder1/subfolder"] .tree-label')

      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: folder2.querySelector(".tree-label")
      })
      expect(folder2.classList.contains("drop-highlight")).toBe(true)

      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: fileLabel
      })
      expect(folder2.classList.contains("drop-highlight")).toBe(false)
      expect(controller.activeDropTargetId).toBeNull()

      controller.draggedItem = { path: "folder1", type: "folder" }
      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: folder1Label
      })
      expect(controller.activeDropTargetId).toBeNull()

      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: subfolderLabel
      })
      expect(controller.activeDropTargetId).toBeNull()
    })

    it("does not highlight current parent folder", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const folder1Label = element.querySelector('[data-path="folder1"] .tree-label')

      controller.onDragOverRoot({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: null },
        target: folder1Label
      })

      expect(controller.activeDropTargetId).toBeNull()
      expect(element.querySelector('[data-path="folder1"]').classList.contains("drop-highlight")).toBe(false)
    })
  })

  describe("onDragLeaveRoot()", () => {
    it("does not clear highlights when moving within the tree", () => {
      const folder = element.querySelector('[data-path="folder2"]')
      controller.activeDropTargetId = "folder2"
      controller.renderActiveDropTarget()
      controller.treeTarget.classList.add("drop-highlight-root")

      controller.onDragLeaveRoot({
        relatedTarget: folder.querySelector(".tree-label")
      })

      expect(folder.classList.contains("drop-highlight")).toBe(true)
      expect(controller.treeTarget.classList.contains("drop-highlight-root")).toBe(true)
    })

    it("does not clear highlights when fallback pointer target is still inside the tree", () => {
      const folder = element.querySelector('[data-path="folder2"]')
      controller.activeDropTargetId = "folder2"
      controller.renderActiveDropTarget()
      controller.treeTarget.classList.add("drop-highlight-root")

      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        writable: true,
        value: vi.fn().mockReturnValue(folder.querySelector(".tree-label"))
      })

      controller.onDragLeaveRoot({
        relatedTarget: null,
        clientX: 10,
        clientY: 10
      })

      expect(folder.classList.contains("drop-highlight")).toBe(true)
      expect(controller.treeTarget.classList.contains("drop-highlight-root")).toBe(true)
    })

    it("clears highlights when leaving the tree container", () => {
      const folder = element.querySelector('[data-path="folder2"]')
      controller.activeDropTargetId = "folder2"
      controller.renderActiveDropTarget()
      controller.treeTarget.classList.add("drop-highlight-root")

      const outside = document.createElement("div")
      document.body.appendChild(outside)

      controller.onDragLeaveRoot({
        relatedTarget: outside
      })

      expect(folder.classList.contains("drop-highlight")).toBe(false)
      expect(controller.treeTarget.classList.contains("drop-highlight-root")).toBe(false)
      expect(controller.activeDropTargetId).toBeNull()
    })
  })

  describe("isValidDropTarget()", () => {
    it("accepts a folder outside the dragged set", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      controller.draggedItems = [
        { path: "folder1/file1.md", type: "file" },
        { path: "notes.md", type: "file" }
      ]
      const folder = element.querySelector('[data-path="folder2"]')

      expect(controller.isValidDropTarget(folder)).toBe(true)
    })

    it("rejects folders inside a dragged folder", () => {
      controller.draggedItem = { path: "folder1", type: "folder" }
      controller.draggedItems = [
        { path: "folder1", type: "folder" },
        { path: "notes.md", type: "file" }
      ]
      const subfolder = element.querySelector('[data-path="folder1/subfolder"]')

      expect(controller.isValidDropTarget(subfolder)).toBe(false)
    })

    it("rejects the shared current parent of every dragged item", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      controller.draggedItems = [
        { path: "folder1/file1.md", type: "file" },
        { path: "folder1/file2.md", type: "file" }
      ]
      const folder = element.querySelector('[data-path="folder1"]')

      expect(controller.isValidDropTarget(folder)).toBe(false)
    })

    it("accepts a folder that holds only some of the dragged items", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      controller.draggedItems = [
        { path: "folder1/file1.md", type: "file" },
        { path: "folder1/file2.md", type: "file" },
        { path: "notes.md", type: "file" }
      ]
      const folder = element.querySelector('[data-path="folder1"]')

      expect(controller.isValidDropTarget(folder)).toBe(true)
    })
  })

  describe("onDrop()", () => {
    it("moves every dragged item of a multi-selection (#266)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusCode: 200,
        headers: new Headers({ "content-type": "text/vnd.turbo-stream.html" }),
        text: Promise.resolve("")
      })
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      controller.draggedItems = [
        { path: "folder1/file1.md", type: "file" },
        { path: "folder1/file2.md", type: "file" }
      ]
      const folder = element.querySelector('[data-path="folder2"]')

      await controller.onDrop({ preventDefault: () => {}, stopPropagation: () => {}, currentTarget: folder })

      expect(global.fetch).toHaveBeenCalledTimes(2)
      const urls = global.fetch.mock.calls.map((call) => call[0])
      expect(urls).toContain("/notes/folder1/file1.md/rename")
      expect(urls).toContain("/notes/folder1/file2.md/rename")
      const bodies = global.fetch.mock.calls.map((call) => JSON.parse(call[1].body).new_path)
      expect(bodies).toEqual(["folder2/file1.md", "folder2/file2.md"])
    })

    it("prevents default and stops propagation", async () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const folder = element.querySelector('[data-path="folder2"]')
      folder.classList.add("drop-highlight")

      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: folder
      }

      // Mock fetch to reject (we'll test the API call separately)
      global.fetch = vi.fn().mockRejectedValue(new Error("test"))

      await controller.onDrop(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.stopPropagation).toHaveBeenCalled()
    })

    it("removes drop-highlight class", async () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const folder = element.querySelector('[data-path="folder2"]')
      controller.activeDropTargetId = "folder2"
      controller.renderActiveDropTarget()

      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      await controller.onDrop({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: folder
      })

      expect(folder.classList.contains("drop-highlight")).toBe(false)
      expect(controller.activeDropTargetId).toBeNull()
    })
  })

  describe("onDragEnterRoot()", () => {
    it("adds drop-highlight-root for nested items", () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const event = { preventDefault: vi.fn() }

      controller.onDragEnterRoot(event)

      expect(controller.treeTarget.classList.contains("drop-highlight-root")).toBe(true)
    })

    it("does not highlight for root-level items", () => {
      controller.draggedItem = { path: "root-file.md", type: "file" }
      const event = { preventDefault: vi.fn() }

      controller.onDragEnterRoot(event)

      expect(controller.treeTarget.classList.contains("drop-highlight-root")).toBe(false)
    })
  })

  describe("onDropToRoot()", () => {
    it("moves nested items to the root and skips items already there (#266)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusCode: 200,
        headers: new Headers({ "content-type": "text/vnd.turbo-stream.html" }),
        text: Promise.resolve("")
      })
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      controller.draggedItems = [
        { path: "folder1/file1.md", type: "file" },
        { path: "rootnote.md", type: "file" }
      ]

      await controller.onDropToRoot({ preventDefault: () => {}, stopPropagation: () => {} })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch.mock.calls[0][0]).toBe("/notes/folder1/file1.md/rename")
      expect(JSON.parse(global.fetch.mock.calls[0][1].body).new_path).toBe("file1.md")
    })

    it("stops moving the group after the first failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusCode: 422,
        headers: new Headers({ "content-type": "application/json" }),
        json: Promise.resolve({ error: "already exists" })
      })
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      controller.draggedItems = [
        { path: "folder1/file1.md", type: "file" },
        { path: "folder1/file2.md", type: "file" }
      ]

      await controller.onDropToRoot({ preventDefault: () => {}, stopPropagation: () => {} })

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it("clears active row highlight", async () => {
      controller.draggedItem = { path: "folder1/file1.md", type: "file" }
      const folder = element.querySelector('[data-path="folder2"]')
      controller.activeDropTargetId = "folder2"
      controller.renderActiveDropTarget()
      controller.treeTarget.classList.add("drop-highlight-root")

      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      await controller.onDropToRoot({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      })

      expect(folder.classList.contains("drop-highlight")).toBe(false)
      expect(controller.activeDropTargetId).toBeNull()
      expect(controller.treeTarget.classList.contains("drop-highlight-root")).toBe(false)
    })
  })

  describe("expandedFolders", () => {
    it("returns empty string when no app controller found", () => {
      expect(controller.expandedFolders).toBe("")
    })

    it("returns comma-separated expanded folders from app controller", () => {
      const appEl = document.createElement("div")
      appEl.setAttribute("data-controller", "app")
      document.body.appendChild(appEl)

      const mockApp = { expandedFolders: new Set(["folder1", "folder2"]) }
      vi.spyOn(controller.application, "getControllerForElementAndIdentifier")
        .mockReturnValue(mockApp)

      const result = controller.expandedFolders
      expect(result).toContain("folder1")
      expect(result).toContain("folder2")
      expect(result.split(",")).toHaveLength(2)

      appEl.remove()
    })
  })

  describe("moveItem()", () => {
    it("sends turbo-stream request with expanded folders", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusCode: 200,
        headers: new Headers({ "content-type": "text/vnd.turbo-stream.html" }),
        text: Promise.resolve("")
      })

      const dispatchSpy = vi.spyOn(controller, "dispatch")

      await controller.moveItem("folder1/file1.md", "folder2/file1.md", "file")

      expect(global.fetch).toHaveBeenCalled()
      const [url, options] = global.fetch.mock.calls[0]
      expect(url).toContain("/notes/folder1/file1.md/rename")
      expect(options.body).toContain("new_path")
      expect(options.body).toContain("expanded")

      expect(dispatchSpy).toHaveBeenCalledWith("item-moved", {
        detail: { oldPath: "folder1/file1.md", newPath: "folder2/file1.md", type: "file" }
      })
    })

    it("opens the destination folder and its ancestors before posting", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        statusCode: 200,
        headers: new Headers({ "content-type": "text/vnd.turbo-stream.html" }),
        text: Promise.resolve("")
      })
      const expandedFolders = new Set(["unrelated"])
      const app = Object.create(AppController.prototype)
      app.expandedFolders = expandedFolders
      app.hasFileTreeTarget = false
      controller.getAppController = () => app

      await controller.moveItem("file1.md", "folder2/sub/deep/file1.md", "file")

      expect(Array.from(expandedFolders).sort()).toEqual([
        "folder2",
        "folder2/sub",
        "folder2/sub/deep",
        "unrelated"
      ])
      expect(global.fetch).toHaveBeenCalled()
    })

    it("shows an app alert on error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      await controller.moveItem("folder1/file1.md", "folder2/file1.md", "file")

      expect(appAlert).toHaveBeenCalledWith("Network error")
    })

    it("does not move an active file when its local draft cannot be persisted", async () => {
      const autosave = { prepareForTransition: vi.fn(() => ({ ok: false, error: new Error("storage unavailable") })) }
      global.fetch = vi.fn()
      controller.getAppController = () => ({
        currentFile: "folder1/file1.md",
        getAutosaveController: () => autosave
      })
      await controller.moveItem("folder1/file1.md", "folder2/file1.md", "file")

      expect(global.fetch).not.toHaveBeenCalled()
      expect(autosave.prepareForTransition).toHaveBeenCalledOnce()
    })

    it("resumes active autosave if a move request fails", async () => {
      const resumeAfterTransition = vi.fn()
      const autosave = {
        prepareForTransition: vi.fn(() => ({ ok: true })),
        resumeAfterTransition
      }
      controller.getAppController = () => ({
        currentFile: "folder1/file1.md",
        getAutosaveController: () => autosave
      })
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      await controller.moveItem("folder1/file1.md", "folder2/file1.md", "file")

      expect(resumeAfterTransition).toHaveBeenCalledOnce()
    })
  })

  describe("disconnect()", () => {
    it("clears state", () => {
      controller.draggedItem = { path: "test.md", type: "file" }
      controller.activeDropTargetId = "folder2"

      controller.disconnect()

      expect(controller.draggedItem).toBeNull()
      expect(controller.activeDropTargetId).toBeNull()
    })
  })
})
