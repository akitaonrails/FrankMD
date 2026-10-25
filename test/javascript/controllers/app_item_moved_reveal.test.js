/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller"

// Regression coverage for issue #254: a note moved into a collapsed folder used
// to stay hidden, because onItemMoved only recorded the expansion in JS state
// after the tree had already been rendered by the rename response.
const TREE_MARKUP = `
  <div class="tree-folder" data-path="target">
    <div class="tree-item" data-path="target" data-type="folder">
      <svg class="tree-chevron"></svg>
      <span>target</span>
    </div>
    <div class="tree-children hidden">
      <div class="tree-item" data-path="target/moved.md" data-type="file">moved</div>
    </div>
  </div>
  <div class="tree-folder" data-path="outer">
    <div class="tree-item" data-path="outer" data-type="folder">
      <svg class="tree-chevron"></svg>
    </div>
    <div class="tree-children hidden">
      <div class="tree-folder" data-path="outer/inner">
        <div class="tree-item" data-path="outer/inner" data-type="folder">
          <svg class="tree-chevron"></svg>
        </div>
        <div class="tree-children hidden">
          <div class="tree-item" data-path="outer/inner/moved.md" data-type="file">moved</div>
        </div>
      </div>
    </div>
  </div>
`

function createApp() {
  const fileTree = document.createElement("div")
  fileTree.innerHTML = TREE_MARKUP

  const app = Object.create(AppController.prototype)
  Object.assign(app, {
    fileTreeTarget: fileTree,
    hasFileTreeTarget: true,
    expandedFolders: new Set(),
    invalidateTreeRefreshes: vi.fn(),
    remapSessionNotePaths: vi.fn(),
    remapExplorerSelection: vi.fn(),
    updatePathDisplay: vi.fn(),
    updateUrl: vi.fn(),
    getAutosaveController: () => null,
    currentFile: null
  })
  return { app, fileTree }
}

function folderElement(fileTree, path) {
  return Array.from(fileTree.querySelectorAll(".tree-folder"))
    .find((element) => element.dataset.path === path)
}

describe("onItemMoved folder reveal (#254)", () => {
  it("reveals a collapsed destination folder and records the expansion", () => {
    const { app, fileTree } = createApp()
    const folder = folderElement(fileTree, "target")
    expect(folder.querySelector(".tree-children").classList.contains("hidden")).toBe(true)

    app.onItemMoved({ detail: { oldPath: "moved.md", newPath: "target/moved.md", type: "file" } })

    expect(folder.querySelector(".tree-children").classList.contains("hidden")).toBe(false)
    expect(folder.querySelector(".tree-chevron").classList.contains("expanded")).toBe(true)
    expect(app.expandedFolders.has("target")).toBe(true)
  })

  it("reveals every ancestor of a nested destination", () => {
    const { app, fileTree } = createApp()

    app.onItemMoved({
      detail: { oldPath: "moved.md", newPath: "outer/inner/moved.md", type: "file" }
    })

    for (const path of ["outer", "outer/inner"]) {
      const folder = folderElement(fileTree, path)
      expect(folder.querySelector(".tree-children").classList.contains("hidden")).toBe(false)
      expect(folder.querySelector(".tree-chevron").classList.contains("expanded")).toBe(true)
    }
  })

  it("keeps the current file reference in sync without touching the tree shape", () => {
    const { app, fileTree } = createApp()
    app.currentFile = "moved.md"

    app.onItemMoved({ detail: { oldPath: "moved.md", newPath: "target/moved.md", type: "file" } })

    expect(app.currentFile).toBe("target/moved.md")
    expect(app.updateUrl).toHaveBeenCalledWith("target/moved.md")
    expect(fileTree.querySelector("[data-path='target/moved.md']")).not.toBeNull()
  })
})
