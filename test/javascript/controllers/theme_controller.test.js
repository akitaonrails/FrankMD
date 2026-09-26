import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { setupJsdomGlobals } from "../helpers/jsdom_globals.js"
import ThemeController from "../../../app/javascript/controllers/theme_controller.js"

describe("ThemeController", () => {
  let application
  let controller
  let element

  beforeEach(() => {
    setupJsdomGlobals()

    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))

    // Mock fetch - return 404 for omarchy_theme (not installed) by default
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === "string" && url.includes("omarchy_theme")) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    document.body.innerHTML = `
      <div data-controller="theme" data-theme-initial-value="dark">
        <span data-theme-target="currentTheme"></span>
        <div data-theme-target="menu" class="hidden"></div>
      </div>
    `

    element = document.querySelector('[data-controller="theme"]')
    application = Application.start()
    application.register("theme", ThemeController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "theme")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("static themes", () => {
    it("has Light and Dark as first two themes", () => {
      expect(ThemeController.themes[0].id).toBe("light")
      expect(ThemeController.themes[1].id).toBe("dark")
    })

    it("has correct theme structure", () => {
      ThemeController.themes.forEach(theme => {
        expect(theme).toHaveProperty("id")
        expect(theme).toHaveProperty("name")
        expect(theme).toHaveProperty("icon")
      })
    })
  })

  describe("connect()", () => {
    it("loads initial theme from value", () => {
      expect(controller.currentThemeId).toBe("dark")
    })

    it("applies theme to document", () => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    })

    it("renders menu with themes", () => {
      const buttons = controller.menuTarget.querySelectorAll("button")
      expect(buttons.length).toBe(controller.runtimeThemes.length)
    })

    it("updates current theme display", () => {
      expect(controller.currentThemeTarget.textContent).toBe("Dark")
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

  describe("selectTheme()", () => {
    it("updates current theme", () => {
      const event = { currentTarget: { dataset: { theme: "nord" } } }
      controller.selectTheme(event)
      expect(controller.currentThemeId).toBe("nord")
    })

    it("applies theme to document", () => {
      const event = { currentTarget: { dataset: { theme: "gruvbox" } } }
      controller.selectTheme(event)
      expect(document.documentElement.getAttribute("data-theme")).toBe("gruvbox")
    })

    it("hides menu after selection", () => {
      controller.menuTarget.classList.remove("hidden")
      const event = { currentTarget: { dataset: { theme: "nord" } } }
      controller.selectTheme(event)
      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("applyTheme()", () => {
    it("sets data-theme attribute on html element", () => {
      controller.currentThemeId = "tokyo-night"
      controller.applyTheme()
      expect(document.documentElement.getAttribute("data-theme")).toBe("tokyo-night")
    })

    it("adds dark class for dark themes", () => {
      controller.currentThemeId = "dark"
      controller.applyTheme()
      expect(document.documentElement.classList.contains("dark")).toBe(true)
    })

    it("removes dark class for light themes", () => {
      document.documentElement.classList.add("dark")
      controller.currentThemeId = "light"
      controller.applyTheme()
      expect(document.documentElement.classList.contains("dark")).toBe(false)
    })

    it("removes dark class for solarized-light", () => {
      document.documentElement.classList.add("dark")
      controller.currentThemeId = "solarized-light"
      controller.applyTheme()
      expect(document.documentElement.classList.contains("dark")).toBe(false)
    })

    it("removes dark class for catppuccin-latte", () => {
      document.documentElement.classList.add("dark")
      controller.currentThemeId = "catppuccin-latte"
      controller.applyTheme()
      expect(document.documentElement.classList.contains("dark")).toBe(false)
    })

    it("removes dark class for flexoki-light", () => {
      document.documentElement.classList.add("dark")
      controller.currentThemeId = "flexoki-light"
      controller.applyTheme()
      expect(document.documentElement.classList.contains("dark")).toBe(false)
    })

    it("falls back to system preference when no theme set", () => {
      controller.currentThemeId = null
      controller.applyTheme()
      // matchMedia mocked to return dark preference
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    })

    it("updates checkmarks in menu", () => {
      controller.currentThemeId = "nord"
      controller.renderMenu()
      controller.applyTheme()

      const nordButton = controller.menuTarget.querySelector('[data-theme="nord"]')
      const checkmark = nordButton.querySelector(".checkmark")
      expect(checkmark.classList.contains("opacity-0")).toBe(false)

      const lightButton = controller.menuTarget.querySelector('[data-theme="light"]')
      const lightCheckmark = lightButton.querySelector(".checkmark")
      expect(lightCheckmark.classList.contains("opacity-0")).toBe(true)
    })
  })

  describe("renderMenu()", () => {
    it("creates buttons for all themes", () => {
      controller.renderMenu()
      const buttons = controller.menuTarget.querySelectorAll("button")
      expect(buttons.length).toBe(controller.runtimeThemes.length)
    })

    it("sets data-theme attribute on buttons", () => {
      controller.renderMenu()
      const buttons = controller.menuTarget.querySelectorAll("button")
      buttons.forEach((button, index) => {
        expect(button.dataset.theme).toBe(controller.runtimeThemes[index].id)
      })
    })

    it("shows checkmark for current theme", () => {
      controller.currentThemeId = "dark"
      controller.renderMenu()
      const darkButton = controller.menuTarget.querySelector('[data-theme="dark"]')
      const checkmark = darkButton.querySelector(".checkmark")
      expect(checkmark.classList.contains("opacity-0")).toBe(false)
    })
  })

  describe("getIcon()", () => {
    it("returns sun icon for sun type", () => {
      const icon = controller.getIcon("sun")
      expect(icon).toContain("svg")
      expect(icon).toContain("12 3v1")
    })

    it("returns moon icon for moon type", () => {
      const icon = controller.getIcon("moon")
      expect(icon).toContain("svg")
      expect(icon).toContain("20.354")
    })

    it("returns palette icon for palette type", () => {
      const icon = controller.getIcon("palette")
      expect(icon).toContain("svg")
      expect(icon).toContain("7 21a4")
    })

    it("returns palette icon for unknown type", () => {
      const icon = controller.getIcon("unknown")
      expect(icon).toContain("7 21a4")
    })
  })

  describe("saveThemeConfig()", () => {
    it("calls fetch with correct parameters", async () => {
      vi.useFakeTimers()

      try {
        controller.saveThemeConfig("nord")

        vi.advanceTimersByTime(500)
        await vi.runAllTimersAsync()

        expect(fetch).toHaveBeenCalledWith("/config", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({ theme: "nord" })
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it("debounces multiple calls", async () => {
      vi.useFakeTimers()

      try {
        // Clear any prior fetch calls (e.g. omarchy availability check)
        fetch.mockClear()

        controller.saveThemeConfig("nord")
        controller.saveThemeConfig("gruvbox")
        controller.saveThemeConfig("tokyo-night")

        vi.advanceTimersByTime(500)
        await vi.runAllTimersAsync()

        const themeConfigRequests = fetch.mock.calls.filter(([url, options]) =>
          url === "/config" && options?.method === "PATCH"
        )

        expect(themeConfigRequests).toHaveLength(1)
        expect(themeConfigRequests[0][1]).toEqual(expect.objectContaining({
          body: JSON.stringify({ theme: "tokyo-night" })
        }))
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("config listener", () => {
    it("updates theme when config-changed event is dispatched", () => {
      window.dispatchEvent(new CustomEvent("frankmd:config-changed", {
        detail: { theme: "nord" }
      }))

      expect(controller.currentThemeId).toBe("nord")
      expect(document.documentElement.getAttribute("data-theme")).toBe("nord")
    })

    it("ignores event if theme is same as current", () => {
      const renderMenuSpy = vi.spyOn(controller, "renderMenu")
      controller.currentThemeId = "dark"

      window.dispatchEvent(new CustomEvent("frankmd:config-changed", {
        detail: { theme: "dark" }
      }))

      expect(renderMenuSpy).not.toHaveBeenCalled()
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
      const docRemoveEventListenerSpy = vi.spyOn(document, "removeEventListener")

      controller.disconnect()

      expect(removeEventListenerSpy).toHaveBeenCalledWith("frankmd:config-changed", controller.boundConfigListener)
      expect(docRemoveEventListenerSpy).toHaveBeenCalledWith("click", controller.boundClickOutside)
    })

    it("clears pending timeout", () => {
      vi.useFakeTimers()
      controller.saveThemeConfig("nord")
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")

      controller.disconnect()

      expect(clearTimeoutSpy).toHaveBeenCalled()
      vi.useRealTimers()
    })
  })
})

describe("ThemeController with system dark preference", () => {
  let application
  let controller
  let element

  beforeEach(() => {
    setupJsdomGlobals()

    // Mock matchMedia to prefer light
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false, // prefers light
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))

    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === "string" && url.includes("omarchy_theme")) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    document.body.innerHTML = `
      <div data-controller="theme">
        <span data-theme-target="currentTheme"></span>
        <div data-theme-target="menu" class="hidden"></div>
      </div>
    `

    element = document.querySelector('[data-controller="theme"]')
    application = Application.start()
    application.register("theme", ThemeController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "theme")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  it("falls back to light theme when no initial value and system prefers light", () => {
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
  })
})

describe("ThemeController with Omarchy available", () => {
  let application
  let controller
  let element

  const omarchyThemeData = {
    theme_name: "purplewave",
    variables: {
      "--theme-bg-primary": "#1a1a2e",
      "--theme-text-primary": "#e0e0e0",
      "--theme-accent": "#7ea7c9"
    },
    is_dark: true
  }

  beforeEach(() => {
    setupJsdomGlobals()

    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))

    // Mock fetch - return omarchy theme data for omarchy_theme endpoint
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === "string" && url.includes("omarchy_theme")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(omarchyThemeData)
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    document.body.innerHTML = `
      <div data-controller="theme" data-theme-initial-value="dark">
        <span data-theme-target="currentTheme"></span>
        <div data-theme-target="menu" class="hidden"></div>
      </div>
    `

    element = document.querySelector('[data-controller="theme"]')
    application = Application.start()
    application.register("theme", ThemeController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "theme")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    controller.stopOmarchyPolling()
    application.stop()
    vi.restoreAllMocks()
  })

  it("adds Omarchy to runtimeThemes when available", () => {
    const omarchy = controller.runtimeThemes.find(t => t.id === "omarchy")
    expect(omarchy).toBeDefined()
    expect(omarchy.name).toBe("Omarchy")
    expect(omarchy.icon).toBe("sync")
  })

  it("includes Omarchy in rendered menu", () => {
    const buttons = controller.menuTarget.querySelectorAll("button")
    expect(buttons.length).toBe(ThemeController.themes.length + 1)
    const omarchyButton = controller.menuTarget.querySelector('[data-theme="omarchy"]')
    expect(omarchyButton).not.toBeNull()
  })

  it("returns sync icon for sync type", () => {
    const icon = controller.getIcon("sync")
    expect(icon).toContain("svg")
    expect(icon).toContain("4 4v5h")
  })

  it("applies omarchy theme with injected CSS variables", async () => {
    controller.currentThemeId = "omarchy"
    await controller.applyOmarchyTheme()

    expect(document.documentElement.getAttribute("data-theme")).toBe("omarchy")
    const styleEl = document.getElementById("omarchy-theme-vars")
    expect(styleEl).not.toBeNull()
    expect(styleEl.textContent).toContain("--theme-bg-primary: #1a1a2e")
  })

  it("sets dark class based on omarchy theme luminance", async () => {
    controller.currentThemeId = "omarchy"
    await controller.applyOmarchyTheme()

    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("removes omarchy styles when switching to another theme", async () => {
    controller.currentThemeId = "omarchy"
    await controller.applyOmarchyTheme()
    expect(document.getElementById("omarchy-theme-vars")).not.toBeNull()

    controller.currentThemeId = "dark"
    controller.applyTheme()
    expect(document.getElementById("omarchy-theme-vars")).toBeNull()
  })

  it("stops polling on disconnect", async () => {
    controller.currentThemeId = "omarchy"
    await controller.applyOmarchyTheme()
    expect(controller.omarchyPollingInterval).not.toBeNull()

    controller.disconnect()
    expect(controller.omarchyPollingInterval).toBeNull()
  })

  it("falls back to dark when omarchy endpoint disappears", async () => {
    // First apply omarchy successfully
    controller.currentThemeId = "omarchy"
    await controller.applyOmarchyTheme()
    expect(document.documentElement.getAttribute("data-theme")).toBe("omarchy")

    // Now make omarchy unavailable
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    })

    await controller.applyOmarchyTheme()
    expect(controller.currentThemeId).toBe("dark")
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })
})
