/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller"

const TREE_MARKUP = `
  <div class="tree-item" data-path="a.md" data-type="file" tabindex="0">a</div>
  <div class="tree-folder" data-path="docs">
    <div class="tree-item" data-path="docs" data-type="folder" tabindex="0">docs</div>
    <div class="tree-children hidden">
      <div class="tree-item" data-path="docs/b.md" data-type="file" tabindex="0">b</div>
    </div>
  </div>
  <div class="tree-item" data-path="c.md" data-type="file" tabindex="0">c</div>
`

function createApp() {
  const fileTree = document.createElement("div")
  fileTree.id = "file-tree-content"
  fileTree.innerHTML = TREE_MARKUP

  const menu = document.createElement("div")
  menu.className = "hidden"
  menu.innerHTML = '<button type="button">New Note</button>'

  const app = Object.create(AppController.prototype)
  Object.assign(app, {
    fileTreeTarget: fileTree,
    hasFileTreeTarget: true,
    explorerMenuTarget: menu,
    hasExplorerMenuTarget: true,
    explorerSelection: new Map(),
    explorerSelectionAnchor: null,
    explorerActiveKey: null,
    expandedFolders: new Set()
  })
  return { app, fileTree, menu }
}

function select(app, path, type = "file") {
  const item = Array.from(app.fileTreeTarget.querySelectorAll(".tree-item"))
    .find((element) => element.dataset.path === path && element.dataset.type === type)
  app.selectExplorerItem(item)
}

describe("explorer background interaction (#261, #267)", () => {
  it("clears the selection when right-clicking the explorer's empty surface", () => {
    const { app } = createApp()
    select(app, "a.md")
    select(app, "docs", "folder")
    expect(app.explorerSelection.size).toBe(1)

    app.onExplorerBackgroundContextMenu({ target: app.fileTreeTarget, clientX: 10, clientY: 10, preventDefault: vi.fn() })

    expect(app.explorerSelection.size).toBe(0)
    expect(app.explorerSelectionAnchor).toBeNull()
    expect(app.fileTreeTarget.querySelector(".explorer-selected")).toBeNull()
  })

  it("shows the positioned menu on the background context menu event", () => {
    const { app, menu } = createApp()
    expect(menu.classList.contains("hidden")).toBe(true)

    app.onExplorerBackgroundContextMenu({ target: app.fileTreeTarget, clientX: 40, clientY: 60, preventDefault: vi.fn() })

    expect(menu.classList.contains("hidden")).toBe(false)
    expect(menu.style.left).toBe("40px")
    expect(menu.style.top).toBe("60px")
  })

  it("closes the menu when left-clicking empty explorer space without clearing selection", () => {
    const { app, menu } = createApp()
    select(app, "a.md")
    menu.classList.remove("hidden")
    const selection = app.explorerSelection

    app.onExplorerBackgroundClick({ target: app.fileTreeTarget })

    expect(menu.classList.contains("hidden")).toBe(true)
    expect(app.explorerSelection).toBe(selection)
  })

  it("ignores context menu events that land on tree items", () => {
    const { app, menu } = createApp()
    const item = app.fileTreeTarget.querySelector('[data-path="a.md"]')
    select(app, "c.md")
    const selectionSnapshot = app.explorerSelection

    app.onExplorerBackgroundContextMenu({ target: item, clientX: 0, clientY: 0, preventDefault: vi.fn() })

    expect(app.explorerSelection).toBe(selectionSnapshot)
    expect(menu.classList.contains("hidden")).toBe(true)
  })

  it("hides the menu when an explorer item is selected", () => {
    const { app, menu } = createApp()
    app.onExplorerBackgroundContextMenu({ target: app.fileTreeTarget, clientX: 10, clientY: 10, preventDefault: vi.fn() })
    expect(menu.classList.contains("hidden")).toBe(false)

    select(app, "a.md")

    expect(menu.classList.contains("hidden")).toBe(true)
  })

  it("select all picks every visible item and skips collapsed children", () => {
    const { app, menu } = createApp()
    app.onExplorerBackgroundContextMenu({ target: app.fileTreeTarget, clientX: 10, clientY: 10, preventDefault: vi.fn() })

    app.selectAllExplorerItems()

    const paths = Array.from(app.explorerSelection.values()).map((item) => item.path).sort()
    expect(paths).toEqual(["a.md", "c.md", "docs"])
    expect(menu.classList.contains("hidden")).toBe(true)
    expect(app.fileTreeTarget.querySelectorAll(".explorer-selected").length).toBe(3)
  })

  it("Escape closes the open explorer menu", () => {
    const { app, menu } = createApp()
    app.mobileWorkspace = false
    app.sidebarVisible = true
    app.hasOverflowMenuTarget = false
    app.onExplorerBackgroundContextMenu({ target: app.fileTreeTarget, clientX: 10, clientY: 10, preventDefault: vi.fn() })

    const handled = app.onWorkspaceKeydown({ key: "Escape", preventDefault: () => {}, stopImmediatePropagation: () => {} })

    expect(handled).toBe(true)
    expect(menu.classList.contains("hidden")).toBe(true)
  })
})
