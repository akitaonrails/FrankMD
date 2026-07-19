import { Controller } from "@hotwired/stimulus"
import { LocalImageSource } from "lib/image_sources/local_images"
import { defaultS3Key } from "lib/s3_key"

// Local Images Tab Controller
// Handles searching and selecting images from the server's images directory

export default class extends Controller {
  static targets = ["configNotice", "form", "search", "grid"]

  static values = {
    enabled: Boolean,
    s3Enabled: Boolean
  }

  connect() {
    this.source = new LocalImageSource()
    this.searchTimeout = null
  }

  disconnect() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
  }

  get s3Option() {
    const el = this.element.querySelector('[data-controller="s3-option"]')
    return el ? this.application.getControllerForElementAndIdentifier(el, "s3-option") : null
  }

  // Called by parent controller when tab becomes active
  async activate() {
    if (this.enabledValue && this.hasGridTarget) {
      await this.loadImages()
      if (this.hasSearchTarget) this.searchTarget.focus()
    }
  }

  configure(enabled, s3Enabled) {
    this.enabledValue = enabled
    this.s3EnabledValue = s3Enabled

    if (this.hasConfigNoticeTarget && this.hasFormTarget) {
      this.configNoticeTarget.classList.toggle("hidden", enabled)
      this.formTarget.classList.toggle("hidden", !enabled)
    }
  }

  async loadImages(search = "") {
    const images = await this.source.load(search)
    if (!images.error && this.hasGridTarget) {
      this.source.renderGrid(images, this.gridTarget, "click->local-images#select")
    }
  }

  onSearch() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(() => {
      this.loadImages(this.searchTarget.value.trim())
    }, 300)
  }

  select(event) {
    const item = event.currentTarget
    const path = item.dataset.path
    const name = item.dataset.name

    // Store the selected path for getImageUrl()
    this.source.selectedPath = path

    // Deselect all and select this one
    this.source.deselectAll(this.gridTarget)
    item.classList.add("selected")

    // Show S3 options if enabled
    if (this.s3EnabledValue && this.s3Option) {
      this.s3Option.show()
      this.s3Option.setDefaultKey(defaultS3Key(name))
    }

    // Dispatch selection event to parent
    this.dispatch("selected", {
      detail: {
        type: "local",
        path,
        name,
        alt: name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
      }
    })
  }

  async getImageUrl() {
    const s3 = this.s3Option
    const uploadToS3 = this.s3EnabledValue && s3?.isChecked
    const resizeRatio = s3?.resizeRatio || ""
    const path = this.source.selectedPath

    if (!path) return null

    if (uploadToS3) {
      const data = await this.source.uploadToS3(path, resizeRatio, s3?.keyValue || "")
      return data.url
    }

    return `/images/preview/${encodeURIComponent(path).replace(/%2F/g, "/")}`
  }

  reset() {
    this.source.reset()
    if (this.hasSearchTarget) this.searchTarget.value = ""
    this.s3Option?.hide()
  }
}
