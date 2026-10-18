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
    sessionStorage.clear()
    window.t = key => key
    document.body.innerHTML = `<div data-controller="app" data-action="click@document->app#onWorkspaceOutsideClick keydown@document->app#onWorkspaceKeydown">
      <aside data-app-target="sidebar">
        <header><button data-app-target="sidebarToggle" data-action="click->app#toggleSidebar"></button><button>FrankMD</button></header>
        <div data-app-target="explorerPanel"><button>New note</button></div><button data-app-target="libraryToggle">Library</button><button data-app-target="settingsToggle">Settings</button>
      </aside>
      <div data-workspace-main><header>
      <button data-app-target="documentTitle" data-action="click->app#renameCurrentNote"></button>
      <input data-app-target="titleInput" class="hidden" data-action="keydown->app#onTitleRenameKeydown input->app#onTitleRenameInput blur->app#cancelTitleRename">
      <p data-app-target="titleRenameError" class="hidden" role="alert"></p>
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
      </header>
      <main data-app-target="editorPanel"></main><aside data-app-target="previewPanel" class="hidden"></aside><section data-app-target="libraryPanel" class="hidden"></section></div>
    </div>`
    application = Application.start()
    application.register("app", WorkspaceController)
    await new Promise(resolve => setTimeout(resolve, 0))
    root = document.querySelector('[data-controller="app"]')
    app = application.getControllerForElementAndIdentifier(root, "app")
    rename = vi.fn().mockResolvedValue({ ok: true, path: "folder/renamed.md" })
    vi.spyOn(app, "getFileOperationsController").mockReturnValue({ renamePath: rename })
    vi.spyOn(app, "getCodemirrorController").mockReturnValue({ refreshTypewriterLayout: vi.fn() })
    app.currentFile = "folder/note.md"
    app.currentFileType = "markdown"
    app.sidebarVisible = true
    app.mobileWorkspace = false
    app.libraryVisible = false
    app.updateWorkspaceChrome()
  })

  afterEach(() => { application.stop(); vi.restoreAllMocks(); document.body.innerHTML = "" })

  it("opens the title field with the caret at the end without selecting text", () => {
    target("documentTitle").click()
    const input = target("titleInput")
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe("note")
    expect([input.selectionStart, input.selectionEnd]).toEqual([4, 4])
    expect(target("documentTitle").classList.contains("hidden")).toBe(true)
    expect(rename).not.toHaveBeenCalled()
  })

  it("saves with Enter through file operations and restores title focus", async () => {
    target("documentTitle").click()
    target("titleInput").value = "renamed"
    key(target("titleInput"), "Enter")
    await vi.waitFor(() => expect(target("titleInput").classList.contains("hidden")).toBe(true))
    expect(rename).toHaveBeenCalledWith({ path: "folder/note.md", type: "file" }, "renamed")
    expect(document.activeElement).toBe(target("documentTitle"))
  })

  it("cancels with Escape before leaving the Library workspace", () => {
    app.libraryVisible = true
    target("documentTitle").click()
    target("titleInput").value = "cancelled"
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    expect(app.onWorkspaceKeydown(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(app.libraryVisible).toBe(true)
    expect(target("titleInput").classList.contains("hidden")).toBe(true)
    expect(document.activeElement).toBe(target("documentTitle"))
    expect(rename).not.toHaveBeenCalled()
  })

  it("cancels when the field loses focus", () => {
    target("documentTitle").click()
    target("titleInput").value = "cancelled"
    target("titleInput").blur()
    expect(target("titleInput").classList.contains("hidden")).toBe(true)
    expect(rename).not.toHaveBeenCalled()
  })

  it("keeps failures beside the field and allows retrying", async () => {
    rename.mockResolvedValueOnce({ ok: false, error: "Name already exists" })
    target("documentTitle").click()
    target("titleInput").value = "occupied"
    await app.submitTitleRename()
    expect(target("titleRenameError").textContent).toBe("Name already exists")
    expect(target("titleInput").value).toBe("occupied")
    expect(target("titleInput").getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(target("titleInput"))
    target("titleInput").value = "renamed"
    target("titleInput").dispatchEvent(new Event("input", { bubbles: true }))
    expect(target("titleRenameError").classList.contains("hidden")).toBe(true)
    await app.submitTitleRename()
    expect(target("titleInput").classList.contains("hidden")).toBe(true)
    expect(rename).toHaveBeenCalledTimes(2)
  })

  it("does not replace an existing draft warning with a filename error", async () => {
    rename.mockResolvedValue({ ok: false, error: null })
    target("documentTitle").click()
    await app.submitTitleRename()
    expect(target("titleRenameError").classList.contains("hidden")).toBe(true)
    expect(target("titleInput").disabled).toBe(false)
    expect(target("titleInput").hasAttribute("aria-invalid")).toBe(false)
  })

  it("prevents duplicate requests and ignores blur while saving", async () => {
    let complete
    rename.mockReturnValue(new Promise(resolve => { complete = resolve }))
    target("documentTitle").click()
    const pending = app.submitTitleRename()
    await app.submitTitleRename()
    app.cancelTitleRename(new Event("blur"))
    expect(rename).toHaveBeenCalledOnce()
    expect(target("titleInput").disabled).toBe(true)
    expect(target("titleInput").classList.contains("hidden")).toBe(false)
    complete({ ok: true, path: "folder/note.md" })
    await pending
    expect(target("titleInput").classList.contains("hidden")).toBe(true)
  })

  it("discards stale results after navigating to another file", async () => {
    let complete
    rename.mockReturnValue(new Promise(resolve => { complete = resolve }))
    target("documentTitle").click()
    target("titleInput").value = "renamed"
    const pending = app.submitTitleRename()
    app.currentFile = "other.md"
    app.updateWorkspaceChrome()
    complete({ ok: false, error: "Old file error" })
    await pending
    expect(rename).toHaveBeenCalledWith({ path: "folder/note.md", type: "file" }, "renamed")
    expect(target("titleInput").classList.contains("hidden")).toBe(true)
    expect(target("titleRenameError").classList.contains("hidden")).toBe(true)
    expect(app.currentFile).toBe("other.md")
  })

  it("does not submit a stale edit against the newly selected note", async () => {
    target("documentTitle").click()
    app.currentFile = "other.md"
    await app.submitTitleRename()
    expect(rename).not.toHaveBeenCalled()
    expect(target("titleInput").classList.contains("hidden")).toBe(true)
  })

  it("leaves IME composition Enter to the text field", () => {
    target("documentTitle").click()
    key(target("titleInput"), "Enter", { isComposing: true })
    expect(rename).not.toHaveBeenCalled()
    expect(target("titleInput").classList.contains("hidden")).toBe(false)
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
    expect(target("documentTitle").closest("[data-workspace-main]").inert).toBe(true)
    target("settingsToggle").focus()
    key(target("settingsToggle"), "Tab")
    expect(document.activeElement).toBe(target("sidebarToggle"))
    key(target("sidebarToggle"), "Escape")
    expect(target("sidebar").classList.contains("is-overlay")).toBe(false)
    expect(target("documentTitle").closest("[data-workspace-main]").inert).toBe(false)
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

  it.each([["ArrowDown", "Edit"], ["ArrowUp", "Help"]])("opens by pointer without focusing an option and supports %s", (arrow, label) => {
    target("overflowToggle").focus()
    target("overflowToggle").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
    expect(target("overflowMenu").classList.contains("hidden")).toBe(false)
    expect(document.activeElement).toBe(target("overflowToggle"))
    key(target("overflowToggle"), arrow)
    expect(document.activeElement.textContent).toBe(label)
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

  describe("toolbar pins", () => {
    const pin = () => root.querySelector('[data-workspace-pin="video"]')
    const icon = () => root.querySelector('[data-workspace-pinned-action="video"]')

    beforeEach(() => {
      target("editorToolbar").innerHTML = '<button data-workspace-pinned-action="video" data-pinned="false" data-workspace-editing-action>Video</button>'
      target("overflowMenu").insertAdjacentHTML("beforeend", `<div class="workspace-menu-row" data-workspace-editing-action>
        <button role="menuitem">Video</button>
        <button role="menuitemcheckbox" data-workspace-pin="video" data-pin-label="Pin Video" data-unpin-label="Unpin Video" data-action="click->app#toggleWorkspacePin"></button>
      </div>`)
      app._workspacePinnedActions = null
      app.updateWorkspaceChrome()
    })

    it("pins and unpins without running the action or closing the menu", async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      const action = vi.fn()
      pin().previousElementSibling.addEventListener("click", action)
      target("overflowToggle").click()
      pin().focus()
      pin().click()
      expect(pin().getAttribute("aria-checked")).toBe("true")
      expect(pin().getAttribute("aria-label")).toBe("Unpin Video")
      expect(icon().dataset.pinned).toBe("true")
      expect(document.activeElement).toBe(pin())
      expect(target("overflowMenu").classList.contains("hidden")).toBe(false)
      expect(action).not.toHaveBeenCalled()
      pin().click()
      expect(pin().getAttribute("aria-checked")).toBe("false")
      expect(icon().dataset.pinned).toBe("false")
      expect(JSON.parse(sessionStorage.getItem("frankmd.workspacePins"))).toEqual([])
    })

    it("restores only known pins from this browser session", () => {
      sessionStorage.setItem("frankmd.workspacePins", JSON.stringify(["video", "unknown"]))
      app._workspacePinnedActions = null
      app.updateWorkspacePins()
      expect(icon().dataset.pinned).toBe("true")
      expect([...app._workspacePinnedActions]).toEqual(["video"])
    })

    it("uses defaults with malformed or unavailable storage", () => {
      icon().dataset.pinned = "true"
      sessionStorage.setItem("frankmd.workspacePins", "broken JSON")
      app._workspacePinnedActions = null
      app.updateWorkspacePins()
      expect(icon().dataset.pinned).toBe("true")
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
      app._workspacePinnedActions = null
      app.updateWorkspacePins()
      app.toggleWorkspacePin({ currentTarget: pin() })
      expect(icon().dataset.pinned).toBe("false")
    })

    it("preserves pins while hiding editing actions in preview and Library", () => {
      app.toggleWorkspacePin({ currentTarget: pin() })
      target("editorPanel").classList.add("hidden")
      app.updateWorkspaceChrome()
      expect(icon().hidden).toBe(true)
      expect(app.workspaceMenuItems()).not.toContain(pin())
      app.libraryVisible = true
      app.updateWorkspaceChrome()
      expect(icon().hidden).toBe(true)
      app.libraryVisible = false
      target("editorPanel").classList.remove("hidden")
      app.updateWorkspaceChrome()
      expect(icon().hidden).toBe(false)
      expect(icon().dataset.pinned).toBe("true")
    })

    it("navigates to the pin with arrows in both text directions", () => {
      target("overflowToggle").click()
      pin().previousElementSibling.focus()
      key(document.activeElement, "ArrowRight")
      expect(document.activeElement).toBe(pin())
      key(document.activeElement, "ArrowLeft")
      expect(document.activeElement).toBe(pin().previousElementSibling)
      target("overflowMenu").style.direction = "rtl"
      key(document.activeElement, "ArrowLeft")
      expect(document.activeElement).toBe(pin())
      key(document.activeElement, "Escape")
      expect(document.activeElement).toBe(target("overflowToggle"))
    })
  })

  it("keeps both AI controls busy and restores them together", async () => {
    target("editorToolbar").innerHTML = '<button data-app-target="aiButton">AI icon</button>'
    target("overflowMenu").insertAdjacentHTML("beforeend", '<button data-app-target="aiButton">AI menu</button>')
    await new Promise(resolve => setTimeout(resolve, 0))
    const setReadOnly = vi.fn()
    app.getCodemirrorController.mockReturnValue({ setReadOnly })
    app.onAiProcessingStarted()
    expect(app.aiButtonTargets.every(button => button.disabled && button.getAttribute("aria-busy") === "true")).toBe(true)
    app.onAiProcessingEnded()
    expect(app.aiButtonTargets.every(button => !button.disabled && !button.hasAttribute("aria-busy"))).toBe(true)
    expect(app.aiButtonTargets.map(button => button.textContent)).toEqual(["AI icon", "AI menu"])
    expect(setReadOnly.mock.calls).toEqual([[true], [false]])
  })
})
