/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller.js"

function makeViewModeApp() {
  window.t = (key) => key
  const element = document.createElement("div")
  element.innerHTML = `
    <main data-app-target="editorPanel">
      <div data-controller="codemirror" data-app-target="editor"></div>
    </main>
    <aside data-app-target="previewPanel" class="hidden"></aside>
    <section data-app-target="libraryPanel" class="hidden"></section>
    <dialog data-app-target="settingsDialog"></dialog>
    <button data-app-target="settingsToggle" aria-pressed="false"></button>
  `
  document.body.replaceChildren(element)

  const previewPanel = element.querySelector('[data-app-target="previewPanel"]')
  // Faithful mock: visibility lives on the panel element, like the real
  // preview controller's hidden/flex class toggling.
  const previewController = {
    get isVisible() {
      return !previewPanel.classList.contains("hidden")
    },
    toggle: vi.fn(function () {
      if (previewPanel.classList.contains("hidden")) this.show()
      else this.hide()
      return this.isVisible
    }),
    show: vi.fn(function () {
      previewPanel.classList.remove("hidden")
      previewPanel.classList.add("flex")
    }),
    hide: vi.fn(function () {
      previewPanel.classList.add("hidden")
      previewPanel.classList.remove("flex")
    })
  }
  const codemirrorController = { focus: vi.fn() }
  const app = Object.create(AppController.prototype)
  const settingsController = {
    viewMode: "split",
    isDialogOpen: false,
    toggleDialog() {
      this.isDialogOpen = !this.isDialogOpen
      return this.isDialogOpen
    }
  }
  Object.assign(app, {
    context: { element },
    libraryVisible: false,
    viewMode: "split",
    currentFileType: "markdown",
    previewOutlets: [previewController],
    codemirrorOutlets: [codemirrorController],
    settingsOutlets: [settingsController],
    showTemporaryMessage: vi.fn()
  })
  return { app, element, previewController, codemirrorController, settingsController }
}

afterEach(() => {
  document.body.replaceChildren()
  document.body.classList.remove("single-view-mode")
  delete window.t
})

describe("AppController document view mode", () => {
  it("boot: initializeViewMode applies the persisted mode from the settings controller", () => {
    const { app } = makeViewModeApp()
    app.settingsOutlets[0].viewMode = "single"

    app.initializeViewMode()

    expect(app.viewMode).toBe("single")
    expect(document.body.classList.contains("single-view-mode")).toBe(true)
  })

  it("boot: defaults to split when no settings controller is connected", () => {
    const { app } = makeViewModeApp()
    app.settingsOutlets = []

    app.initializeViewMode()

    expect(app.viewMode).toBe("split")
    expect(document.body.classList.contains("single-view-mode")).toBe(false)
  })

  it("setViewMode normalizes unknown values to split", () => {
    const { app } = makeViewModeApp()

    app.setViewMode("diagonal")

    expect(app.viewMode).toBe("split")
  })

  it("switching to single hides the preview and defaults to the editor pane", () => {
    const { app, element, previewController } = makeViewModeApp()
    const editorPanel = element.querySelector('[data-app-target="editorPanel"]')
    previewController.show()

    app.setViewMode("single")

    expect(previewController.hide).toHaveBeenCalled()
    expect(editorPanel.classList.contains("hidden")).toBe(false)
    expect(document.body.classList.contains("single-view-mode")).toBe(true)
  })

  it("switching back to split shows the editor pane beside the current preview state", () => {
    const { app, element, previewController } = makeViewModeApp()
    const editorPanel = element.querySelector('[data-app-target="editorPanel"]')
    app.setViewMode("single")
    app.switchSinglePane() // now on the full-width preview pane
    expect(editorPanel.classList.contains("hidden")).toBe(true)

    app.setViewMode("split")

    expect(editorPanel.classList.contains("hidden")).toBe(false)
    expect(previewController.isVisible).toBe(true)
    expect(document.body.classList.contains("single-view-mode")).toBe(false)
  })

  it("split mode: the preview toggle keeps its hide/show semantics", () => {
    const { app, previewController } = makeViewModeApp()

    app.togglePreview()

    expect(previewController.toggle).toHaveBeenCalled()
  })

  it("single mode: the preview toggle switches to the full-width preview pane", () => {
    const { app, element, previewController } = makeViewModeApp()
    const editorPanel = element.querySelector('[data-app-target="editorPanel"]')
    app.setViewMode("single")

    const nowVisible = app.togglePreview()

    expect(nowVisible).toBe(true)
    expect(previewController.show).toHaveBeenCalled()
    expect(previewController.isVisible).toBe(true)
    // Exactly one pane: the editor pane is hidden...
    expect(editorPanel.classList.contains("hidden")).toBe(true)
    // ...but NOT disconnected, so autosave/undo/slash state survives
    expect(editorPanel.isConnected).toBe(true)
    expect(element.querySelector('[data-app-target="editorPanel"] [data-controller~="codemirror"]')).not.toBeNull()
  })

  it("single mode: toggling again returns to the editor pane and focuses it", () => {
    const { app, element, previewController, codemirrorController } = makeViewModeApp()
    const editorPanel = element.querySelector('[data-app-target="editorPanel"]')
    app.setViewMode("single")
    app.togglePreview() // preview pane

    const nowVisible = app.togglePreview()

    expect(nowVisible).toBe(false)
    expect(previewController.hide).toHaveBeenCalled()
    expect(previewController.isVisible).toBe(false)
    expect(editorPanel.classList.contains("hidden")).toBe(false)
    expect(codemirrorController.focus).toHaveBeenCalled()
  })

  it("single mode: opening Settings preserves the active preview pane", () => {
    const { app, element, previewController, settingsController } = makeViewModeApp()
    const editorPanel = element.querySelector('[data-app-target="editorPanel"]')
    const previewPanel = element.querySelector('[data-app-target="previewPanel"]')
    app.setViewMode("single")

    app.switchSinglePane()
    previewController.hide.mockClear()

    app.toggleSettings()

    expect(settingsController.isDialogOpen).toBe(true)
    expect(previewController.isVisible).toBe(true)
    expect(editorPanel.classList.contains("hidden")).toBe(true)

    app.toggleSettings()

    expect(previewController.hide).not.toHaveBeenCalled()
    expect(previewPanel.classList.contains("hidden")).toBe(false)
    expect(editorPanel.classList.contains("hidden")).toBe(true)
  })

  it("applies view mode changes while Settings is open", () => {
    const { app, element, previewController, settingsController } = makeViewModeApp()
    const editorPanel = element.querySelector('[data-app-target="editorPanel"]')
    previewController.show()
    app.toggleSettings()
    expect(settingsController.isDialogOpen).toBe(true)
    previewController.hide.mockClear()

    app.setViewMode("single")

    expect(previewController.hide).toHaveBeenCalledOnce()
    expect(app.viewMode).toBe("single")
    expect(document.body.classList.contains("single-view-mode")).toBe(true)
    expect(editorPanel.classList.contains("hidden")).toBe(false)
  })

  it("single mode: the markdown-file guard still blocks non-markdown files", () => {
    const { app, previewController } = makeViewModeApp()
    app.setViewMode("single")
    app.currentFileType = "config"

    app.togglePreview()

    expect(previewController.show).not.toHaveBeenCalled()
    expect(app.showTemporaryMessage).toHaveBeenCalled()
  })
})
