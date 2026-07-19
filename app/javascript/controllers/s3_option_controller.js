import { Controller } from "@hotwired/stimulus"
import { defaultS3Prefix } from "lib/s3_key"

// S3 Option Controller
// Reusable component for S3 upload checkbox with resize + destination options.
// Used by image source controllers (local, folder, web, google, pinterest) and
// the video dialog.

export default class extends Controller {
  static targets = ["checkbox", "resizeOption", "resizeSelect", "keyOption", "keyInput"]

  static values = {
    enabled: { type: Boolean, default: false },
    // "full": input holds the whole object key incl. filename (client knows it).
    // "prefix": input holds only the folder; the server appends the filename.
    keyMode: { type: String, default: "prefix" }
  }

  connect() {
    // Initial state - resize and key options hidden
    if (this.hasResizeOptionTarget) {
      this.resizeOptionTarget.classList.add("hidden")
    }
    if (this.hasKeyOptionTarget) {
      this.keyOptionTarget.classList.add("hidden")
    }
    // Set by the parent for "full" mode; "prefix" mode computes its own default.
    this.defaultKey = null
    this.keyDirty = false
  }

  // Called by parent to show/hide this component
  show() {
    this.element.classList.remove("hidden")
  }

  hide() {
    this.element.classList.add("hidden")
    this.reset()
  }

  // Toggle resize + destination-key options based on the checkbox.
  onCheckboxChange(event) {
    if (this.hasResizeOptionTarget) {
      this.resizeOptionTarget.classList.toggle("hidden", !event.target.checked)
      if (!event.target.checked && this.hasResizeSelectTarget) {
        this.resizeSelectTarget.value = "0.5"
      }
    }
    if (this.hasKeyOptionTarget) {
      this.keyOptionTarget.classList.toggle("hidden", !event.target.checked)
      if (event.target.checked) this.fillDefaultKey()
    }
  }

  onKeyInput() {
    // The user typed their own value; don't overwrite it on the next selection.
    this.keyDirty = true
  }

  // Parent (full mode) supplies the default key for the current selection.
  // Re-fills the input unless the user has already edited it.
  setDefaultKey(value) {
    this.defaultKey = value
    if (this.isChecked && !this.keyDirty) this.fillDefaultKey()
  }

  fillDefaultKey() {
    if (!this.hasKeyInputTarget || this.keyDirty) return
    this.keyInputTarget.value = this.defaultKeyValue
  }

  get defaultKeyValue() {
    // "full" mode uses the parent-provided key; fall back to the prefix default
    // (also the default for "prefix" mode).
    return this.defaultKey || defaultS3Prefix()
  }

  // Get current values (called by parent controller)
  get isChecked() {
    return this.hasCheckboxTarget && this.checkboxTarget.checked
  }

  get resizeRatio() {
    if (!this.isChecked) return ""
    return this.hasResizeSelectTarget ? this.resizeSelectTarget.value : ""
  }

  // The destination key/prefix the user chose, or "" to keep the server default.
  get keyValue() {
    if (!this.isChecked || !this.hasKeyInputTarget) return ""
    return this.keyInputTarget.value.trim()
  }

  reset() {
    if (this.hasCheckboxTarget) this.checkboxTarget.checked = false
    if (this.hasResizeOptionTarget) this.resizeOptionTarget.classList.add("hidden")
    if (this.hasResizeSelectTarget) this.resizeSelectTarget.value = "0.5"
    if (this.hasKeyOptionTarget) this.keyOptionTarget.classList.add("hidden")
    if (this.hasKeyInputTarget) this.keyInputTarget.value = ""
    this.defaultKey = null
    this.keyDirty = false
  }
}
