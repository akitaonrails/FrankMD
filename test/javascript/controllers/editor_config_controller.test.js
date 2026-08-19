import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { setupJsdomGlobals } from "../helpers/jsdom_globals.js"
import EditorConfigController from "../../../app/javascript/controllers/editor_config_controller.js"

describe("EditorConfigController", () => {
  let application
  let controller

  beforeEach(() => {
    setupJsdomGlobals()

    // Mock fetch for reload()
    global.fetch = vi.fn().mockResolvedValue({ ok: true })

    document.body.innerHTML = `
      <div id="editor-config"
           data-controller="editor-config"
           data-editor-config-font-value="cascadia-code"
           data-editor-config-font-size-value="14"
           data-editor-config-editor-width-value="72"
           data-editor-config-preview-zoom-value="100"
           data-editor-config-line-numbers-value="0"
           data-editor-config-theme-value=""
           data-editor-config-codemirror-outlet='[data-controller~="mock-codemirror"]'
           data-editor-config-preview-outlet='[data-controller~="mock-preview"]'>
      </div>
      <div data-controller="mock-codemirror" data-mock-codemirror-content-value="">
        <div data-mock-codemirror-target="container"></div>
        <textarea data-mock-codemirror-target="hidden"></textarea>
      </div>
      <div data-controller="mock-preview" data-mock-preview-zoom-value="100"></div>
    `

    application = Application.start()
    application.register("editor-config", EditorConfigController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(
          document.getElementById("editor-config"), "editor-config"
        )
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("static editorFonts", () => {
    it("has cascadia-code as first font", () => {
      expect(EditorConfigController.editorFonts[0].id).toBe("cascadia-code")
    })

    it("has correct font structure", () => {
      EditorConfigController.editorFonts.forEach(font => {
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
      expect(controller._codemirrorReady).toBe(false)

      const applyFontSpy = vi.spyOn(controller, "applyFont")
      const applyLineNumbersSpy = vi.spyOn(controller, "applyLineNumbers")

      controller.codemirrorOutletConnected()

      expect(controller._codemirrorReady).toBe(true)
      expect(applyFontSpy).toHaveBeenCalled()
      expect(applyLineNumbersSpy).toHaveBeenCalled()
    })

    it("previewOutletConnected sets _previewReady and applies zoom", () => {
      expect(controller._previewReady).toBe(false)

      const applyZoomSpy = vi.spyOn(controller, "applyPreviewZoom")

      controller.previewOutletConnected()

      expect(controller._previewReady).toBe(true)
      expect(applyZoomSpy).toHaveBeenCalled()
    })

    it("previewOutletConnected also applies scroll sync", () => {
      const applyScrollSyncSpy = vi.spyOn(controller, "applyScrollSync")

      controller.previewOutletConnected()

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
      expect(controller.fonts).toBe(EditorConfigController.editorFonts)
    })
  })
})
