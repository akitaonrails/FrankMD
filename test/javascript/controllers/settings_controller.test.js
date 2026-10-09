import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { setupJsdomGlobals } from "../helpers/jsdom_globals.js"
import SettingsController from "../../../app/javascript/controllers/settings_controller.js"
import AppController from "../../../app/javascript/controllers/app_controller.js"

function makePanelDom() {
  document.body.innerHTML = `
    <div data-controller="app">
      <aside data-app-target="sidebar"></aside>
      <main data-app-target="editorPanel"></main>
      <aside data-app-target="previewPanel" class="hidden"></aside>
      <section data-app-target="libraryPanel" class="hidden"></section>
      <section id="settings-panel"
           class="hidden"
           data-app-target="settingsPanel"
           data-controller="settings"
           data-settings-font-value="cascadia-code"
           data-settings-font-size-value="14"
           data-settings-editor-width-value="72"
           data-settings-preview-zoom-value="100"
           data-settings-line-numbers-value="0"
           data-settings-cursor-recenter-on-click-value="false"
           data-settings-indent-value="2"
           data-settings-scroll-sync-value="true"
           data-settings-theme-value=""
           data-settings-codemirror-outlet='[data-controller~="mock-codemirror"]'
           data-settings-preview-outlet='[data-controller~="mock-preview"]'>
        <nav>
          <button type="button" data-settings-target="navButton" data-category="general" aria-pressed="true">General</button>
          <button type="button" data-settings-target="navButton" data-category="editor" aria-pressed="false">Editor</button>
          <button type="button" data-settings-target="navButton" data-category="writing" aria-pressed="false">Writing</button>
          <button type="button" data-settings-target="navButton" data-category="preview" aria-pressed="false">Preview</button>
        </nav>
        <div>
          <div data-settings-target="section" data-category="general"></div>
          <div class="hidden" data-settings-target="section" data-category="editor">
            <select data-settings-target="fontSelect">
              <option value="cascadia-code" selected>Cascadia Code</option>
              <option value="fira-code">Fira Code</option>
            </select>
            <select data-settings-target="fontSizeSelect">
              <option value="14" selected>14px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
            </select>
            <div data-settings-target="fontPreview"></div>
            <input type="range" min="40" max="200" step="8" value="72" data-settings-target="widthInput">
            <span data-settings-target="widthLabel">72ch</span>
            <select data-settings-target="lineNumbersSelect">
              <option value="0" selected>Off</option>
              <option value="1">Absolute</option>
              <option value="2">Relative</option>
            </select>
            <select data-settings-target="indentSelect">
              <option value="2" selected>2 spaces</option>
              <option value="4">4 spaces</option>
            </select>
            <div class="settings-segmented">
              <button type="button" data-settings-target="viewModeButton" data-view-mode="split" aria-pressed="true">Split View</button>
              <button type="button" data-settings-target="viewModeButton" data-view-mode="single" aria-pressed="false">Single View</button>
            </div>
          </div>
          <div class="hidden" data-settings-target="section" data-category="writing">
            <button type="button" data-settings-target="cursorRecenterOnClickToggle" aria-pressed="false"></button>
          </div>
          <div class="hidden" data-settings-target="section" data-category="preview">
            <select data-settings-target="zoomSelect">
              <option value="50">50%</option>
              <option value="100" selected>100%</option>
              <option value="150">150%</option>
            </select>
          </div>
          <p class="hidden" data-settings-target="status"></p>
        </div>
      </section>
      <button data-app-target="libraryToggle" aria-pressed="false"></button>
      <button data-app-target="settingsToggle" aria-pressed="false"></button>
    </div>
    <div data-controller="mock-codemirror" data-mock-codemirror-content-value="">
      <div data-mock-codemirror-target="container"></div>
      <textarea data-mock-codemirror-target="hidden"></textarea>
    </div>
    <div data-controller="mock-preview" data-mock-preview-zoom-value="100"></div>
  `
}

describe("SettingsController", () => {
  let application
  let controller

  beforeEach(() => {
    setupJsdomGlobals()
    window.t = (key) => key

    // Mock fetch for saveSetting()/reload()
    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    makePanelDom()

    application = Application.start()
    application.register("settings", SettingsController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(
          document.getElementById("settings-panel"), "settings"
        )
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
    delete window.t
  })

  // === Ported from editor_config_controller.test.js ===

  describe("static editorFonts", () => {
    it("has cascadia-code as first font", () => {
      expect(SettingsController.editorFonts[0].id).toBe("cascadia-code")
    })

    it("has correct font structure", () => {
      SettingsController.editorFonts.forEach(font => {
        expect(font).toHaveProperty("id")
        expect(font).toHaveProperty("name")
        expect(font).toHaveProperty("family")
      })
    })
  })

  describe("connect()", () => {
    it("applies editor width via CSS custom property", () => {
      expect(document.documentElement.style.getPropertyValue("--editor-width")).toBe("72ch")
    })

    it("does not throw during initialization (outlets not connected)", () => {
      expect(controller).toBeTruthy()
    })

    it("initializes readiness flags to false", () => {
      expect(controller._codemirrorReady).toBe(false)
      expect(controller._previewReady).toBe(false)
    })
  })

  describe("value changed callbacks guard against unconnected outlets", () => {
    it("fontValueChanged skips applyFont when codemirror not ready", () => {
      const spy = vi.spyOn(controller, "applyFont")
      controller.fontValueChanged()
      expect(spy).not.toHaveBeenCalled()
    })

    it("fontSizeValueChanged skips applyFont when codemirror not ready", () => {
      const spy = vi.spyOn(controller, "applyFont")
      controller.fontSizeValueChanged()
      expect(spy).not.toHaveBeenCalled()
    })

    it("lineNumbersValueChanged skips applyLineNumbers when codemirror not ready", () => {
      const spy = vi.spyOn(controller, "applyLineNumbers")
      controller.lineNumbersValueChanged()
      expect(spy).not.toHaveBeenCalled()
    })

    it("previewZoomValueChanged skips applyPreviewZoom when preview not ready", () => {
      const spy = vi.spyOn(controller, "applyPreviewZoom")
      controller.previewZoomValueChanged()
      expect(spy).not.toHaveBeenCalled()
    })

    it("scrollSyncValueChanged skips applyScrollSync when preview not ready", () => {
      const spy = vi.spyOn(controller, "applyScrollSync")
      controller.scrollSyncValueChanged()
      expect(spy).not.toHaveBeenCalled()
    })

    it("editorWidthValueChanged applies without outlets (CSS-only)", () => {
      controller.editorWidthValue = 80
      controller.editorWidthValueChanged()
      expect(document.documentElement.style.getPropertyValue("--editor-width")).toBe("80ch")
    })

    it("themeValueChanged dispatches event without outlets", () => {
      const spy = vi.fn()
      window.addEventListener("frankmd:config-changed", spy)

      controller.themeValue = "gruvbox"
      controller.themeValueChanged()

      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0][0].detail.theme).toBe("gruvbox")
    })
  })

  describe("outlet connected callbacks", () => {
    it("codemirrorOutletConnected sets _codemirrorReady and applies settings", () => {
      const applyFontSpy = vi.spyOn(controller, "applyFont")
      const applyLineNumbersSpy = vi.spyOn(controller, "applyLineNumbers")
      const applyClickRecenterSpy = vi.spyOn(controller, "applyCursorRecenterOnClick")

      controller.codemirrorOutletConnected()

      expect(controller._codemirrorReady).toBe(true)
      expect(applyFontSpy).toHaveBeenCalled()
      expect(applyLineNumbersSpy).toHaveBeenCalled()
      expect(applyClickRecenterSpy).toHaveBeenCalled()
    })

    it("previewOutletConnected sets _previewReady and applies zoom and scroll sync", () => {
      const applyZoomSpy = vi.spyOn(controller, "applyPreviewZoom")
      const applyScrollSyncSpy = vi.spyOn(controller, "applyScrollSync")

      controller.previewOutletConnected()

      expect(controller._previewReady).toBe(true)
      expect(applyZoomSpy).toHaveBeenCalled()
      expect(applyScrollSyncSpy).toHaveBeenCalled()
    })

    it("fontValueChanged calls applyFont AFTER codemirror is ready", () => {
      controller.codemirrorOutletConnected()

      const spy = vi.spyOn(controller, "applyFont")
      controller.fontValueChanged()

      expect(spy).toHaveBeenCalled()
    })

    it("previewZoomValueChanged calls applyPreviewZoom AFTER preview is ready", () => {
      controller.previewOutletConnected()

      const spy = vi.spyOn(controller, "applyPreviewZoom")
      controller.previewZoomValueChanged()

      expect(spy).toHaveBeenCalled()
    })
  })

  describe("applyEditorWidth()", () => {
    it("sets CSS custom property from value", () => {
      controller.editorWidthValue = 100
      controller.applyEditorWidth()
      expect(document.documentElement.style.getPropertyValue("--editor-width")).toBe("100ch")
    })
  })

  describe("applyTheme()", () => {
    it("dispatches config-changed event with theme", () => {
      const spy = vi.fn()
      window.addEventListener("frankmd:config-changed", spy)

      controller.themeValue = "tokyo-night"
      controller.applyTheme()

      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0][0].detail.theme).toBe("tokyo-night")
    })

    it("does not dispatch event when theme is empty", () => {
      const spy = vi.fn()
      window.addEventListener("frankmd:config-changed", spy)

      controller.themeValue = ""
      controller.applyTheme()

      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe("applyScrollSync()", () => {
    it("flips the preview controller's syncScrollEnabledValue", () => {
      const mockPreview = { syncScrollEnabledValue: true }
      controller.getPreviewController = () => mockPreview

      controller.scrollSyncValue = false
      controller.applyScrollSync()

      expect(mockPreview.syncScrollEnabledValue).toBe(false)

      controller.scrollSyncValue = true
      controller.applyScrollSync()

      expect(mockPreview.syncScrollEnabledValue).toBe(true)
    })

    it("does nothing when the preview outlet is unavailable", () => {
      controller.getPreviewController = () => null

      expect(() => {
        controller.scrollSyncValue = false
        controller.applyScrollSync()
      }).not.toThrow()
    })
  })

  describe("applyFont()", () => {
    it("applies family and size to the codemirror controller", () => {
      const mockCodemirror = { setFontFamily: vi.fn(), setFontSize: vi.fn() }
      controller.getCodemirrorController = () => mockCodemirror

      controller.fontValue = "fira-code"
      controller.fontSizeValue = 16
      controller.applyFont()

      expect(mockCodemirror.setFontFamily).toHaveBeenCalledWith("'Fira Code', monospace")
      expect(mockCodemirror.setFontSize).toHaveBeenCalledWith(16)
    })
  })

  describe("public getters", () => {
    it("exposes currentFont", () => {
      expect(controller.currentFont).toBe("cascadia-code")
    })

    it("exposes currentFontSize", () => {
      expect(controller.currentFontSize).toBe(14)
    })

    it("exposes editorWidth", () => {
      expect(controller.editorWidth).toBe(72)
    })

    it("exposes previewZoom", () => {
      expect(controller.previewZoom).toBe(100)
    })

    it("exposes lineNumberMode as numeric value", () => {
      // 0 = OFF, 1 = ABSOLUTE, 2 = RELATIVE
      expect(controller.lineNumberMode).toBe(0)
    })

    it("exposes typewriterModeEnabled", () => {
      expect(controller.typewriterModeEnabled).toBe(false)
    })

    it("exposes scrollSyncEnabled (default true)", () => {
      expect(controller.scrollSyncEnabled).toBe(true)
    })

    it("exposes fonts list", () => {
      expect(controller.fonts).toBe(SettingsController.editorFonts)
    })
  })

  // === New workspace behavior ===

  describe("showCategory()", () => {
    it("switches the visible section and nav aria-pressed state", () => {
      controller.showCategory({ currentTarget: controller.navButtonTargets.find(b => b.dataset.category === "editor") })

      const editorSection = controller.sectionTargets.find(s => s.dataset.category === "editor")
      const generalSection = controller.sectionTargets.find(s => s.dataset.category === "general")
      expect(editorSection.classList.contains("hidden")).toBe(false)
      expect(generalSection.classList.contains("hidden")).toBe(true)

      const editorNav = controller.navButtonTargets.find(b => b.dataset.category === "editor")
      const generalNav = controller.navButtonTargets.find(b => b.dataset.category === "general")
      expect(editorNav.getAttribute("aria-pressed")).toBe("true")
      expect(generalNav.getAttribute("aria-pressed")).toBe("false")
    })

    it("switches back to general", () => {
      controller.showCategory({ currentTarget: controller.navButtonTargets.find(b => b.dataset.category === "editor") })
      controller.showCategory({ currentTarget: controller.navButtonTargets.find(b => b.dataset.category === "general") })

      const generalSection = controller.sectionTargets.find(s => s.dataset.category === "general")
      expect(generalSection.classList.contains("hidden")).toBe(false)
    })
  })

  describe("closeSettings()", () => {
    it("dispatches close when the panel is visible", () => {
      const handler = vi.fn()
      controller.element.addEventListener("settings:close", handler)
      controller.element.classList.remove("hidden")

      controller.closeSettings()

      expect(handler).toHaveBeenCalled()
    })

    it("does nothing when already hidden", () => {
      const handler = vi.fn()
      controller.element.addEventListener("settings:close", handler)

      controller.closeSettings()

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe("control handlers persist via PATCH /config", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    // Stimulus value-change callbacks are microtask-batched; flush once so
    // apply-behavior assertions observe them.
    const flush = () => vi.advanceTimersByTimeAsync(0)

    const patchCall = () => {
      const call = global.fetch.mock.calls.find(([url, options]) => url === "/config" && options.method === "PATCH")
      expect(call).toBeTruthy()
      return JSON.parse(call[1].body)
    }

    it("font change applies live and PATCHes editor_font", async () => {
      controller.getCodemirrorController = () => ({ setFontFamily: vi.fn(), setFontSize: vi.fn() })
      controller.fontSelectTarget.value = "fira-code"

      controller.onFontChange()
      await flush()

      expect(controller.fontValue).toBe("fira-code")
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ editor_font: "fira-code" })
    })

    it("font size change applies live and PATCHes editor_font_size", async () => {
      controller.getCodemirrorController = () => ({ setFontFamily: vi.fn(), setFontSize: vi.fn() })
      controller.fontSizeSelectTarget.value = "16"

      controller.onFontSizeChange()
      await flush()

      expect(controller.fontSizeValue).toBe(16)
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ editor_font_size: 16 })
    })

    it("width input applies live and PATCHes editor_width", async () => {
      controller.widthInputTarget.value = "96"

      controller.onWidthInput()
      await flush()

      expect(controller.editorWidthValue).toBe(96)
      expect(document.documentElement.style.getPropertyValue("--editor-width")).toBe("96ch")
      expect(controller.widthLabelTarget.textContent).toBe("96ch")
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ editor_width: 96 })
    })

    it("line numbers change applies live and PATCHes editor_line_numbers", async () => {
      controller.getCodemirrorController = () => ({ setLineNumberMode: vi.fn() })
      controller.lineNumbersSelectTarget.value = "2"

      controller.onLineNumbersChange()
      await flush()

      expect(controller.lineNumbersValue).toBe(2)
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ editor_line_numbers: 2 })
    })

    it("cursor recenter toggle applies live and PATCHes cursor_recenter_on_click", async () => {
      const setCursorRecenterOnClick = vi.fn()
      controller.getCodemirrorController = () => ({ setCursorRecenterOnClick })
      controller._codemirrorReady = true

      controller.toggleCursorRecenterOnClick()
      await flush()

      expect(controller.cursorRecenterOnClickValue).toBe(true)
      expect(setCursorRecenterOnClick).toHaveBeenCalledWith(true)
      expect(controller.cursorRecenterOnClickToggleTarget.getAttribute("aria-pressed")).toBe("true")
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ cursor_recenter_on_click: true })
    })

    it("indent change PATCHes editor_indent", async () => {
      controller.indentSelectTarget.value = "4"

      controller.onIndentChange()
      await flush()

      expect(controller.indentValue).toBe(4)
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ editor_indent: 4 })
    })

    it("zoom change applies live and PATCHes preview_zoom", async () => {
      const mockPreview = { zoomValue: 100 }
      controller.getPreviewController = () => mockPreview
      controller._previewReady = true
      controller.zoomSelectTarget.value = "150"

      controller.onZoomChange()
      await flush()

      expect(mockPreview.zoomValue).toBe(150)
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ preview_zoom: 150 })
    })

    it("view mode change applies live and PATCHes view_mode", async () => {
      const app = { setViewMode: vi.fn() }
      controller.getAppController = () => app
      const singleButton = controller.viewModeButtonTargets.find(b => b.dataset.viewMode === "single")

      controller.onViewModeChange({ currentTarget: singleButton })
      await flush()

      expect(controller.viewModeValue).toBe("single")
      expect(app.setViewMode).toHaveBeenCalledWith("single")
      vi.advanceTimersByTime(600)
      expect(patchCall()).toEqual({ view_mode: "single" })
    })

    it("view mode segmented buttons sync their aria-pressed state", () => {
      controller.viewModeValue = "single"
      controller.syncViewModeButtons()

      const split = controller.viewModeButtonTargets.find(b => b.dataset.viewMode === "split")
      const single = controller.viewModeButtonTargets.find(b => b.dataset.viewMode === "single")
      expect(split.getAttribute("aria-pressed")).toBe("false")
      expect(single.getAttribute("aria-pressed")).toBe("true")

      controller.viewModeValue = "split"
      controller.syncViewModeButtons()
      expect(split.getAttribute("aria-pressed")).toBe("true")
      expect(single.getAttribute("aria-pressed")).toBe("false")
    })

    it("unknown view_mode values fall back to split", () => {
      controller.viewModeValue = "garbage"

      expect(controller.viewMode).toBe("split")
    })

    it("announces successful saves via frankmd:config-file-modified", async () => {
      const handler = vi.fn()
      window.addEventListener("frankmd:config-file-modified", handler)

      controller.indentSelectTarget.value = "4"
      controller.onIndentChange()
      vi.advanceTimersByTime(600)
      await vi.advanceTimersByTimeAsync(0)

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("reload()", () => {
    it("re-syncs values from GET /config and updates the controls", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          settings: {
            editor_font: "fira-code",
            editor_font_size: 18,
            editor_width: 120,
            editor_line_numbers: 2,
            editor_indent: 4,
            preview_zoom: 150,
            vim_mode: true,
            typewriter_mode: true,
            cursor_recenter_on_click: true,
            scroll_sync: false,
            theme: "nord",
            view_mode: "single"
          }
        })
      })

      await controller.reload()

      expect(controller.fontValue).toBe("fira-code")
      expect(controller.fontSizeValue).toBe(18)
      expect(controller.editorWidthValue).toBe(120)
      expect(controller.lineNumbersValue).toBe(2)
      expect(controller.indentValue).toBe(4)
      expect(controller.previewZoomValue).toBe(150)
      expect(controller.vimModeValue).toBe(true)
      expect(controller.typewriterModeValue).toBe(true)
      expect(controller.cursorRecenterOnClickValue).toBe(true)
      expect(controller.cursorRecenterOnClickToggleTarget.getAttribute("aria-pressed")).toBe("true")
      expect(controller.scrollSyncValue).toBe(false)
      expect(controller.themeValue).toBe("nord")
      expect(controller.viewModeValue).toBe("single")

      expect(controller.fontSelectTarget.value).toBe("fira-code")
      expect(controller.fontSizeSelectTarget.value).toBe("18")
      expect(controller.widthInputTarget.value).toBe("120")
      expect(controller.widthLabelTarget.textContent).toBe("120ch")
      expect(controller.lineNumbersSelectTarget.value).toBe("2")
      expect(controller.indentSelectTarget.value).toBe("4")
      expect(controller.zoomSelectTarget.value).toBe("150")
      expect(controller.viewModeButtonTargets.find(b => b.dataset.viewMode === "single").getAttribute("aria-pressed")).toBe("true")
    })

    it("normalizes an unknown view_mode to split on reload", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ settings: { view_mode: "diagonal" } })
      })

      await controller.reload()

      expect(controller.viewModeValue).toBe("split")
    })

    it("treats a missing scroll_sync as unchanged (stays enabled)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ settings: { editor_font: "fira-code" } })
      })

      await controller.reload()

      expect(controller.scrollSyncValue).toBe(true)
    })

    it("swallows fetch failures", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("offline"))

      await expect(controller.reload()).resolves.toBeUndefined()
    })
  })

  describe("syncControls()", () => {
    it("falls back to 100% when the persisted zoom is off the level list", () => {
      controller.previewZoomValue = 97
      controller.syncControls()

      expect(controller.zoomSelectTarget.value).toBe("100")
    })

    it("updates the font preview styling", () => {
      controller.fontValue = "jetbrains-mono"
      controller.fontSizeValue = 20
      controller.syncControls()

      expect(controller.fontPreviewTarget.style.fontFamily).toContain("JetBrains Mono")
      expect(controller.fontPreviewTarget.style.fontSize).toBe("20px")
    })
  })

  describe("onWorkspaceOpen()", () => {
    it("syncs controls so the panel reflects current values", () => {
      controller.fontValue = "fira-code"
      controller.onWorkspaceOpen()

      expect(controller.fontSelectTarget.value).toBe("fira-code")
    })
  })
})

describe("AppController Settings workspace", () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete window.t
  })

  function makeWorkspaceApp() {
    window.t = (key) => key
    const element = document.createElement("div")
    element.innerHTML = `
      <aside data-app-target="sidebar"></aside>
      <main data-app-target="editorPanel"></main>
      <aside data-app-target="previewPanel" class="hidden"></aside>
      <section data-app-target="libraryPanel" class="hidden"></section>
      <section data-app-target="settingsPanel" class="hidden"></section>
      <button data-app-target="libraryToggle" aria-pressed="false"></button>
      <button data-app-target="settingsToggle" aria-pressed="false"></button>
    `
    document.body.replaceChildren(element)
    const app = Object.create(AppController.prototype)
    const settingsPanel = element.querySelector('[data-app-target="settingsPanel"]')
    const settingsController = { onWorkspaceOpen: vi.fn(), navButtonTargets: [document.createElement("button")] }
    const application = {
      getControllerForElementAndIdentifier: vi.fn((candidate, identifier) =>
        candidate === settingsPanel && identifier === "settings" ? settingsController : null
      )
    }
    Object.assign(app, {
      context: { element },
      libraryVisible: false,
      settingsVisible: false,
      previewOutlets: []
    })
    Object.defineProperty(app, "application", { value: application })
    return { app, element, settingsController }
  }

  it("opens Settings hiding the editor without disconnecting it", () => {
    const { app, element } = makeWorkspaceApp()
    const editor = element.querySelector('[data-app-target="editorPanel"]')
    const settings = element.querySelector('[data-app-target="settingsPanel"]')
    const button = element.querySelector('[data-app-target="settingsToggle"]')

    app.toggleSettings()

    expect(editor.classList.contains("hidden")).toBe(true)
    // Hidden, not disconnected: the panel (and the editor it coexists with)
    // stays in the DOM so controller state survives.
    expect(editor.isConnected).toBe(true)
    expect(settings.classList.contains("hidden")).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("true")
  })

  it("round-trips back to the editor restoring focus to the toggle", () => {
    const { app, element } = makeWorkspaceApp()
    const editor = element.querySelector('[data-app-target="editorPanel"]')
    const settings = element.querySelector('[data-app-target="settingsPanel"]')
    const button = element.querySelector('[data-app-target="settingsToggle"]')
    button.focus = vi.fn()

    app.toggleSettings()
    const result = app.toggleSettings()

    expect(result).toBe(false)
    expect(editor.classList.contains("hidden")).toBe(false)
    expect(settings.classList.contains("hidden")).toBe(true)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(button.focus).toHaveBeenCalled()
  })

  it("syncs the workspace controls on open", () => {
    const { app, settingsController } = makeWorkspaceApp()

    app.showSettingsWorkspace()

    expect(settingsController.onWorkspaceOpen).toHaveBeenCalled()
  })

  it("Settings and Library are mutually exclusive panes", () => {
    const { app, element } = makeWorkspaceApp()
    const library = element.querySelector('[data-app-target="libraryPanel"]')
    const settings = element.querySelector('[data-app-target="settingsPanel"]')
    const libraryButton = element.querySelector('[data-app-target="libraryToggle"]')
    const settingsButton = element.querySelector('[data-app-target="settingsToggle"]')

    app.showLibraryWorkspace()
    expect(library.classList.contains("hidden")).toBe(false)

    app.showSettingsWorkspace()
    expect(library.classList.contains("hidden")).toBe(true)
    expect(libraryButton.getAttribute("aria-pressed")).toBe("false")
    expect(settings.classList.contains("hidden")).toBe(false)
    expect(settingsButton.getAttribute("aria-pressed")).toBe("true")

    app.showLibraryWorkspace()
    expect(settings.classList.contains("hidden")).toBe(true)
    expect(settingsButton.getAttribute("aria-pressed")).toBe("false")
    expect(library.classList.contains("hidden")).toBe(false)
  })

  it("inherits the stashed preview state when switching workspaces directly", () => {
    const { app, element } = makeWorkspaceApp()
    const preview = element.querySelector('[data-app-target="previewPanel"]')
    preview.classList.remove("hidden")
    preview.classList.add("flex")

    app.showSettingsWorkspace()
    expect(preview.classList.contains("hidden")).toBe(true)

    // Library inherits Settings' stashed preview state (was visible)
    app.showLibraryWorkspace()
    expect(app._libraryPreviewWasVisible).toBe(true)

    // ...and returning to the editor restores the preview exactly once
    const result = app.showEditorWorkspace()
    expect(result).toBe(true)
    expect(preview.classList.contains("hidden")).toBe(false)
    expect(app._libraryPreviewWasVisible).toBeNull()
    expect(app._settingsPreviewWasVisible).toBeNull()
  })

  it("note selection returns to the editor from Settings", () => {
    const { app, element } = makeWorkspaceApp()
    const editor = element.querySelector('[data-app-target="editorPanel"]')
    const settings = element.querySelector('[data-app-target="settingsPanel"]')

    app.showSettingsWorkspace()
    Object.assign(app, {
      prepareEditorTransition: vi.fn(() => true),
      isCurrentNavigation: vi.fn(() => true),
      updatePathDisplay: vi.fn(),
      expandParentFolders: vi.fn(),
      showEditor: vi.fn(),
      refreshTree: vi.fn(),
      updateUrl: vi.fn()
    })

    app.applyLoadedFile("folder/selected.md", "note body", "revision", 1)

    expect(app.currentFile).toBe("folder/selected.md")
    expect(editor.classList.contains("hidden")).toBe(false)
    expect(settings.classList.contains("hidden")).toBe(true)
  })

  it("keeps the vim/scroll-sync switch aria state in sync via app toggle helpers", () => {
    const { app, element } = makeWorkspaceApp()
    const vimSwitch = document.createElement("button")
    vimSwitch.dataset.appTarget = "vimToggle"
    const scrollSwitch = document.createElement("button")
    scrollSwitch.dataset.appTarget = "scrollSyncToggle"
    const typewriterSwitch = document.createElement("button")
    typewriterSwitch.dataset.appTarget = "typewriterToggle"
    element.append(vimSwitch, scrollSwitch, typewriterSwitch)

    // Shadow the Stimulus target accessors: the stub app has no live Scope,
    // so point the has* guards at the switches that exist in this fixture.
    const shim = (name, target) => Object.defineProperty(app, name, { value: target, configurable: true })
    shim("hasVimToggleTarget", vimSwitch)
    shim("hasScrollSyncToggleTarget", scrollSwitch)
    shim("hasTypewriterToggleTarget", typewriterSwitch)
    shim("vimToggleTarget", vimSwitch)
    shim("scrollSyncToggleTarget", scrollSwitch)
    shim("typewriterToggleTarget", typewriterSwitch)

    app.updateVimToggleButton(true)
    expect(vimSwitch.getAttribute("aria-pressed")).toBe("true")

    app.updateVimToggleButton(false)
    expect(vimSwitch.getAttribute("aria-pressed")).toBe("false")

    app.updateScrollSyncToggleButton(true)
    expect(scrollSwitch.getAttribute("aria-pressed")).toBe("true")

    app.updateTypewriterToggleButton(true)
    expect(typewriterSwitch.getAttribute("aria-pressed")).toBe("true")
  })
})
