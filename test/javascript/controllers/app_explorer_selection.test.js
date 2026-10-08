/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller"

function createAppFixture(markup = "") {
  const fileTree = document.createElement("div")
  fileTree.innerHTML = markup
  const fileOperations = { deleteItems: vi.fn(), renameExplorerItem: vi.fn() }
  const app = {
    fileTreeTarget: fileTree,
    expandedFolders: new Set(),
    explorerSelection: new Map(),
    explorerSelectionAnchor: null,
    _settingExplorerFocus: false,
    _explorerPointerDownItem: null,
    invalidateTreeRefreshes: vi.fn(),
    getFileOperationsController: () => fileOperations,
    ...Object.fromEntries([
      "explorerItemKey",
      "getSelectedExplorerItems",
      "syncExplorerSelection",
      "visibleExplorerItems",
      "focusExplorerItem",
      "selectExplorerItem",
      "remapExplorerSelection",
      "removeExplorerSelection"
    ].map((name) => [name, AppController.prototype[name]]))
  }

  return { app, fileTree, fileOperations }
}

function clickEvent(item, overrides = {}) {
  return {
    currentTarget: item,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides
  }
}

function deleteKeyEvent(item, overrides = {}) {
  return {
    ...clickEvent(item),
    key: "Delete",
    altKey: false,
    repeat: false,
    preventDefault: vi.fn(),
    ...overrides
  }
}

function renameKeyEvent(item, overrides = {}) {
  return deleteKeyEvent(item, { key: "F2", ...overrides })
}

function select(app, item) {
  app.selectExplorerItem(item)
}

describe("Explorer selection and keyboard actions", () => {
  it("selects and toggles a folder without opening a note", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-folder">
        <div class="tree-item" tabindex="0" data-path="docs" data-type="folder">
          <svg class="tree-chevron"></svg>
        </div>
        <div class="tree-children hidden"></div>
      </div>
    `)
    const folder = fileTree.querySelector('[data-type="folder"]')

    AppController.prototype.toggleFolder.call(app, clickEvent(folder))

    expect(folder.classList.contains("explorer-selected")).toBe(true)
    expect(app.expandedFolders.has("docs")).toBe(true)
    expect(fileTree.querySelector(".tree-children").classList.contains("hidden")).toBe(false)
  })

  it("keeps the open-file marker independent from the selection background", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item selected" data-path="open.md" data-type="file"></div>
      <div class="tree-item" data-path="docs" data-type="folder"></div>
    `)
    const openFile = fileTree.querySelector('[data-path="open.md"]')
    const folder = fileTree.querySelector('[data-type="folder"]')

    select(app, folder)

    expect(openFile.classList.contains("selected")).toBe(true)
    expect(openFile.classList.contains("explorer-selected")).toBe(false)
    expect(folder.classList.contains("explorer-selected")).toBe(true)
  })

  it("replaces the selection on a plain click", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path="first.md" data-type="file"></div>
      <div class="tree-item" tabindex="0" data-path="docs" data-type="folder"></div>
    `)
    const first = fileTree.querySelector('[data-path="first.md"]')
    const folder = fileTree.querySelector('[data-path="docs"]')
    select(app, first)

    app.selectExplorerItem(folder, clickEvent(folder))

    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["docs"])
  })

  it.each(["ctrlKey", "metaKey"])("toggles selection with %s", (modifier) => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path="first.md" data-type="file"></div>
      <div class="tree-item" tabindex="0" data-path="second.md" data-type="file"></div>
    `)
    const [first, second] = fileTree.querySelectorAll(".tree-item")
    select(app, first)

    app.selectExplorerItem(second, clickEvent(second, { [modifier]: true }))
    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["first.md", "second.md"])

    app.selectExplorerItem(second, clickEvent(second, { [modifier]: true }))
    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["first.md"])
  })

  it("selects visible Shift ranges and adds a range with Ctrl+Shift", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path="a.md" data-type="file"></div>
      <div class="tree-folder">
        <div class="tree-item" tabindex="0" data-path="closed" data-type="folder"></div>
        <div class="tree-children hidden"><div class="tree-item" data-path="hidden.md" data-type="file"></div></div>
      </div>
      <div class="tree-item" tabindex="0" data-path="b.md" data-type="file"></div>
      <div class="tree-item" tabindex="0" data-path="c.md" data-type="file"></div>
    `)
    const rows = fileTree.querySelectorAll(".tree-item")
    const [first, , , second, third] = rows
    select(app, first)

    app.selectExplorerItem(third, clickEvent(third, { shiftKey: true }))
    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["a.md", "closed", "b.md", "c.md"])
    expect(fileTree.querySelector('[data-path="hidden.md"]').classList.contains("explorer-selected")).toBe(false)

    select(app, second)
    app.selectExplorerItem(first, clickEvent(first, { ctrlKey: true, shiftKey: true }))
    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["a.md", "closed", "b.md"])
  })

  it("does not collapse modifier selection when pointer focus fires first", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path="first.md" data-type="file"></div>
      <div class="tree-item" tabindex="0" data-path="second.md" data-type="file"></div>
    `)
    const [first, second] = fileTree.querySelectorAll(".tree-item")
    select(app, first)
    app.selectExplorerItem(second, clickEvent(second, { ctrlKey: true }))
    app._explorerPointerDownItem = second

    AppController.prototype.onExplorerItemFocus.call(app, { currentTarget: second })

    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["first.md", "second.md"])
  })

  it("selects one row when keyboard focus moves to it", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path="first.md" data-type="file"></div>
      <div class="tree-item" tabindex="0" data-path="second.md" data-type="file"></div>
    `)
    const [first, second] = fileTree.querySelectorAll(".tree-item")
    select(app, first)

    AppController.prototype.onExplorerItemFocus.call(app, { currentTarget: second })

    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["second.md"])
  })

  it("selects a modifier-clicked file without opening it", async () => {
    const { app, fileTree } = createAppFixture('<div class="tree-item" tabindex="0" data-path="note.md" data-type="file"></div>')
    const item = fileTree.firstElementChild
    app.loadFile = vi.fn()

    await AppController.prototype.selectFile.call(app, clickEvent(item, { shiftKey: true }))

    expect(item.classList.contains("explorer-selected")).toBe(true)
    expect(app.loadFile).not.toHaveBeenCalled()
  })

  it("remaps selected folders and descendants after a rename or move", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item" data-path="new-folder" data-type="folder"></div>
      <div class="tree-item" data-path="new-folder/note.md" data-type="file"></div>
      <div class="tree-item" data-path="outside.md" data-type="file"></div>
    `)
    app.explorerSelection.set(JSON.stringify(["folder", "old-folder"]), { path: "old-folder", type: "folder" })
    app.explorerSelection.set(JSON.stringify(["file", "old-folder/note.md"]), { path: "old-folder/note.md", type: "file" })
    app.explorerSelection.set(JSON.stringify(["file", "outside.md"]), { path: "outside.md", type: "file" })
    app.explorerSelectionAnchor = JSON.stringify(["folder", "old-folder"])

    AppController.prototype.remapExplorerSelection.call(app, "old-folder", "new-folder", "folder")

    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual([
      "new-folder",
      "new-folder/note.md",
      "outside.md"
    ])
    expect(app.explorerSelectionAnchor).toBe(JSON.stringify(["folder", "new-folder"]))
    expect(fileTree.querySelector('[data-path="new-folder/note.md"]').classList.contains("explorer-selected")).toBe(true)
  })

  it("removes selected descendants when a folder is deleted", () => {
    const { app, fileTree } = createAppFixture(`
      <div class="tree-item" data-path="docs" data-type="folder"></div>
      <div class="tree-item" data-path="docs/note.md" data-type="file"></div>
      <div class="tree-item" data-path="outside.md" data-type="file"></div>
    `)
    for (const item of fileTree.querySelectorAll(".tree-item")) {
      const value = { path: item.dataset.path, type: item.dataset.type }
      app.explorerSelection.set(app.explorerItemKey(value), value)
    }
    app.explorerSelectionAnchor = JSON.stringify(["folder", "docs"])

    AppController.prototype.removeExplorerSelection.call(app, "docs", "folder")

    expect(app.getSelectedExplorerItems().map((item) => item.path)).toEqual(["outside.md"])
    expect(app.explorerSelectionAnchor).toBeNull()
  })

  it("routes Delete for selected files and folders through the bulk delete action", () => {
    const { app, fileTree, fileOperations } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path="note.md" data-type="file"></div>
      <div class="tree-item" tabindex="0" data-path="docs" data-type="folder"></div>
    `)
    const [file, folder] = fileTree.querySelectorAll(".tree-item")
    select(app, file)
    app.selectExplorerItem(folder, clickEvent(folder, { ctrlKey: true }))
    const event = deleteKeyEvent(folder)

    AppController.prototype.deleteSelectedExplorerItem.call(app, event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(fileOperations.deleteItems).toHaveBeenCalledWith([
      { path: "note.md", type: "file" },
      { path: "docs", type: "folder" }
    ])
  })

  it("renames only a single selected eligible row with F2", () => {
    const { app, fileTree, fileOperations } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path="note.md" data-type="file"></div>
      <div class="tree-item" tabindex="0" data-path="docs" data-type="folder"></div>
    `)
    const [file, folder] = fileTree.querySelectorAll(".tree-item")
    select(app, file)

    AppController.prototype.renameSelectedExplorerItem.call(app, renameKeyEvent(file))
    expect(fileOperations.renameExplorerItem).toHaveBeenCalledWith({ path: "note.md", type: "file" })

    app.selectExplorerItem(folder, clickEvent(folder, { ctrlKey: true }))
    AppController.prototype.renameSelectedExplorerItem.call(app, renameKeyEvent(folder))
    expect(fileOperations.renameExplorerItem).toHaveBeenCalledOnce()
  })

  it("does not delete when selection is empty, outside the Explorer, or only protected config", () => {
    const { app, fileTree, fileOperations } = createAppFixture(
      '<div class="tree-item" data-path="note.md" data-type="file"></div><div class="tree-item" data-path=".fed" data-type="file" data-file-type="config"></div>'
    )
    const [note, config] = fileTree.querySelectorAll(".tree-item")
    AppController.prototype.deleteSelectedExplorerItem.call(app, deleteKeyEvent(note))
    select(app, config)
    AppController.prototype.deleteSelectedExplorerItem.call(app, deleteKeyEvent(config))

    const outsideItem = document.createElement("div")
    outsideItem.className = "tree-item explorer-selected"
    outsideItem.dataset.path = "outside.md"
    outsideItem.dataset.type = "file"
    AppController.prototype.deleteSelectedExplorerItem.call(app, deleteKeyEvent(outsideItem))

    expect(fileOperations.deleteItems).not.toHaveBeenCalled()
  })

  it("does not rename config, unselected, or multiply selected rows", () => {
    const { app, fileTree, fileOperations } = createAppFixture(`
      <div class="tree-item" tabindex="0" data-path=".fed" data-type="file" data-file-type="config"></div>
      <div class="tree-item" tabindex="0" data-path="note.md" data-type="file"></div>
    `)
    const [config, note] = fileTree.querySelectorAll(".tree-item")
    select(app, config)
    AppController.prototype.renameSelectedExplorerItem.call(app, renameKeyEvent(config))
    select(app, note)
    app.selectExplorerItem(config, clickEvent(config, { ctrlKey: true }))
    AppController.prototype.renameSelectedExplorerItem.call(app, renameKeyEvent(config))

    expect(fileOperations.renameExplorerItem).not.toHaveBeenCalled()
  })

  it("does not intercept other keys or modified shortcut presses", () => {
    const { app, fileTree, fileOperations } = createAppFixture(
      '<div class="tree-item explorer-selected" data-path="note.md" data-type="file"></div>'
    )
    const item = fileTree.firstElementChild

    AppController.prototype.deleteSelectedExplorerItem.call(app, deleteKeyEvent(item, { key: "Backspace" }))
    AppController.prototype.deleteSelectedExplorerItem.call(app, deleteKeyEvent(item, { ctrlKey: true }))
    AppController.prototype.deleteSelectedExplorerItem.call(app, deleteKeyEvent(item, { repeat: true }))
    AppController.prototype.renameSelectedExplorerItem.call(app, renameKeyEvent(item, { shiftKey: true }))
    AppController.prototype.renameSelectedExplorerItem.call(app, renameKeyEvent(item, { repeat: true }))

    expect(fileOperations.deleteItems).not.toHaveBeenCalled()
    expect(fileOperations.renameExplorerItem).not.toHaveBeenCalled()
  })
})
