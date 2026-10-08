/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller.js"

function makeApp(sidebarVisible) {
  const app = Object.create(AppController.prototype)
  const previewController = {
    isVisible: false,
    setTypewriterMode: vi.fn(),
    hide: vi.fn()
  }
  Object.assign(app, {
    sidebarVisible,
    saveConfig: vi.fn(),
    updateTypewriterToggleButton: vi.fn(),
    getPreviewController: vi.fn(() => previewController),
    applySidebarVisibility: vi.fn()
  })
  return { app, previewController }
}

function makeTypewriterApp({ savedValue = true, fileType = null, viewMode = "split" } = {}) {
  const element = document.createElement("div")
  element.innerHTML = '<button data-app-target="typewriterToggle" aria-pressed="false"></button>'
  document.body.replaceChildren(element)

  const settingsController = {
    typewriterModeValue: savedValue,
    get typewriterModeEnabled() { return this.typewriterModeValue }
  }
  const typewriterController = {
    setEnabled: vi.fn()
  }
  const previewController = {
    visible: false,
    get isVisible() { return this.visible },
    show: vi.fn(function () { this.visible = true }),
    setTypewriterMode: vi.fn(),
    syncToTypewriter: vi.fn()
  }
  const scrollSyncController = { setTypewriterMode: vi.fn() }
  const codemirrorController = {
    getTypewriterSyncData: vi.fn(() => ({ currentLine: 6, totalLines: 20 }))
  }

  const app = Object.create(AppController.prototype)
  Object.assign(app, {
    context: { element },
    currentFileType: fileType,
    viewMode,
    libraryVisible: false,
    saveConfig: vi.fn(),
    settingsOutlets: [settingsController],
    typewriterOutlets: [typewriterController],
    previewOutlets: [previewController],
    scrollSyncOutlets: [scrollSyncController],
    codemirrorOutlets: [codemirrorController]
  })
  Object.defineProperty(app, "hasTypewriterToggleTarget", { value: true })
  Object.defineProperty(app, "typewriterToggleTarget", { value: element.querySelector("button") })

  return {
    app,
    element,
    settingsController,
    typewriterController,
    previewController,
    scrollSyncController,
    codemirrorController
  }
}

afterEach(() => {
  document.body.classList.remove("typewriter-mode")
})

describe("AppController Typewriter mode", () => {
  it("restores the saved mode after the Markdown file becomes active", () => {
    const { app, element, typewriterController, previewController, scrollSyncController } = makeTypewriterApp()

    // Startup can see Settings before the initial note has been applied.
    app.initializeTypewriterMode()
    expect(typewriterController.setEnabled).toHaveBeenLastCalledWith(false)
    expect(element.querySelector("button").getAttribute("aria-pressed")).toBe("true")

    app.currentFileType = "markdown"
    app.initializeTypewriterMode()

    expect(typewriterController.setEnabled).toHaveBeenLastCalledWith(true)
    expect(document.body.classList.contains("typewriter-mode")).toBe(true)
    expect(previewController.setTypewriterMode).toHaveBeenLastCalledWith(true)
    expect(scrollSyncController.setTypewriterMode).toHaveBeenLastCalledWith(true)
    expect(previewController.show).toHaveBeenCalledOnce()
    expect(previewController.syncToTypewriter).toHaveBeenCalledWith(6, 20)
  })

  it("keeps a saved preference inactive for non-Markdown files", () => {
    const { app, typewriterController, previewController } = makeTypewriterApp({ fileType: "config" })

    app.initializeTypewriterMode()

    expect(typewriterController.setEnabled).toHaveBeenCalledWith(false)
    expect(document.body.classList.contains("typewriter-mode")).toBe(false)
    expect(previewController.show).not.toHaveBeenCalled()
  })

  it("updates persisted settings and preview state when toggled", () => {
    const { app, settingsController, typewriterController, previewController } = makeTypewriterApp({
      fileType: "markdown"
    })

    app.onTypewriterToggled({ detail: { enabled: true } })

    expect(app.saveConfig).toHaveBeenCalledWith({ typewriter_mode: true })
    expect(settingsController.typewriterModeValue).toBe(true)
    expect(typewriterController.setEnabled).toHaveBeenCalledWith(true)
    expect(previewController.setTypewriterMode).toHaveBeenCalledWith(true)
  })

  it("applies Typewriter preview sync while Settings is open", () => {
    const { app, settingsController, previewController } = makeTypewriterApp({ fileType: "markdown" })
    settingsController.isDialogOpen = true

    app.applyTypewriterMode(true)

    expect(previewController.show).toHaveBeenCalledOnce()
    expect(previewController.syncToTypewriter).toHaveBeenCalledWith(6, 20)
  })

  it.each([true, false])("preserves sidebar visibility (%s)", (sidebarVisible) => {
    const { app } = makeApp(sidebarVisible)

    app.onTypewriterToggled({ detail: { enabled: true } })
    expect(app.sidebarVisible).toBe(sidebarVisible)
    expect(app.applySidebarVisibility).not.toHaveBeenCalled()

    app.onTypewriterToggled({ detail: { enabled: false } })
    expect(app.sidebarVisible).toBe(sidebarVisible)
    expect(app.applySidebarVisibility).not.toHaveBeenCalled()
  })

  it("refreshes CodeMirror after returning from Library", () => {
    const root = document.createElement("div")
    root.innerHTML = `
      <main data-app-target="editorPanel" class="hidden"></main>
      <aside data-app-target="previewPanel" class="hidden"></aside>
      <section data-app-target="libraryPanel"></section>
      <button data-app-target="libraryToggle"></button>
    `
    document.body.append(root)

    const codemirrorController = { refreshTypewriterLayout: vi.fn() }
    const app = Object.create(AppController.prototype)
    Object.assign(app, {
      context: { element: root },
      libraryVisible: true,
      viewMode: "split",
      codemirrorOutlets: [codemirrorController],
      previewOutlets: []
    })

    app.showEditorWorkspace()

    expect(root.querySelector('[data-app-target="editorPanel"]').classList.contains("hidden")).toBe(false)
    expect(codemirrorController.refreshTypewriterLayout).toHaveBeenCalledOnce()
  })
})
