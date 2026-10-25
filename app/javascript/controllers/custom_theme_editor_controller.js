import { Controller } from "@hotwired/stimulus"
import { normalizeColor, themeColor, contrastRatio } from "lib/custom_theme"

export default class extends Controller {
  static targets = ["name", "base", "hex", "color", "form", "save", "status", "contrast"]
  static outlets = ["theme"]
  static values = { defaultName: String, invalid: String, error: String, warning: String }

  open(trigger) {
    if (!this.hasThemeOutlet || this.element.open) return
    this.snapshot = this.themeOutlet.captureTheme()
    this.trigger = trigger || document.activeElement
    this.saved = false
    this.busy = false
    this.invalidFields = new Set()
    const themes = this.themeOutlet.constructor.themes
    this.draft = this.snapshot.custom?.base ? JSON.parse(JSON.stringify(this.snapshot.custom)) : {
      version: 1,
      name: this.defaultNameValue,
      base: themes.some(theme => theme.id === this.snapshot.id) ? this.snapshot.id :
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
      colors: {}
    }
    this.baseTarget.replaceChildren(...themes.map(theme => {
      const option = document.createElement("option")
      option.value = theme.id
      option.textContent = theme.name
      return option
    }))
    this.nameTarget.value = this.draft.name
    this.baseTarget.value = this.draft.base
    this.statusTarget.textContent = ""
    this.preview()
    this.syncFields()
    this.element.showModal()
    this.nameTarget.focus()
  }

  onName() {
    this.draft.name = this.nameTarget.value
    this.preview()
    this.updateSaveState()
  }

  onBase() {
    this.draft.base = this.baseTarget.value
    this.preview()
    this.syncFields()
  }

  onColor(event) {
    const input = event.currentTarget
    const key = input.dataset.key
    const color = normalizeColor(input.value)
    if (color) {
      this.invalidFields.delete(key)
      this.draft.colors[key] = color
      for (const field of [...this.hexTargets, ...this.colorTargets].filter(field => field.dataset.key === key)) {
        field.value = color
        field.removeAttribute("aria-invalid")
      }
      this.statusTarget.textContent = ""
      this.preview()
    } else {
      this.invalidFields.add(key)
      input.setAttribute("aria-invalid", "true")
      this.statusTarget.textContent = this.invalidValue
    }
    this.updateSaveState()
  }

  reset() {
    this.draft.colors = {}
    this.invalidFields.clear()
    this.statusTarget.textContent = ""
    this.preview()
    this.syncFields()
  }

  preview() {
    this.themeOutlet.previewCustom(this.draft)
    const styles = getComputedStyle(document.documentElement)
    const color = key => themeColor(styles, key)
    const ratios = [contrastRatio(color("text-primary"), color("bg-primary")), contrastRatio(color("accent-text"), color("accent"))]
      .filter(ratio => ratio !== null)
    const lowest = Math.min(...ratios)
    this.contrastTarget.textContent = lowest < 4.5 ? this.warningValue.replace("%{ratio}", lowest.toFixed(2)) : ""
  }

  syncFields() {
    const styles = getComputedStyle(document.documentElement)
    for (const field of [...this.hexTargets, ...this.colorTargets]) {
      field.value = themeColor(styles, field.dataset.key) || "#000000"
      field.removeAttribute("aria-invalid")
    }
    this.invalidFields.clear()
    this.updateSaveState()
  }

  updateSaveState() {
    const name = this.nameTarget.value.trim()
    const validName = name.length > 0 && name.length <= 60 && !/[\u0000-\u001f\u007f]/.test(name)
    this.nameTarget.setAttribute("aria-invalid", String(!validName))
    this.saveTarget.disabled = this.busy || !validName || this.invalidFields.size > 0
  }

  async save(event) {
    event.preventDefault()
    this.updateSaveState()
    if (this.saveTarget.disabled) return
    this.busy = true
    this.setBusy()
    try {
      if (!await this.themeOutlet.saveCustomTheme(this.draft)) throw new Error("Unable to save theme")
      this.saved = true
      this.element.close()
    } catch {
      this.statusTarget.textContent = this.errorValue
    } finally {
      this.busy = false
      this.setBusy()
    }
  }

  setBusy() {
    this.element.setAttribute("aria-busy", String(this.busy))
    this.formTarget.disabled = this.busy
    this.element.querySelectorAll("button").forEach(button => { button.disabled = this.busy })
    this.updateSaveState()
  }

  close() {
    if (!this.busy) this.element.close()
  }

  onCancel(event) {
    if (this.busy) event.preventDefault()
  }

  closeOnBackdrop(event) {
    if (event.target === this.element) this.close()
  }

  onClose() {
    if (this.snapshot && !this.saved) this.themeOutlet.restoreTheme(this.snapshot)
    this.snapshot = null
    if (this.trigger?.isConnected) this.trigger.focus()
  }

  disconnect() {
    if (this.snapshot && !this.saved && this.hasThemeOutlet) this.themeOutlet.restoreTheme(this.snapshot)
  }
}
