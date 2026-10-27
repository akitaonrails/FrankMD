import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { setupJsdomGlobals } from "../helpers/jsdom_globals.js"

// Set up global window before importing LocaleController (which sets window.t at module level)
setupJsdomGlobals()

// Now import the controller (this will set window.t)
const { default: LocaleController } = await import("../../../app/javascript/controllers/locale_controller.js")

describe("LocaleController", () => {
  let application
  let controller
  let element

  beforeEach(() => {
    setupJsdomGlobals()

    // Mock fetch for translations
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        locale: "en",
        translations: {
          test: { key: "Test Value" }
        }
      })
    })

    document.body.innerHTML = `
      <div data-controller="locale" data-locale-initial-value="en">
        <button data-locale-target="button"></button><span data-locale-target="currentLocale"></span>
        <div data-locale-target="menu" class="hidden"></div>
      </div>
    `

    element = document.querySelector('[data-controller="locale"]')
    application = Application.start()
    application.register("locale", LocaleController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "locale")
        controller.buttonTarget.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 100, right: 260 })
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
    delete window.frankmdTranslations
    delete window.frankmdLocale
  })

  describe("static locales", () => {
    it("has English as first locale", () => {
      expect(LocaleController.locales[0].id).toBe("en")
    })

    it("has correct locale structure", () => {
      LocaleController.locales.forEach(locale => {
        expect(locale).toHaveProperty("id")
        expect(locale).toHaveProperty("name")
        expect(locale).toHaveProperty("flag")
      })
    })

    it("includes expected locales", () => {
      const localeIds = LocaleController.locales.map(l => l.id)
      expect(localeIds).toContain("en")
      expect(localeIds).toContain("pt-BR")
      expect(localeIds).toContain("es")
      expect(localeIds).toContain("ja")
    })
  })

  describe("connect()", () => {
    it("loads initial locale from value", () => {
      expect(controller.currentLocaleId).toBe("en")
    })

    it("renders menu with locales", () => {
      const buttons = controller.menuTarget.querySelectorAll("button")
      expect(buttons.length).toBe(LocaleController.locales.length)
    })

    it("calls loadTranslations", () => {
      expect(fetch).toHaveBeenCalledWith("/translations", {
        method: "GET",
        headers: { "Accept": "application/json" }
      })
    })
  })

  describe("loadTranslations()", () => {
    it("sets translations on window", async () => {
      await controller.loadTranslations()
      expect(window.frankmdTranslations).toEqual({ test: { key: "Test Value" } })
    })

    it("sets locale on window", async () => {
      await controller.loadTranslations()
      expect(window.frankmdLocale).toBe("en")
    })

    it("dispatches translations-loaded event", async () => {
      const eventSpy = vi.fn()
      window.addEventListener("frankmd:translations-loaded", eventSpy)

      await controller.loadTranslations()

      expect(eventSpy).toHaveBeenCalled()
      const event = eventSpy.mock.calls[0][0]
      expect(event.detail.locale).toBe("en")
      expect(event.detail.translations).toEqual({ test: { key: "Test Value" } })
    })

    it("handles fetch error gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      await controller.loadTranslations()

      expect(console.warn).toHaveBeenCalled()
    })
  })

  describe("toggle()", () => {
    it("toggles menu visibility", () => {
      const event = { stopPropagation: vi.fn() }

      controller.toggle(event)
      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)

      controller.toggle(event)
      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("stops event propagation", () => {
      const event = { stopPropagation: vi.fn() }
      controller.toggle(event)
      expect(event.stopPropagation).toHaveBeenCalled()
    })
  })

  describe("selectLocale()", () => {
    it("updates current locale", () => {
      vi.spyOn(controller, "saveLocaleConfig").mockResolvedValue(undefined)
      const event = { currentTarget: { dataset: { locale: "ja" } } }
      controller.selectLocale(event)
      expect(controller.currentLocaleId).toBe("ja")
    })

    it("hides menu after selection", () => {
      vi.spyOn(controller, "saveLocaleConfig").mockResolvedValue(undefined)
      controller.menuTarget.classList.remove("hidden")
      const event = { currentTarget: { dataset: { locale: "es" } } }
      controller.selectLocale(event)
      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("updates display immediately after selection", () => {
      vi.spyOn(controller, "saveLocaleConfig").mockResolvedValue(undefined)
      const updateSpy = vi.spyOn(controller, "updateDisplay")
      const renderSpy = vi.spyOn(controller, "renderMenu")
      const event = { currentTarget: { dataset: { locale: "ja" } } }

      controller.selectLocale(event)

      expect(updateSpy).toHaveBeenCalled()
      expect(renderSpy).toHaveBeenCalled()
    })

    it("does nothing if same locale is selected", () => {
      controller.currentLocaleId = "en"
      const saveConfigSpy = vi.spyOn(controller, "saveLocaleConfig")
      const event = { currentTarget: { dataset: { locale: "en" } } }

      controller.selectLocale(event)

      expect(saveConfigSpy).not.toHaveBeenCalled()
    })
  })

  describe("updateDisplay()", () => {
    it("updates current locale text", () => {
      controller.currentLocaleId = "ja"
      controller.updateDisplay()
      expect(controller.currentLocaleTarget.textContent).toBe("日本語")
    })

    it("shows checkmark for current locale", () => {
      controller.currentLocaleId = "es"
      controller.renderMenu()
      controller.updateDisplay()

      const esButton = controller.menuTarget.querySelector('[data-locale="es"]')
      const checkmark = esButton.querySelector(".checkmark")
      expect(checkmark.classList.contains("opacity-0")).toBe(false)

      const enButton = controller.menuTarget.querySelector('[data-locale="en"]')
      const enCheckmark = enButton.querySelector(".checkmark")
      expect(enCheckmark.classList.contains("opacity-0")).toBe(true)
    })

    it("defaults to English if locale not found", () => {
      controller.currentLocaleId = "unknown"
      controller.updateDisplay()
      expect(controller.currentLocaleTarget.textContent).toBe("English")
    })
  })

  describe("renderMenu()", () => {
    it("creates buttons for all locales", () => {
      controller.renderMenu()
      const buttons = controller.menuTarget.querySelectorAll("button")
      expect(buttons.length).toBe(LocaleController.locales.length)
    })

    it("sets data-locale attribute on buttons", () => {
      controller.renderMenu()
      const buttons = controller.menuTarget.querySelectorAll("button")
      buttons.forEach((button, index) => {
        expect(button.dataset.locale).toBe(LocaleController.locales[index].id)
      })
    })

    it("includes flag emojis", () => {
      controller.renderMenu()
      const html = controller.menuTarget.innerHTML
      expect(html).toContain("🇺🇸")
      expect(html).toContain("🇧🇷")
      expect(html).toContain("🇯🇵")
    })
  })

  describe("getFlag()", () => {
    it("returns US flag for us code", () => {
      expect(controller.getFlag("us")).toContain("🇺🇸")
    })

    it("returns Brazil flag for br code", () => {
      expect(controller.getFlag("br")).toContain("🇧🇷")
    })

    it("returns empty string for unknown code", () => {
      expect(controller.getFlag("unknown")).toBe("")
    })
  })

  describe("saveLocaleConfig()", () => {
    it("calls fetch with correct parameters and reloads", async () => {
      fetch.mockClear()
      fetch.mockResolvedValue({ ok: true })
      const reloadSpy = vi.spyOn(controller, "reloadPage").mockImplementation(() => {})

      await controller.saveLocaleConfig("ja")

      expect(fetch).toHaveBeenCalledWith("/config", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ locale: "ja" })
      })
      expect(reloadSpy).toHaveBeenCalled()
    })

    it("reloads even when save fails", async () => {
      fetch.mockClear()
      fetch.mockRejectedValue(new Error("Network error"))
      const reloadSpy = vi.spyOn(controller, "reloadPage").mockImplementation(() => {})

      await controller.saveLocaleConfig("ja")

      expect(reloadSpy).toHaveBeenCalled()
    })
  })

  describe("config listener", () => {
    it("updates locale when config-changed event is dispatched", () => {
      const loadTranslationsSpy = vi.spyOn(controller, "loadTranslations")

      window.dispatchEvent(new CustomEvent("frankmd:config-changed", {
        detail: { locale: "ja" }
      }))

      expect(controller.currentLocaleId).toBe("ja")
      expect(loadTranslationsSpy).toHaveBeenCalled()
    })

    it("ignores event if locale is same as current", () => {
      const loadTranslationsSpy = vi.spyOn(controller, "loadTranslations")
      loadTranslationsSpy.mockClear()
      controller.currentLocaleId = "en"

      window.dispatchEvent(new CustomEvent("frankmd:config-changed", {
        detail: { locale: "en" }
      }))

      expect(loadTranslationsSpy).not.toHaveBeenCalled()
    })
  })

  describe("click outside", () => {
    it("closes menu when clicking outside", () => {
      controller.menuTarget.classList.remove("hidden")

      const outsideElement = document.createElement("div")
      document.body.appendChild(outsideElement)

      document.dispatchEvent(new window.MouseEvent("click", {
        bubbles: true,
        target: outsideElement
      }))

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("disconnect()", () => {
    it("removes event listeners", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")
      const disconnectDropdownSpy = vi.spyOn(controller.dropdown, "disconnect")

      controller.disconnect()

      expect(removeEventListenerSpy).toHaveBeenCalledWith("frankmd:config-changed", controller.boundConfigListener)
      expect(disconnectDropdownSpy).toHaveBeenCalled()
    })
  })
})

describe("window.t() translation helper", () => {
  beforeEach(() => {
    setupJsdomGlobals()

    // Re-define window.t for this test suite (it was defined at module load)
    window.t = function(key, options = {}) {
      const translations = window.frankmdTranslations || {}
      const keys = key.split(".")
      let value = translations

      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = value[k]
        } else {
          return key
        }
      }

      if (typeof value !== "string") {
        return key
      }

      return value.replace(/%\{(\w+)\}/g, (match, placeholder) => {
        return options[placeholder] !== undefined ? options[placeholder] : match
      })
    }
  })

  afterEach(() => {
    delete window.frankmdTranslations
  })

  it("returns key when translations not loaded", () => {
    window.frankmdTranslations = undefined
    expect(window.t("test.key")).toBe("test.key")
  })

  it("returns value for simple key", () => {
    window.frankmdTranslations = { simple: "Simple Value" }
    expect(window.t("simple")).toBe("Simple Value")
  })

  it("returns value for nested key", () => {
    window.frankmdTranslations = {
      level1: {
        level2: {
          level3: "Deep Value"
        }
      }
    }
    expect(window.t("level1.level2.level3")).toBe("Deep Value")
  })

  it("returns key when path not found", () => {
    window.frankmdTranslations = { other: "value" }
    expect(window.t("missing.path")).toBe("missing.path")
  })

  it("interpolates placeholders", () => {
    window.frankmdTranslations = {
      greeting: "Hello %{name}, you have %{count} messages"
    }
    expect(window.t("greeting", { name: "John", count: 5 }))
      .toBe("Hello John, you have 5 messages")
  })

  it("leaves placeholder when option not provided", () => {
    window.frankmdTranslations = {
      greeting: "Hello %{name}"
    }
    expect(window.t("greeting", {})).toBe("Hello %{name}")
  })

  it("returns key when value is not a string", () => {
    window.frankmdTranslations = {
      object: { nested: "value" }
    }
    expect(window.t("object")).toBe("object")
  })
})
