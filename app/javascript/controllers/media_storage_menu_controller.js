import { Controller } from "@hotwired/stimulus"
import { toggleMenu } from "lib/menu_bounds"

export default class extends Controller {
  static targets = ["button", "current", "menu", "option"]
  static values = { unavailableMessage: String }
  static outlets = ["media-storage"]

  mediaStorageOutletConnected() {
    this.sync()
  }

  sync() {
    if (!this.hasMediaStorageOutlet) return
    const storage = this.mediaStorageOutlet
    this.buttonTarget.disabled = Boolean(storage.pending)
    this.optionTargets.forEach(option => {
      const selected = option.value === storage.providerValue
      const unavailable = option.value === "s3" && !storage.s3AvailableValue
      option.disabled = Boolean(storage.pending) || unavailable
      option.title = unavailable ? this.unavailableMessageValue : ""
      option.setAttribute("aria-pressed", String(selected))
      option.querySelector(".checkmark").classList.toggle("opacity-0", !selected)
      if (selected) this.currentTarget.textContent = option.querySelector("span").textContent
    })
  }

  toggle() {
    const visible = toggleMenu(this.menuTarget)
    this.buttonTarget.setAttribute("aria-expanded", String(visible))
    if (visible) this.optionTargets.find(option => !option.disabled)?.focus()
  }

  close(event) {
    if (this.menuTarget.classList.contains("hidden")) return
    event?.preventDefault()
    event?.stopPropagation()
    toggleMenu(this.menuTarget, true)
    this.buttonTarget.setAttribute("aria-expanded", "false")
    this.buttonTarget.focus()
  }

  closeOutside(event) {
    if (!this.element.contains(event.target)) {
      toggleMenu(this.menuTarget, true)
      this.buttonTarget.setAttribute("aria-expanded", "false")
    }
  }

  select(event) {
    this.close()
    return this.mediaStorageOutlet.setProvider(event.currentTarget.value)
  }

  navigate(event) {
    if (this.menuTarget.classList.contains("hidden")) return
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const options = this.optionTargets.filter(option => !option.disabled)
    if (!options.length) return
    const index = options.indexOf(document.activeElement)
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
      (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length
    options[next].focus()
  }
}
