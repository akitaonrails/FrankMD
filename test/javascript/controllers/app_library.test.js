/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller.js"

function makeWorkspaceApp() {
  const element = document.createElement("div")
  element.innerHTML = `
    <aside data-app-target="sidebar"></aside>
    <main data-app-target="editorPanel"></main>
    <aside data-app-target="previewPanel" class="hidden"></aside>
    <section data-app-target="libraryPanel" class="hidden"></section>
    <button data-app-target="libraryToggle" aria-pressed="false"></button>
  `
  const app = Object.create(AppController.prototype)
  Object.assign(app, {
    context: { element },
    libraryVisible: false,
    prepareEditorTransition: vi.fn(() => true),
    isCurrentNavigation: vi.fn(() => true),
    updatePathDisplay: vi.fn(),
    expandParentFolders: vi.fn(),
    showEditor: vi.fn(),
    refreshTree: vi.fn(),
    updateUrl: vi.fn()
  })
  return { app, element }
}

describe("AppController Library workspace", () => {
  afterEach(() => document.body.replaceChildren())

  it("opens Library while preserving the sidebar and restores the previous preview state on Explorer navigation", () => {
    const { app, element } = makeWorkspaceApp()
    const sidebar = element.querySelector('[data-app-target="sidebar"]')
    const editor = element.querySelector('[data-app-target="editorPanel"]')
    const preview = element.querySelector('[data-app-target="previewPanel"]')
    const library = element.querySelector('[data-app-target="libraryPanel"]')
    const button = element.querySelector('[data-app-target="libraryToggle"]')
    preview.classList.remove("hidden")
    preview.classList.add("flex")

    app.toggleLibrary()

    expect(sidebar.classList.contains("hidden")).toBe(false)
    expect(editor.classList.contains("hidden")).toBe(true)
    expect(preview.classList.contains("hidden")).toBe(true)
    expect(library.classList.contains("hidden")).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("true")

    app.applyLoadedFile("folder/selected.md", "note body", "revision", 1)

    expect(app.currentFile).toBe("folder/selected.md")
    expect(editor.classList.contains("hidden")).toBe(false)
    expect(library.classList.contains("hidden")).toBe(true)
    expect(preview.classList.contains("hidden")).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("false")
  })

  it("restores a hidden preview as hidden when closing Library", () => {
    const { app, element } = makeWorkspaceApp()
    const preview = element.querySelector('[data-app-target="previewPanel"]')
    app.showLibraryWorkspace()

    app.toggleLibrary()

    expect(preview.classList.contains("hidden")).toBe(true)
    expect(element.querySelector('[data-app-target="editorPanel"]').classList.contains("hidden")).toBe(false)
    expect(element.querySelector('[data-app-target="libraryToggle"]').getAttribute("aria-pressed")).toBe("false")
  })
})
