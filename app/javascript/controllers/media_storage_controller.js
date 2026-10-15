import { Controller } from "@hotwired/stimulus"
import { get, patch } from "@rails/request.js"

// One acknowledged preference for all controls and upload entry points.
export default class extends Controller {
  static targets = ["select", "error", "s3Only", "warningDialog"]
  static values = { provider: { type: String, default: "local" }, s3Available: Boolean, fallback: Boolean }

  connect() {
    this.syncControls()
    if (this.fallbackValue) this.showRecoveryWarning()
  }

  disconnect() {
    this.dismissWarning()
  }

  showRecoveryWarning() {
    if (!this.hasWarningDialogTarget || this.warningDialogTarget.open || this.warningTimer) return
    // Dialog consumers may be opening themselves after awaiting refresh().
    // Show the warning on top once that work has finished.
    this.warningTimer = setTimeout(() => {
      this.warningTimer = null
      this.warningDialogTarget.showModal()
      this.dismissTimer = setTimeout(() => this.dismissWarning(), 6000)
    }, 0)
  }

  dismissWarning() {
    clearTimeout(this.warningTimer)
    clearTimeout(this.dismissTimer)
    this.warningTimer = null
    if (this.hasWarningDialogTarget && this.warningDialogTarget.open) this.warningDialogTarget.close()
  }

  selectTargetConnected() {
    this.syncControls()
  }

  providerValueChanged() {
    this.syncControls()
  }

  s3AvailableValueChanged() {
    this.syncControls()
  }

  syncControls() {
    this.selectTargets.forEach(select => {
      select.value = this.providerValue
      select.disabled = Boolean(this.pending)
      const option = select.querySelector('option[value="s3"]')
      if (option) option.disabled = !this.s3AvailableValue
    })
    this.s3OnlyTargets.forEach(target => target.classList.toggle("hidden", this.providerValue !== "s3"))
    this.dispatch("changed", { detail: { provider: this.providerValue } })
  }

  apply(data) {
    this.providerValue = data.settings.media_storage_provider
    this.s3AvailableValue = Boolean(data.features?.s3_upload ?? this.s3AvailableValue)
    this.syncControls()
    if (data.media_storage_fallback && this.providerValue === "local") this.showRecoveryWarning()
  }

  showError(message = "") {
    this.errorTargets.forEach(target => {
      target.textContent = message
      target.classList.toggle("hidden", !message)
    })
  }

  async run(operation) {
    if (this.pending) {
      try {
        await this.pending
        return true
      } catch {
        return false
      }
    }
    this.showError()
    this.pending = operation()
    this.syncControls()
    try {
      await this.pending
      return true
    } catch (error) {
      this.showError(error.message)
      return false
    } finally {
      this.pending = null
      this.syncControls()
    }
  }

  changeProvider(event) {
    return this.setProvider(event.currentTarget.value)
  }

  setProvider(provider) {
    return this.run(async () => {
      const response = await patch("/config", { body: { media_storage_provider: provider }, responseKind: "json" })
      if (!response.ok) throw new Error(window.t("media_storage.save_failed"))
      this.apply(await response.json)
      window.dispatchEvent(new CustomEvent("frankmd:config-file-modified"))
    })
  }

  async refresh(recovered = false) {
    const success = await this.run(async () => {
      const response = await get("/config", { responseKind: "json" })
      if (!response.ok) throw new Error(window.t("media_storage.load_failed"))
      this.apply(await response.json)
    })
    if (success && recovered && this.providerValue === "local") this.showRecoveryWarning()
    return success
  }

  async ready() {
    // `pending` is the original request promise, so a failed save also prevents
    // an upload that was initiated while that save was in flight.
    if (this.pending) await this.pending
  }
}
