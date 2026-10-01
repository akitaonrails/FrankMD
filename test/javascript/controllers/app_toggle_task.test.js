/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller.js"

function makeApp() {
  const app = Object.create(AppController.prototype)
  const codemirror = { toggleTask: vi.fn(), toggleTaskAtLine: vi.fn() }
  Object.assign(app, {
    currentFile: "note.md",
    currentFileType: "markdown",
    getCodemirrorController: vi.fn(() => codemirror)
  })
  return { app, codemirror }
}

describe("AppController preview task toggle (#203)", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  describe("onPreviewToggleTask()", () => {
    it("toggles the source line in the editor for a markdown note", () => {
      const { app, codemirror } = makeApp()

      app.onPreviewToggleTask({ detail: { line: 7 } })

      expect(codemirror.toggleTaskAtLine).toHaveBeenCalledWith(7)
    })

    it("is a no-op when no editor is available", () => {
      const { app, codemirror } = makeApp()
      app.getCodemirrorController = vi.fn(() => null)

      app.onPreviewToggleTask({ detail: { line: 7 } })

      expect(codemirror.toggleTaskAtLine).not.toHaveBeenCalled()
    })

    it("is a no-op for non-markdown files", () => {
      const { app, codemirror } = makeApp()
      app.currentFileType = "config"

      app.onPreviewToggleTask({ detail: { line: 7 } })

      expect(codemirror.toggleTaskAtLine).not.toHaveBeenCalled()
    })

    it("ignores events without a valid line", () => {
      const { app, codemirror } = makeApp()

      app.onPreviewToggleTask({ detail: {} })
      app.onPreviewToggleTask({ detail: { line: "3" } })

      expect(codemirror.toggleTaskAtLine).not.toHaveBeenCalled()
    })
  })

  describe("toggleTask() shortcut action", () => {
    it("runs the editor shortcut for a markdown note", () => {
      const { app, codemirror } = makeApp()

      app.toggleTask()

      expect(codemirror.toggleTask).toHaveBeenCalled()
    })

    it("is a no-op without an editor or outside markdown", () => {
      const withoutEditor = makeApp()
      withoutEditor.app.getCodemirrorController = vi.fn(() => null)
      withoutEditor.app.toggleTask()
      expect(withoutEditor.codemirror.toggleTask).not.toHaveBeenCalled()

      const nonMarkdown = makeApp()
      nonMarkdown.app.currentFileType = null
      nonMarkdown.app.toggleTask()
      expect(nonMarkdown.codemirror.toggleTask).not.toHaveBeenCalled()
    })
  })
})
