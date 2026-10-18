/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import AppController from "../../../app/javascript/controllers/app_controller"

// Exercise the real workspace methods and Stimulus actions without booting the editor.
class WorkspaceController extends AppController {
  connect() {}
  disconnect() {}
}

describe("workspace chrome", () => {
  let application, app, root, rename
  const target = name => root.querySelector(`[data-app-target='${name}']`)
  const key = (element, value, options = {}) => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options }))

  beforeEach(async () => {
    document.body.innerHTML = `<div data-controller="app" data-action="click@document->app#onWorkspaceOutsideClick keydown@document->app#onWorkspaceKeydown">
      <button data-app-target="sidebarToggle" data-action="click->app#toggleSidebar"></button>
      <button data-app-target="documentTitle" data-action="click->app#renameCurrentNote"></button>
      <div data-app-target="editorToolbar"></div><button data-app-target="previewToggle"></button>
      <div data-app-target="overflowContainer" data-action="keydown->app#navigateWorkspaceMenu">
        <button data-app-target="overflowToggle" data-action="click->app#toggleWorkspaceMenu"></button>
        <div data-app-target="overflowMenu" class="hidden">
          <button role="menuitem" tabindex="-1" data-workspace-editing-action data-action="click->app#closeWorkspaceMenu click->app#openHelp">Edit</button>
          <button role="menuitem" tabindex="-1" data-workspace-document-action>Copy</button>
          <button role="menuitem" tabindex="-1">Help</button>
        </div>
      </div>
      <button data-app-target="sidebarBackdrop" class="hidden"></button>
      <aside data-app-target="sidebar"><div data-app-target="explorerPanel"><button>New note</button></div><button data-app-target="libraryToggle">Library</button><button data-app-target="settingsToggle">Settings</button></aside>
      <main data-app-target="editorPanel"></main><aside data-app-target="previewPanel" class="hidden"></aside><section data-app-target="libraryPanel" class="hidden"></section>
    </div>`
    application = Application.start()
    application.register("app", WorkspaceController)
    await new Promise(resolve => setTimeout(resolve, 0))
    root = document.querySelector('[data-controller="app"]')
    app = application.getControllerForElementAndIdentifier(root, "app")
    rename = vi.fn()
    vi.spyOn(app, "getFileOperationsController").mockReturnValue({ renameExplorerItem: rename })
    vi.spyOn(app, "getCodemirrorController").mockReturnValue({ refreshTypewriterLayout: vi.fn() })
    app.currentFile = "folder/note.md"
    app.currentFileType = "markdown"
    app.sidebarVisible = true
    app.mobileWorkspace = false
    app.libraryVisible = false
    app.updateWorkspaceChrome()
  })

  afterEach(() => { application.stop(); vi.restoreAllMocks(); document.body.innerHTML = "" })

  it("renames the active note rather than the Explorer selection", () => {
    target("documentTitle").click()
    expect(rename).toHaveBeenCalledWith({ path: "folder/note.md", type: "file", fileType: "markdown" })
  })

  it.each([null, ".fed"])("guards title rename for %s", path => {
    app.currentFile = path
    app.updateWorkspaceChrome()
    app.renameCurrentNote()
    expect(target("documentTitle").disabled).toBe(true)
    expect(rename).not.toHaveBeenCalled()
  })

  it("copies through the existing path-display controller", () => {
    const copy = vi.fn()
    vi.spyOn(app, "getPathDisplayController").mockReturnValue({ copy })
    app.copyCurrentPath()
    expect(copy).toHaveBeenCalledOnce()
  })

  it("keeps navigation in the collapsed rail and refreshes editor geometry", () => {
    target("explorerPanel").querySelector("button").focus()
    app.toggleSidebar()
    expect(document.activeElement).toBe(target("sidebarToggle"))
    expect(target("sidebar").classList.contains("is-collapsed")).toBe(true)
    expect(target("sidebar").classList.contains("hidden")).toBe(false)
    expect(target("explorerPanel").inert).toBe(true)
    expect(target("libraryToggle").closest("[inert]")).toBeNull()
    expect(target("sidebarToggle").getAttribute("aria-expanded")).toBe("false")
    expect(app.getCodemirrorController().refreshTypewriterLayout).toHaveBeenCalled()
  })

  it("opens the mobile overlay, contains focus, and closes it with Escape", () => {
    app.mobileWorkspace = true
    app.sidebarVisible = false
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}])
    target("sidebarToggle").click()
    expect(target("sidebar").classList.contains("is-overlay")).toBe(true)
    expect(target("sidebarBackdrop").classList.contains("hidden")).toBe(false)
    expect(target("editorPanel").inert).toBe(true)
    target("settingsToggle").focus()
    key(target("settingsToggle"), "Tab")
    expect(document.activeElement).toBe(target("sidebarToggle"))
    key(target("sidebarToggle"), "Escape")
    expect(target("sidebar").classList.contains("is-overlay")).toBe(false)
    expect(target("editorPanel").inert).toBe(false)
    expect(document.activeElement).toBe(target("sidebarToggle"))
  })

  it("shows only applicable actions in single preview, Library, and empty states", () => {
    expect(target("editorToolbar").classList.contains("hidden")).toBe(false)
    target("editorPanel").classList.add("hidden")
    app.updateWorkspaceChrome()
    expect(target("editorToolbar").classList.contains("hidden")).toBe(true)
    expect(root.querySelector("[data-workspace-editing-action]").hidden).toBe(true)
    expect(target("previewToggle").disabled).toBe(false)
    app.libraryVisible = true
    app.updateWorkspaceChrome()
    expect(target("previewToggle").disabled).toBe(true)
    app.currentFile = null
    app.updateWorkspaceChrome()
    expect(root.querySelector("[data-workspace-document-action]").hidden).toBe(true)
    app.toggleWorkspaceMenu()
    expect(document.activeElement.textContent).toBe("Help")
  })

  it("keeps overflow usable when a note finishes loading after the menu opens", () => {
    app.currentFile = null
    app.updateWorkspaceChrome()
    target("overflowToggle").click()
    app.currentFile = "folder/note.md"
    app.updateWorkspaceChrome()
    expect(target("overflowMenu").classList.contains("hidden")).toBe(false)
    expect(app.workspaceMenuItems().map(item => item.textContent)).toEqual(["Edit", "Copy", "Help"])
  })

  it("supports arrow, Home, End and Escape navigation", () => {
    key(target("overflowToggle"), "ArrowDown")
    expect(document.activeElement.textContent).toBe("Edit")
    key(document.activeElement, "ArrowDown")
    expect(document.activeElement.textContent).toBe("Copy")
    key(document.activeElement, "End")
    expect(document.activeElement.textContent).toBe("Help")
    key(document.activeElement, "Home")
    expect(document.activeElement.textContent).toBe("Edit")
    key(document.activeElement, "Escape")
    expect(target("overflowMenu").classList.contains("hidden")).toBe(true)
    expect(document.activeElement).toBe(target("overflowToggle"))
  })

  it("closes before launching a dialog and leaves focus in that dialog", () => {
    vi.spyOn(app, "openHelp").mockImplementation(() => {
      expect(target("overflowMenu").classList.contains("hidden")).toBe(true)
      const dialog = document.createElement("dialog")
      dialog.innerHTML = "<button>Close</button>"
      document.body.append(dialog)
      dialog.querySelector("button").focus()
    })
    target("overflowToggle").click()
    app.workspaceMenuItems()[0].click()
    expect(document.activeElement.textContent).toBe("Close")
  })

  it("dismisses on outside click and Tab without trapping focus", () => {
    target("overflowToggle").click()
    document.body.click()
    expect(target("overflowToggle").getAttribute("aria-expanded")).toBe("false")
    target("overflowToggle").click()
    key(document.activeElement, "Tab")
    expect(target("overflowMenu").classList.contains("hidden")).toBe(true)
    expect(document.activeElement).toBe(target("overflowToggle"))
  })
})
