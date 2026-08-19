import { Controller } from "@hotwired/stimulus"
import { get, patch } from "@rails/request.js"
import { toggleMenu } from "lib/menu_bounds"

export default class extends Controller {
  static targets = ["menu", "currentLocale"]
  static values = { initial: String }

  // Available locales
  static locales = [
    { id: "en", name: "English", flag: "us" },
    { id: "pt-BR", name: "Portugu\u00eas (Brasil)", flag: "br" },
    { id: "pt-PT", name: "Portugu\u00eas (Portugal)", flag: "pt" },
    { id: "es", name: "Espa\u00f1ol", flag: "es" },
    { id: "he", name: "\u05e2\u05d1\u05e8\u05d9\u05ea", flag: "il" },
    { id: "ja", name: "\u65e5\u672c\u8a9e", flag: "jp" },
    { id: "ko", name: "\ud55c\uad6d\uc5b4", flag: "kr" }
  ]

  connect() {
    // Load initial locale from server config
    this.currentLocaleId = this.hasInitialValue && this.initialValue ? this.initialValue : "en"
    this.translations = null
    this.loadTranslations()
    this.renderMenu()
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
  }

  // Load translations from server
  async loadTranslations() {
    try {
      const response = await get("/translations", { responseKind: "json" })
      if (response.ok) {
        const data = await response.json
        this.translations = data.translations
        this.currentLocaleId = data.locale
        // Make translations globally available
        window.frankmdTranslations = this.translations
        window.frankmdLocale = this.currentLocaleId
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent("frankmd:translations-loaded", {
          detail: { locale: this.currentLocaleId, translations: this.translations }
        }))
        this.updateDisplay()
      }
    } catch (error) {
      console.warn("Failed to load translations:", error)
    }
  }

  // Listen for config changes (when .fed file is edited)
  setupConfigListener() {
    this.boundConfigListener = (event) => {
      const { locale } = event.detail
      if (locale && locale !== this.currentLocaleId) {
        this.currentLocaleId = locale
        this.loadTranslations()
        this.renderMenu()
      }
    }
    window.addEventListener("frankmd:config-changed", this.boundConfigListener)
  }

  toggle(event) {
    event.stopPropagation()
    toggleMenu(this.menuTarget)
  }

  selectLocale(event) {
    const localeId = event.currentTarget.dataset.locale
    if (localeId === this.currentLocaleId) {
      this.menuTarget.classList.add("hidden")
      return
    }
    this.currentLocaleId = localeId
    this.updateDisplay()
    this.renderMenu()
    this.menuTarget.classList.add("hidden")
    this.saveLocaleConfig(localeId)
  }

  // Save locale to server config and reload page to apply translations
  async saveLocaleConfig(localeId) {
    if (this.configSaveTimeout) {
      clearTimeout(this.configSaveTimeout)
      this.configSaveTimeout = null
    }

    try {
      await patch("/config", {
        body: { locale: localeId },
        responseKind: "json"
      })
    } catch (error) {
      console.warn("Failed to save locale config:", error)
    }
    // Always reload to apply new locale translations from server
    this.reloadPage()
  }

  reloadPage() {
    window.location.reload()
  }

  updateDisplay() {
    if (this.hasCurrentLocaleTarget) {
      const locale = this.constructor.locales.find(l => l.id === this.currentLocaleId)
      this.currentLocaleTarget.textContent = locale ? locale.name : "English"
    }

    // Update menu checkmarks
    if (this.hasMenuTarget) {
      this.menuTarget.querySelectorAll("[data-locale]").forEach(el => {
        const checkmark = el.querySelector(".checkmark")
        if (checkmark) {
          checkmark.classList.toggle("opacity-0", el.dataset.locale !== this.currentLocaleId)
        }
      })
    }
  }

  renderMenu() {
    if (!this.hasMenuTarget) return

    this.menuTarget.innerHTML = this.constructor.locales.map(locale => `
      <button
        type="button"
        class="w-full px-3 py-2 text-left text-sm hover:bg-[var(--theme-bg-hover)] flex items-center justify-between gap-2"
        data-locale="${locale.id}"
        data-action="click->locale#selectLocale"
      >
        <span class="flex items-center gap-2">
          ${this.getFlag(locale.flag)}
          ${locale.name}
        </span>
        <svg class="w-4 h-4 checkmark ${locale.id !== this.currentLocaleId ? 'opacity-0' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </button>
    `).join("")
  }

  getFlag(flagCode) {
    // Simple flag emoji based on country code
    const flags = {
      us: `<span class="text-base">\ud83c\uddfa\ud83c\uddf8</span>`,
      br: `<span class="text-base">\ud83c\udde7\ud83c\uddf7</span>`,
      pt: `<span class="text-base">\ud83c\uddf5\ud83c\uddf9</span>`,
      es: `<span class="text-base">\ud83c\uddea\ud83c\uddf8</span>`,
      il: `<span class="text-base">\ud83c\uddee\ud83c\uddf1</span>`,
      jp: `<span class="text-base">\ud83c\uddef\ud83c\uddf5</span>`,
      kr: `<span class="text-base">\ud83c\uddf0\ud83c\uddf7</span>`
    }
    return flags[flagCode] || ""
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

// Global translation helper function
// Usage: window.t("dialogs.rename.title") or window.t("status.matches_found", { count: 5, files: 3 })
window.t = function(key, options = {}) {
  const translations = window.frankmdTranslations || {}

  // Navigate the nested object using dot notation
  const keys = key.split(".")
  let value = translations

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k]
    } else {
      // Key not found, return the key itself as fallback
      return key
    }
  }

  // If value is not a string, return key as fallback
  if (typeof value !== "string") {
    return key
  }

  // Replace interpolation placeholders like %{count}
  return value.replace(/%\{(\w+)\}/g, (match, placeholder) => {
    return options[placeholder] !== undefined ? options[placeholder] : match
  })
}
