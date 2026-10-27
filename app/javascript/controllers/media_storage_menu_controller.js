import { Controller } from "@hotwired/stimulus"
import FloatingDropdown from "lib/floating_dropdown"

export default class extends Controller {
  static targets = ["button", "current", "menu", "option"]
  static values = { unavailableMessage: String }
  static outlets = ["media-storage"]

  connect() {
    this.dropdown = new FloatingDropdown(this.menuTarget, this.buttonTarget)
  }

  disconnect() {
    this.dropdown.disconnect()
  }

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
      option.setAttribute("aria-checked", String(selected))
      option.querySelector(".checkmark").classList.toggle("opacity-0", !selected)
      if (selected) this.currentTarget.textContent = option.querySelector("span").textContent
    })
  }

  toggle() {
    this.dropdown.toggle()
  }

  select(event) {
    this.dropdown.close(true)
    return this.mediaStorageOutlet.setProvider(event.currentTarget.value)
  }
}
