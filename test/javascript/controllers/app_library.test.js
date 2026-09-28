/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { appAlert } from "lib/app_prompt"
import AppController from "../../../app/javascript/controllers/app_controller.js"

vi.mock("lib/app_prompt", () => ({ appAlert: vi.fn().mockResolvedValue(undefined) }))

function makeWorkspaceApp() {
  window.t = (key) => key
  const element = document.createElement("div")
  element.innerHTML = `
    <aside data-app-target="sidebar"></aside>
    <main data-app-target="editorPanel"></main>
    <aside data-app-target="previewPanel" class="hidden"></aside>
    <section data-app-target="libraryPanel" class="hidden"></section>
    <button data-app-target="libraryToggle" aria-pressed="false"></button>
  `
  const app = Object.create(AppController.prototype)
  const libraryPanel = element.querySelector('[data-app-target="libraryPanel"]')
  const libraryController = { resetUsageForLibraryOpen: vi.fn(), load: vi.fn() }
  const application = {
    getControllerForElementAndIdentifier: vi.fn((candidate, identifier) =>
      candidate === libraryPanel && identifier === "library" ? libraryController : null
    )
  }
  Object.assign(app, {
    context: { element },
    libraryVisible: false,
    prepareEditorTransition: vi.fn(() => true),
    isCurrentNavigation: vi.fn(() => true),
    updatePathDisplay: vi.fn(),
    expandParentFolders: vi.fn(),
    showEditor: vi.fn(),
    refreshTree: vi.fn(),
    updateUrl: vi.fn(),
    onEditorChange: vi.fn(),
    codemirrorOutlets: [],
    previewOutlets: []
  })
  Object.defineProperty(app, "application", { value: application })
  return { app, element, application, libraryController }
}

describe("AppController Library workspace", () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete window.t
  })

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

  it("refreshes media and usage once each time Library opens", () => {
    const { app, element, application, libraryController } = makeWorkspaceApp()
    const library = element.querySelector('[data-app-target="libraryPanel"]')

    app.showLibraryWorkspace()
    app.showLibraryWorkspace()
    expect(libraryController.resetUsageForLibraryOpen).toHaveBeenCalledOnce()
    expect(libraryController.load).toHaveBeenCalledOnce()

    app.showEditorWorkspace()
    app.showLibraryWorkspace()

    expect(application.getControllerForElementAndIdentifier)
      .toHaveBeenCalledWith(library, "library")
    expect(libraryController.resetUsageForLibraryOpen).toHaveBeenCalledTimes(2)
    expect(libraryController.load).toHaveBeenCalledTimes(2)
  })

  it("opens valid Library usage note paths and rejects unsafe paths", () => {
    const { app } = makeWorkspaceApp()
    app.openFileAndRevealInTree = vi.fn()

    app.openLibraryNote({ detail: { path: "folder/used note.md" } })
    app.openLibraryNote({ detail: { path: "../outside.md" } })
    app.openLibraryNote({ detail: { path: "/absolute/note.md" } })
    app.openLibraryNote({ detail: { path: "folder/file.txt" } })

    expect(app.openFileAndRevealInTree).toHaveBeenCalledOnce()
    expect(app.openFileAndRevealInTree).toHaveBeenCalledWith("folder/used note.md")
  })

  it("inserts uploaded root images with a path relative to the current note", () => {
    const { app } = makeWorkspaceApp()
    const codemirror = {
      getValue: () => "",
      getSelection: () => ({ from: 0, to: 0 }),
      getCursorPosition: () => ({ offset: 0 }),
      insertAt: vi.fn(),
      replaceRange: vi.fn(),
      setSelection: vi.fn(),
      focus: vi.fn()
    }
    app.currentFile = "my-posts/note.md"
    app.currentFileType = "markdown"
    app.getCodemirrorController = vi.fn(() => codemirror)
    app.getPendingSlashInsertionRange = vi.fn(() => null)
    app.isMarkdownFile = vi.fn(() => true)

    app.onImageSelected({ detail: {
      markdown: "![photo](images/photo.png)",
      imageUrl: "images/photo.png",
      altText: "photo",
      linkUrl: ""
    } })

    expect(codemirror.replaceRange).toHaveBeenCalledWith("![photo](../images/photo.png)", 0, 0)
  })

  it("hides and restores a visible preview through its controller", () => {
    const { app, element } = makeWorkspaceApp()
    const previewPanel = element.querySelector('[data-app-target="previewPanel"]')
    previewPanel.classList.remove("hidden")
    previewPanel.classList.add("flex")
    let previewVisible = true
    const previewController = {
      get isVisible() { return previewVisible },
      hide: vi.fn(() => {
        previewVisible = false
        previewPanel.classList.add("hidden")
        previewPanel.classList.remove("flex")
      }),
      show: vi.fn(() => {
        previewVisible = true
        previewPanel.classList.remove("hidden")
        previewPanel.classList.add("flex")
      })
    }
    app.previewOutlets = [previewController]

    app.showLibraryWorkspace()
    expect(previewController.hide).toHaveBeenCalledOnce()
    expect(previewVisible).toBe(false)

    app.showEditorWorkspace()
    expect(previewController.show).toHaveBeenCalledOnce()
    expect(previewVisible).toBe(true)
    expect(previewPanel.classList.contains("hidden")).toBe(false)
  })

  it("inserts an image with a note-relative encoded path and returns to the editor", () => {
    const { app, element } = makeWorkspaceApp()
    const codemirror = {
      getValue: () => "",
      getSelection: () => ({ from: 0, to: 0 }),
      getCursorPosition: () => ({ offset: 0 }),
      insertAt: vi.fn(),
      replaceRange: vi.fn(),
      setSelection: vi.fn(),
      focus: vi.fn()
    }
    app.currentFile = "folder/sub/note.md"
    app.currentFileType = "markdown"
    app.codemirrorOutlets = [codemirror]
    app.libraryVisible = true
    element.querySelector('[data-app-target="libraryPanel"]').classList.remove("hidden")
    element.querySelector('[data-app-target="editorPanel"]').classList.add("hidden")
    const event = {
      detail: {
        item: { name: "photo one.png", path: "images/photo (one).png", type: "image" },
        status: "pending"
      }
    }

    expect(app.insertLibraryMedia(event)).toBe(true)

    expect(codemirror.replaceRange).toHaveBeenCalledWith("![photo one.png](../../images/photo%20%28one%29.png)", 0, 0)
    expect(codemirror.focus).toHaveBeenCalled()
    expect(app.onEditorChange).toHaveBeenCalledWith({ detail: { docChanged: true } })
    expect(event.detail.status).toBe("inserted")
    expect(element.querySelector('[data-app-target="libraryPanel"]').classList.contains("hidden")).toBe(true)
    expect(element.querySelector('[data-app-target="editorPanel"]').classList.contains("hidden")).toBe(false)
  })

  it("inserts a video embed with a relative path from a root note", () => {
    const { app } = makeWorkspaceApp()
    const codemirror = {
      getValue: () => "",
      getSelection: () => ({ from: 0, to: 0 }),
      getCursorPosition: () => ({ offset: 0 }),
      insertAt: vi.fn(),
      replaceRange: vi.fn(),
      setSelection: vi.fn(),
      focus: vi.fn()
    }
    app.currentFile = "note.md"
    app.currentFileType = "markdown"
    app.codemirrorOutlets = [codemirror]
    const event = {
      detail: {
        item: { name: "clip.mp4", path: "videos/nested/clip.mp4", type: "video" },
        status: "pending"
      }
    }

    expect(app.insertLibraryMedia(event)).toBe(true)

    expect(codemirror.insertAt).toHaveBeenCalledWith(
      0,
      '<video controls class="video-player">\n  <source src="videos/nested/clip.mp4" type="video/mp4">\n</video>'
    )
    expect(event.detail.status).toBe("inserted")
  })

  it("explains when no note is open or the open file is not Markdown", () => {
    const { app } = makeWorkspaceApp()
    const event = { detail: { item: { name: "photo.png", path: "images/photo.png", type: "image" }, status: "pending" } }

    expect(app.insertLibraryMedia(event)).toBe(false)
    expect(event.detail.status).toBe("no_open_note")
    expect(appAlert).toHaveBeenLastCalledWith("library.no_open_note")

    app.currentFile = ".fed"
    app.currentFileType = "config"
    event.detail.status = "pending"
    expect(app.insertLibraryMedia(event)).toBe(false)
    expect(event.detail.status).toBe("markdown_note_required")
    expect(appAlert).toHaveBeenLastCalledWith("library.markdown_note_required")
  })
})
