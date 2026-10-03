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

afterEach(() => {
  document.body.classList.remove("typewriter-mode")
})

describe("AppController Typewriter mode", () => {
  it.each([true, false])("preserves sidebar visibility (%s)", (sidebarVisible) => {
    const { app } = makeApp(sidebarVisible)

    app.onTypewriterToggled({ detail: { enabled: true } })
    expect(app.sidebarVisible).toBe(sidebarVisible)
    expect(app.applySidebarVisibility).not.toHaveBeenCalled()

    app.onTypewriterToggled({ detail: { enabled: false } })
    expect(app.sidebarVisible).toBe(sidebarVisible)
    expect(app.applySidebarVisibility).not.toHaveBeenCalled()
  })

  it("refreshes CodeMirror after showing the editor workspace", () => {
    const root = document.createElement("div")
    root.innerHTML = `
      <main data-app-target="editorPanel" class="hidden"></main>
      <aside data-app-target="previewPanel" class="hidden"></aside>
      <section data-app-target="settingsPanel"></section>
      <button data-app-target="settingsToggle"></button>
    `
    document.body.append(root)

    const codemirrorController = { refreshTypewriterLayout: vi.fn() }
    const app = Object.create(AppController.prototype)
    Object.assign(app, {
      context: { element: root },
      libraryVisible: false,
      settingsVisible: true,
      viewMode: "split",
      codemirrorOutlets: [codemirrorController],
      previewOutlets: []
    })

    app.showEditorWorkspace()

    expect(root.querySelector('[data-app-target="editorPanel"]').classList.contains("hidden")).toBe(false)
    expect(codemirrorController.refreshTypewriterLayout).toHaveBeenCalledOnce()
  })
})
