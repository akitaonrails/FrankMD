/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { redo, undo } from "@codemirror/commands"
import { Application } from "@hotwired/stimulus"
import CodemirrorController from "../../../app/javascript/controllers/codemirror_controller.js"

describe("CodemirrorController", () => {
  let application, controller, element

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-controller="codemirror"
           data-codemirror-content-value="Hello World"
           data-codemirror-placeholder-value="Start typing..."
           data-codemirror-font-family-value="'Cascadia Code', monospace"
           data-codemirror-font-size-value="14"
           data-codemirror-line-height-value="1.6"
           data-codemirror-line-number-mode-value="0"
           data-codemirror-typewriter-mode-value="false"
           data-codemirror-read-only-value="false">
        <div data-codemirror-target="container" class="h-full"></div>
        <textarea data-codemirror-target="hidden" class="hidden"></textarea>
      </div>
    `

    element = document.querySelector('[data-controller="codemirror"]')
    application = Application.start()
    application.register("codemirror", CodemirrorController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "codemirror")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("creates an editor instance", () => {
      expect(controller.editor).toBeDefined()
      expect(controller.editor).not.toBeNull()
    })

    it("initializes with content from value", () => {
      expect(controller.getValue()).toBe("Hello World")
    })

    it("syncs initial content to hidden textarea", () => {
      expect(controller.hiddenTarget.value).toBe("Hello World")
    })
  })

  describe("disconnect()", () => {
    it("destroys the editor", () => {
      const editor = controller.editor
      const destroySpy = vi.spyOn(editor, "destroy")

      controller.disconnect()

      expect(destroySpy).toHaveBeenCalled()
      expect(controller.editor).toBeNull()
    })
  })

  describe("getValue()", () => {
    it("returns the full document text", () => {
      expect(controller.getValue()).toBe("Hello World")
    })

    it("returns empty string if no editor", () => {
      controller.disconnect()
      expect(controller.getValue()).toBe("")
    })
  })

  describe("setValue()", () => {
    it("replaces the document content", () => {
      controller.setValue("New Content")
      expect(controller.getValue()).toBe("New Content")
    })

    it("syncs to hidden textarea", () => {
      controller.setValue("Updated")
      expect(controller.hiddenTarget.value).toBe("Updated")
    })
  })

  describe("loadContent()", () => {
    it("loads content without recording it as a user change", () => {
      const changeHandler = vi.fn()
      element.addEventListener("codemirror:change", changeHandler)
      controller.setValue("Edited previous note")
      changeHandler.mockClear()

      controller.loadContent("New note content", "new.md")

      expect(controller.getValue()).toBe("New note content")
      expect(undo(controller.getEditorView())).toBe(false)
      expect(controller.getValue()).toBe("New note content")
      expect(changeHandler).not.toHaveBeenCalled()
    })

    it("preserves independent undo and redo history for each note", () => {
      const changeHandler = vi.fn()
      element.addEventListener("codemirror:change", changeHandler)
      controller.loadContent("file 1 baseline", "file1.md")
      controller.setValue("file 1 edit")

      controller.loadContent("file 2 baseline", "file2.md")
      expect(undo(controller.getEditorView())).toBe(false)
      controller.setValue("file 2 edit")

      changeHandler.mockClear()
      controller.loadContent("file 1 edit", "file1.md")
      expect(changeHandler).not.toHaveBeenCalled()
      expect(controller.getValue()).toBe("file 1 edit")
      expect(undo(controller.getEditorView())).toBe(true)
      expect(controller.getValue()).toBe("file 1 baseline")
      expect(redo(controller.getEditorView())).toBe(true)
      expect(controller.getValue()).toBe("file 1 edit")

      controller.loadContent("file 2 edit", "file2.md")
      expect(controller.getValue()).toBe("file 2 edit")
      expect(undo(controller.getEditorView())).toBe(true)
      expect(controller.getValue()).toBe("file 2 baseline")
      expect(redo(controller.getEditorView())).toBe(true)
      expect(controller.getValue()).toBe("file 2 edit")
    })

    it("remaps active and cached history paths when a folder is moved", () => {
      controller.loadContent("first baseline", "old/first.md")
      controller.setValue("first edit")
      controller.loadContent("second baseline", "old/nested/second.md")
      controller.setValue("second edit")

      controller.remapHistoryPaths("old", "new", "folder")

      expect(controller._activeHistoryPath).toBe("new/nested/second.md")
      expect(controller._noteEditorStates.has("old/first.md")).toBe(false)
      expect(controller._noteEditorStates.has("new/first.md")).toBe(true)

      controller.loadContent("first edit", "new/first.md")
      expect(undo(controller.getEditorView())).toBe(true)
      expect(controller.getValue()).toBe("first baseline")

      controller.loadContent("second edit", "new/nested/second.md")
      expect(undo(controller.getEditorView())).toBe(true)
      expect(controller.getValue()).toBe("second baseline")
    })

    it("remaps a file history and discards stale destination history", () => {
      controller.loadContent("source baseline", "source.md")
      controller.setValue("source edit")
      controller.loadContent("destination baseline", "destination.md")
      controller.setValue("destination edit")
      controller.loadContent("other baseline", "other.md")

      controller.remapHistoryPaths("source.md", "destination.md", "file")

      expect(controller._noteEditorStates.has("source.md")).toBe(false)
      expect(controller._noteEditorStates.has("destination.md")).toBe(true)
      controller.loadContent("source edit", "destination.md")
      expect(undo(controller.getEditorView())).toBe(true)
      expect(controller.getValue()).toBe("source baseline")
    })

    it("evicts deleted file and folder subtree history before a path can be reused", () => {
      controller.loadContent("file baseline", "deleted.md")
      controller.setValue("file edit")
      controller.loadContent("folder baseline", "deleted-folder/nested.md")
      controller.setValue("folder edit")
      controller.loadContent("other baseline", "other.md")

      controller.evictHistoryPaths("deleted.md", "file")
      controller.evictHistoryPaths("deleted-folder", "folder")

      expect(controller._noteEditorStates.has("deleted.md")).toBe(false)
      expect(controller._noteEditorStates.has("deleted-folder/nested.md")).toBe(false)

      controller.loadContent("new file at reused path", "deleted.md")
      expect(undo(controller.getEditorView())).toBe(false)
      controller.loadContent("new note in reused folder", "deleted-folder/nested.md")
      expect(undo(controller.getEditorView())).toBe(false)
    })

    it("discards a note's cached history when its loaded content no longer matches", () => {
      controller.loadContent("file 1 baseline", "file1.md")
      controller.setValue("file 1 edit")

      controller.loadContent("file 2 baseline", "file2.md")
      controller.loadContent("external file 1 update", "file1.md")

      expect(controller.getValue()).toBe("external file 1 update")
      expect(undo(controller.getEditorView())).toBe(false)
    })
  })

  describe("undo at the history boundary", () => {
    function pressUndo(view) {
      const event = new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
      view.contentDOM.dispatchEvent(event)
      return event
    }

    it("uses normal text undo before asking the app to handle an exhausted history", () => {
      controller.loadContent("created note baseline", "created.md")
      controller.setUndoAtHistoryStartHandler(vi.fn(() => true))
      controller.setValue("edited created note")
      const handler = controller.undoAtHistoryStartHandler
      const view = controller.getEditorView()

      pressUndo(view)
      expect(controller.getValue()).toBe("created note baseline")
      expect(handler).not.toHaveBeenCalled()

      const event = pressUndo(view)
      expect(handler).toHaveBeenCalledOnce()
      expect(event.defaultPrevented).toBe(true)
    })

    it("leaves exhausted Ctrl+Z to Vim mode", () => {
      controller.loadContent("created note baseline", "created.md")
      const handler = vi.fn(() => true)
      controller.setUndoAtHistoryStartHandler(handler)
      controller.vimModeValue = true

      pressUndo(controller.getEditorView())

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe("redo at the history boundary", () => {
    function pressRedo(view, { key = "y", shiftKey = false } = {}) {
      const event = new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        shiftKey,
        bubbles: true,
        cancelable: true
      })
      view.contentDOM.dispatchEvent(event)
      return event
    }

    it("uses the active note's redo history before asking the app to handle an exhausted history", () => {
      controller.loadContent("note baseline", "note.md")
      const handler = vi.fn(() => true)
      controller.setRedoAtHistoryEndHandler(handler)
      controller.setValue("note edit")
      expect(undo(controller.getEditorView())).toBe(true)
      const view = controller.getEditorView()

      pressRedo(view)
      expect(controller.getValue()).toBe("note edit")
      expect(handler).not.toHaveBeenCalled()

      const event = pressRedo(view)
      expect(handler).toHaveBeenCalledOnce()
      expect(event.defaultPrevented).toBe(true)
    })

    it("routes exhausted Ctrl+Shift+Z to the creation boundary", () => {
      controller.loadContent("note baseline", "note.md")
      const handler = vi.fn(() => true)
      controller.setRedoAtHistoryEndHandler(handler)

      const event = pressRedo(controller.getEditorView(), { key: "z", shiftKey: true })

      expect(handler).toHaveBeenCalledOnce()
      expect(event.defaultPrevented).toBe(true)
    })

    it("leaves exhausted redo to Vim mode", () => {
      controller.loadContent("note baseline", "note.md")
      const handler = vi.fn(() => true)
      controller.setRedoAtHistoryEndHandler(handler)
      controller.vimModeValue = true

      pressRedo(controller.getEditorView())

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe("getSelection()", () => {
    it("returns selection info with from, to, and text", () => {
      const selection = controller.getSelection()
      expect(selection).toHaveProperty("from")
      expect(selection).toHaveProperty("to")
      expect(selection).toHaveProperty("text")
    })

    it("returns selected text", () => {
      controller.setValue("Hello World")
      controller.setSelection(0, 5)
      const selection = controller.getSelection()
      expect(selection.from).toBe(0)
      expect(selection.to).toBe(5)
      expect(selection.text).toBe("Hello")
    })
  })

  describe("setSelection()", () => {
    it("sets selection range", () => {
      controller.setValue("Hello World")
      controller.setSelection(6, 11)
      const selection = controller.getSelection()
      expect(selection.from).toBe(6)
      expect(selection.to).toBe(11)
    })
  })

  describe("replaceSelection()", () => {
    it("replaces selected text", () => {
      controller.setValue("Hello World")
      controller.setSelection(6, 11)
      controller.replaceSelection("Universe")
      expect(controller.getValue()).toBe("Hello Universe")
    })
  })

  describe("insertAt()", () => {
    it("inserts text at position", () => {
      controller.setValue("Hello World")
      controller.insertAt(5, " Beautiful")
      expect(controller.getValue()).toBe("Hello Beautiful World")
    })
  })

  describe("replaceRange()", () => {
    it("replaces text in range", () => {
      controller.setValue("Hello World")
      controller.replaceRange("Goodbye", 0, 5)
      expect(controller.getValue()).toBe("Goodbye World")
    })
  })

  describe("focus()", () => {
    it("focuses the editor", () => {
      const focusSpy = vi.spyOn(controller.editor, "focus")
      controller.focus()
      expect(focusSpy).toHaveBeenCalled()
    })
  })

  describe("hasFocus()", () => {
    it("returns focus state", () => {
      expect(typeof controller.hasFocus()).toBe("boolean")
    })
  })

  describe("getScrollInfo()", () => {
    it("returns scroll info object", () => {
      const info = controller.getScrollInfo()
      expect(info).toHaveProperty("top")
      expect(info).toHaveProperty("left")
      expect(info).toHaveProperty("height")
      expect(info).toHaveProperty("clientHeight")
    })
  })

  describe("scrollTo()", () => {
    it("sets scroll position", () => {
      // Set some content to make it scrollable
      controller.setValue("Line 1\n".repeat(100))
      controller.scrollTo(50)
      const info = controller.getScrollInfo()
      // May not be exactly 50 due to scroll limits
      expect(info.top).toBeGreaterThanOrEqual(0)
    })
  })

  describe("getScrollRatio()", () => {
    it("returns a number between 0 and 1", () => {
      const ratio = controller.getScrollRatio()
      expect(ratio).toBeGreaterThanOrEqual(0)
      expect(ratio).toBeLessThanOrEqual(1)
    })
  })

  describe("getTopVisibleLine()", () => {
    it("returns a valid 1-based line number", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      const line = controller.getTopVisibleLine()
      expect(line).toBeGreaterThanOrEqual(1)
      expect(line).toBeLessThanOrEqual(3)
    })

    it("uses lineBlockAtHeight at the top of the viewport", () => {
      const realEditor = controller.editor
      controller.editor = {
        scrollDOM: { scrollTop: 120 },
        lineBlockAtHeight: vi.fn(() => ({ from: 20 })),
        state: {
          doc: {
            lineAt: vi.fn((pos) => ({ number: pos === 20 ? 5 : 1 }))
          }
        }
      }

      expect(controller.getTopVisibleLine()).toBe(5)
      expect(controller.editor.lineBlockAtHeight).toHaveBeenCalledWith(121)
      controller.editor = realEditor
    })

    it("returns 1 when the editor is missing", () => {
      controller.editor = null
      expect(controller.getTopVisibleLine()).toBe(1)
    })
  })

  describe("scrollToLine()", () => {
    it("scrolls so the line block's top is at the viewport top", () => {
      const realEditor = controller.editor
      controller.editor = {
        scrollDOM: { scrollTop: 0 },
        lineBlock: vi.fn(() => ({ top: 240 })),
        state: {
          doc: {
            lines: 10,
            line: vi.fn((n) => ({ number: n }))
          }
        }
      }

      controller.scrollToLine(6)

      expect(controller.editor.state.doc.line).toHaveBeenCalledWith(6)
      expect(controller.editor.scrollDOM.scrollTop).toBe(240)
      controller.editor = realEditor
    })

    it("clamps the requested line into the document", () => {
      const realEditor = controller.editor
      controller.editor = {
        scrollDOM: { scrollTop: 0 },
        lineBlock: vi.fn(() => ({ top: 0 })),
        state: {
          doc: {
            lines: 10,
            line: vi.fn((n) => ({ number: n }))
          }
        }
      }

      controller.scrollToLine(99)
      expect(controller.editor.state.doc.line).toHaveBeenCalledWith(10)

      controller.scrollToLine(0)
      expect(controller.editor.state.doc.line).toHaveBeenCalledWith(1)
      controller.editor = realEditor
    })

    it("does nothing when the editor is missing", () => {
      controller.editor = null
      expect(() => controller.scrollToLine(3)).not.toThrow()
    })
  })

  describe("getCursorPosition()", () => {
    it("returns cursor position with line, column, offset", () => {
      const pos = controller.getCursorPosition()
      expect(pos).toHaveProperty("line")
      expect(pos).toHaveProperty("column")
      expect(pos).toHaveProperty("offset")
    })

    it("returns correct position", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      controller.setCursorPosition(2, 3)
      const pos = controller.getCursorPosition()
      expect(pos.line).toBe(2)
      expect(pos.column).toBe(3)
    })
  })

  describe("setCursorPosition()", () => {
    it("sets cursor to line and column", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      controller.setCursorPosition(2, 5)
      const pos = controller.getCursorPosition()
      expect(pos.line).toBe(2)
      expect(pos.column).toBe(5)
    })

    it("clamps to valid range", () => {
      controller.setValue("Line 1\nLine 2")
      controller.setCursorPosition(999, 999)
      const pos = controller.getCursorPosition()
      expect(pos.line).toBe(2) // Clamped to last line
    })
  })

  describe("getLineCount()", () => {
    it("returns total number of lines", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      expect(controller.getLineCount()).toBe(3)
    })
  })

  describe("getLine()", () => {
    it("returns content of specific line", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      expect(controller.getLine(2)).toBe("Line 2")
    })

    it("returns empty string for invalid line", () => {
      controller.setValue("Line 1")
      expect(controller.getLine(999)).toBe("")
      expect(controller.getLine(0)).toBe("")
    })
  })

  describe("getCursorInfo()", () => {
    it("returns currentLine and totalLines", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      const info = controller.getCursorInfo()
      expect(info).toHaveProperty("currentLine")
      expect(info).toHaveProperty("totalLines")
      expect(info.totalLines).toBe(3)
    })
  })

  describe("setFontFamily()", () => {
    it("updates font family value", () => {
      controller.setFontFamily("'Monaco', monospace")
      expect(controller.fontFamilyValue).toBe("'Monaco', monospace")
    })
  })

  describe("setFontSize()", () => {
    it("updates font size value", () => {
      controller.setFontSize(16)
      expect(controller.fontSizeValue).toBe(16)
    })
  })

  describe("setLineHeight()", () => {
    it("updates line height value", () => {
      controller.setLineHeight(1.8)
      expect(controller.lineHeightValue).toBe(1.8)
    })
  })

  describe("LINE_NUMBER_MODES", () => {
    it("cycles through line number modes", () => {
      // Start at OFF (0)
      expect(controller.lineNumberModeValue).toBe(0)

      // Toggle to ABSOLUTE (1)
      let mode = controller.toggleLineNumberMode()
      expect(mode).toBe(1)

      // Toggle to RELATIVE (2)
      mode = controller.toggleLineNumberMode()
      expect(mode).toBe(2)

      // Toggle back to OFF (0)
      mode = controller.toggleLineNumberMode()
      expect(mode).toBe(0)
    })
  })

  describe("setTypewriterMode()", () => {
    it("updates typewriter mode value", () => {
      controller.setTypewriterMode(true)
      expect(controller.typewriterModeValue).toBe(true)

      controller.setTypewriterMode(false)
      expect(controller.typewriterModeValue).toBe(false)
    })
  })

  describe("toggleTypewriterMode()", () => {
    it("toggles typewriter mode and returns new state", () => {
      expect(controller.typewriterModeValue).toBe(false)

      let state = controller.toggleTypewriterMode()
      expect(state).toBe(true)
      expect(controller.typewriterModeValue).toBe(true)

      state = controller.toggleTypewriterMode()
      expect(state).toBe(false)
      expect(controller.typewriterModeValue).toBe(false)
    })
  })

  describe("isTypewriterMode()", () => {
    it("returns typewriter mode state", () => {
      expect(controller.isTypewriterMode()).toBe(false)
      controller.setTypewriterMode(true)
      expect(controller.isTypewriterMode()).toBe(true)
    })
  })

  describe("setReadOnly()", () => {
    it("updates read-only state", () => {
      controller.setReadOnly(true)
      expect(controller.readOnlyValue).toBe(true)
      expect(controller.getEditorView().contentDOM.getAttribute("contenteditable")).toBe("false")
    })

    it("keeps a temporary interaction lock until released, even if base read-only changes", () => {
      const releaseLock = controller.acquireReadOnlyLock()
      expect(controller.getEditorView().contentDOM.getAttribute("contenteditable")).toBe("false")

      controller.setReadOnly(false)
      expect(controller.getEditorView().contentDOM.getAttribute("contenteditable")).toBe("false")

      releaseLock()
      expect(controller.getEditorView().contentDOM.getAttribute("contenteditable")).toBe("true")
    })
  })

  describe("getEditorView()", () => {
    it("returns the EditorView instance", () => {
      const view = controller.getEditorView()
      expect(view).toBe(controller.editor)
    })
  })

  describe("getPositionForLine()", () => {
    it("returns character position for line", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      const pos = controller.getPositionForLine(2)
      expect(pos).toBe(7) // After "Line 1\n"
    })
  })

  describe("jumpToLine()", () => {
    it("moves cursor to specified line", () => {
      controller.setValue("Line 1\nLine 2\nLine 3")
      controller.jumpToLine(3)
      const pos = controller.getCursorPosition()
      expect(pos.line).toBe(3)
    })
  })

  describe("event dispatching", () => {
    it("dispatches change event on document change", async () => {
      const changeHandler = vi.fn()
      element.addEventListener("codemirror:change", changeHandler)

      controller.setValue("New content")

      // Wait for event to be dispatched
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(changeHandler).toHaveBeenCalled()
      expect(changeHandler.mock.calls[0][0].detail).toHaveProperty("content")
    })
  })

  describe("contentValueChanged()", () => {
    it("updates editor when content value changes externally", () => {
      controller.contentValue = "External Update"
      controller.contentValueChanged()
      expect(controller.getValue()).toBe("External Update")
    })

    it("does not update if content is the same", () => {
      const dispatchSpy = vi.spyOn(controller.editor, "dispatch")
      controller.contentValue = "Hello World" // Same as initial
      controller.contentValueChanged()
      // dispatch should not be called for same content
      expect(dispatchSpy).not.toHaveBeenCalled()
    })
  })
})
