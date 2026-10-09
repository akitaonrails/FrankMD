/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller.js"

describe("AppController editor focus", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("keeps focus on the selected Explorer item when loading its file", () => {
    const element = document.createElement("div")
    element.innerHTML = `
      <div data-app-target="editorPlaceholder"></div>
      <div data-app-target="editor" class="hidden">
        <div class="cm-content" contenteditable="true" tabindex="0"></div>
      </div>
      <div data-app-target="editorToolbar" class="hidden"></div>
      <textarea data-app-target="textarea"></textarea>
      <button data-app-target="tableHint" class="hidden"></button>
      <div data-explorer-item tabindex="0">note.md</div>
    `
    document.body.replaceChildren(element)

    const explorerItem = element.querySelector("[data-explorer-item]")
    const editorContent = element.querySelector(".cm-content")
    const codemirrorController = {
      setUndoAtHistoryStartHandler: vi.fn(),
      setRedoAtHistoryEndHandler: vi.fn(),
      loadContent: vi.fn(),
      focus: vi.fn(() => editorContent.focus())
    }
    const app = Object.create(AppController.prototype)
    Object.assign(app, {
      currentFile: "note.md",
      textareaTarget: element.querySelector("textarea"),
      editorPlaceholderTarget: element.querySelector('[data-app-target="editorPlaceholder"]'),
      editorTarget: element.querySelector('[data-app-target="editor"]'),
      editorToolbarTarget: element.querySelector('[data-app-target="editorToolbar"]'),
      tableHintTarget: element.querySelector('[data-app-target="tableHint"]'),
      getAutosaveController: () => null,
      getCodemirrorController: () => codemirrorController,
      updatePreview: vi.fn(),
      showStatsPanel: vi.fn(),
      updateStats: vi.fn(),
      applyEditorSettings: vi.fn(),
      initializeTypewriterMode: vi.fn()
    })

    explorerItem.focus()
    app.showEditor("note content")

    expect(codemirrorController.loadContent).toHaveBeenCalledWith("note content", "note.md")
    expect(codemirrorController.focus).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(explorerItem)
  })
})
