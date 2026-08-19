import { Controller } from "@hotwired/stimulus"
import { get, patch } from "@rails/request.js"
import { toggleMenu } from "lib/menu_bounds"

export default class extends Controller {
  static targets = ["menu", "currentTheme"]
  static values = { initial: String }

  // Built-in themes - Light and Dark first, then alphabetical
  static themes = [
    { id: "light", name: "Light", icon: "sun" },
    { id: "dark", name: "Dark", icon: "moon" },
    { id: "catppuccin", name: "Catppuccin", icon: "palette" },
    { id: "catppuccin-latte", name: "Catppuccin Latte", icon: "palette" },
    { id: "ethereal", name: "Ethereal", icon: "palette" },
    { id: "everforest", name: "Everforest", icon: "palette" },
    { id: "flexoki-light", name: "Flexoki Light", icon: "palette" },
    { id: "gruvbox", name: "Gruvbox", icon: "palette" },
    { id: "hackerman", name: "Hackerman", icon: "palette" },
    { id: "kanagawa", name: "Kanagawa", icon: "palette" },
    { id: "matte-black", name: "Matte Black", icon: "palette" },
    { id: "nord", name: "Nord", icon: "palette" },
    { id: "osaka-jade", name: "Osaka Jade", icon: "palette" },
    { id: "ristretto", name: "Ristretto", icon: "palette" },
    { id: "rose-pine", name: "Rose Pine", icon: "palette" },
    { id: "solarized-dark", name: "Solarized Dark", icon: "palette" },
    { id: "solarized-light", name: "Solarized Light", icon: "palette" },
    { id: "tokyo-night", name: "Tokyo Night", icon: "palette" }
  ]

  // Light themes for Tailwind dark: toggle
  static lightThemes = ["light", "solarized-light", "catppuccin-latte", "rose-pine", "flexoki-light"]

  connect() {
    // Load initial theme from server config
    this.currentThemeId = this.hasInitialValue && this.initialValue ? this.initialValue : null
    this.omarchyThemeName = null
    this.omarchyPollingInterval = null
    this.omarchyAvailable = false

    // Build runtime themes list (copy of static)
    this.runtimeThemes = [...this.constructor.themes]

    // Check omarchy availability, then apply theme and render
    this.checkOmarchyAvailability().then(() => {
      this.applyTheme()
      this.renderMenu()
    })

    this.setupClickOutside()
    this.setupConfigListener()
  }

  disconnect() {
    if (this.boundConfigListener) {
      window.removeEventListener("frankmd:config-changed", this.boundConfigListener)
    }
    if (this.boundClickOutside) {
      document.removeEventListener("click", this.boundClickOutside)
    }
    if (this.configSaveTimeout) {
      clearTimeout(this.configSaveTimeout)
    }
    this.stopOmarchyPolling()
  }

  // Listen for config changes (when .fed file is edited)
  setupConfigListener() {
    this.boundConfigListener = (event) => {
      const { theme } = event.detail
      if (theme && theme !== this.currentThemeId) {
        this.currentThemeId = theme
        this.applyTheme()
        this.renderMenu()
      }
    }
    window.addEventListener("frankmd:config-changed", this.boundConfigListener)
  }

  toggle(event) {
    event.stopPropagation()
    toggleMenu(this.menuTarget)
  }

  selectTheme(event) {
    const themeId = event.currentTarget.dataset.theme
    this.currentThemeId = themeId
    this.saveThemeConfig(themeId)
    this.applyTheme()
    this.menuTarget.classList.add("hidden")
  }

  // Save theme to server config (debounced)
  saveThemeConfig(themeId) {
    if (this.configSaveTimeout) {
      clearTimeout(this.configSaveTimeout)
    }

    this.configSaveTimeout = setTimeout(async () => {
      try {
        const response = await patch("/config", {
          body: { theme: themeId },
          responseKind: "json"
        })

        if (!response.ok) {
          console.warn("Failed to save theme config:", await response.text)
        } else {
          // Notify other controllers that config file was modified
          window.dispatchEvent(new CustomEvent("frankmd:config-file-modified"))
        }
      } catch (error) {
        console.warn("Failed to save theme config:", error)
      }
    }, 500)
  }

  applyTheme() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const themeId = this.currentThemeId || (prefersDark ? "dark" : "light")

    if (themeId === "omarchy") {
      this.applyOmarchyTheme()
      return
    }

    // Switching away from omarchy - clean up
    this.stopOmarchyPolling()
    this.removeOmarchyStyles()

    // Set data-theme attribute on html element
    document.documentElement.setAttribute("data-theme", themeId)

    // Also set dark class for Tailwind dark: variants
    const isDarkTheme = !this.constructor.lightThemes.includes(themeId)
    document.documentElement.classList.toggle("dark", isDarkTheme)

    this.updateCurrentThemeDisplay(themeId)
    this.updateMenuCheckmarks(themeId)
  }

  async applyOmarchyTheme() {
    try {
      const response = await get("/config/omarchy_theme", { responseKind: "json" })

      if (!response.ok) {
        // Omarchy no longer available - fall back to dark
        this.currentThemeId = "dark"
        this.saveThemeConfig("dark")
        this.applyTheme()
        this.renderMenu()
        return
      }

      const data = await response.json
      this.omarchyThemeName = data.theme_name
      this.injectOmarchyStyles(data.variables)

      // Set data-theme so CSS selectors work
      document.documentElement.setAttribute("data-theme", "omarchy")

      // Toggle dark class based on omarchy theme luminance
      document.documentElement.classList.toggle("dark", data.is_dark)

      this.updateCurrentThemeDisplay("omarchy")
      this.updateMenuCheckmarks("omarchy")

      // Start polling for theme changes
      this.startOmarchyPolling()
    } catch (error) {
      console.warn("Failed to apply Omarchy theme:", error)
      this.currentThemeId = "dark"
      this.saveThemeConfig("dark")
      this.applyTheme()
      this.renderMenu()
    }
  }

  injectOmarchyStyles(variables) {
    let styleEl = document.getElementById("omarchy-theme-vars")
    if (!styleEl) {
      styleEl = document.createElement("style")
      styleEl.id = "omarchy-theme-vars"
      document.head.appendChild(styleEl)
    }

    const cssVars = Object.entries(variables)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join("\n")

    styleEl.textContent = `[data-theme="omarchy"] {\n${cssVars}\n}`
  }

  removeOmarchyStyles() {
    const styleEl = document.getElementById("omarchy-theme-vars")
    if (styleEl) {
      styleEl.remove()
    }
  }

  startOmarchyPolling() {
    if (this.omarchyPollingInterval) return

    this.omarchyPollingInterval = setInterval(async () => {
      try {
        const response = await get("/config/omarchy_theme", { responseKind: "json" })

        if (!response.ok) {
          // Omarchy was removed - fall back
          this.stopOmarchyPolling()
          this.currentThemeId = "dark"
          this.saveThemeConfig("dark")
          this.applyTheme()
          this.renderMenu()
          return
        }

        const data = await response.json
        if (data.theme_name !== this.omarchyThemeName) {
          this.omarchyThemeName = data.theme_name
          this.injectOmarchyStyles(data.variables)
          document.documentElement.classList.toggle("dark", data.is_dark)
        }
      } catch (error) {
        // Silently ignore polling errors
      }
    }, 3000)
  }

  stopOmarchyPolling() {
    if (this.omarchyPollingInterval) {
      clearInterval(this.omarchyPollingInterval)
      this.omarchyPollingInterval = null
    }
    this.omarchyThemeName = null
  }

  async checkOmarchyAvailability() {
    try {
      const response = await get("/config/omarchy_theme", { responseKind: "json" })
      if (response.ok) {
        this.omarchyAvailable = true
        this.runtimeThemes.push({ id: "omarchy", name: "Omarchy", icon: "sync" })
      }
    } catch (error) {
      // Omarchy not available
    }
  }

  updateCurrentThemeDisplay(themeId) {
    if (this.hasCurrentThemeTarget) {
      const theme = this.runtimeThemes.find(t => t.id === themeId)
      this.currentThemeTarget.textContent = theme ? theme.name : "Light"
    }
  }

  updateMenuCheckmarks(themeId) {
    if (this.hasMenuTarget) {
      this.menuTarget.querySelectorAll("[data-theme]").forEach(el => {
        const checkmark = el.querySelector(".checkmark")
        if (checkmark) {
          checkmark.classList.toggle("opacity-0", el.dataset.theme !== themeId)
        }
      })
    }
  }

  renderMenu() {
    if (!this.hasMenuTarget) return

    const currentTheme = this.currentThemeId ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")

    this.menuTarget.innerHTML = this.runtimeThemes.map(theme => `
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-sm hover:bg-[var(--theme-bg-hover)] flex items-center justify-between gap-2"
        data-theme="${theme.id}"
        data-action="click->theme#selectTheme"
      >
        <span class="flex items-center gap-2">
          ${this.getIcon(theme.icon)}
          ${theme.name}
        </span>
        <svg class="w-4 h-4 checkmark ${theme.id !== currentTheme ? 'opacity-0' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </button>
    `).join("")
  }

  getIcon(iconType) {
    const icons = {
      sun: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>`,
      moon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>`,
      palette: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>`,
      sync: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>`
    }
    return icons[iconType] || icons.palette
  }

  setupClickOutside() {
    this.boundClickOutside = (event) => {
      if (this.hasMenuTarget && !this.element.contains(event.target)) {
        this.menuTarget.classList.add("hidden")
      }
    }
    document.addEventListener("click", this.boundClickOutside)
  }
}
