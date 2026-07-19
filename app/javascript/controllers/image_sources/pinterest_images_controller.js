import { Controller } from "@hotwired/stimulus"
import { PinterestImageSource } from "lib/image_sources/pinterest_images"
import { WebImageSource } from "lib/image_sources/web_images"

// Pinterest Images Tab Controller
// Handles searching images via Pinterest

export default class extends Controller {
  static targets = ["search", "searchBtn", "status", "grid"]

  static values = {
    s3Enabled: Boolean
  }

  connect() {
    this.source = new PinterestImageSource()
    this.webSource = new WebImageSource() // For S3 upload
    this.selectedImage = null
  }

  get s3Option() {
    const el = this.element.querySelector('[data-controller="s3-option"]')
    return el ? this.application.getControllerForElementAndIdentifier(el, "s3-option") : null
  }

  // Called by parent controller when tab becomes active
  activate() {
    if (this.hasSearchTarget) this.searchTarget.focus()
  }

  configure(s3Enabled) {
    this.s3EnabledValue = s3Enabled
  }

  onSearchKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault()
      this.search()
    }
  }

  async search() {
    if (this.hasStatusTarget) this.statusTarget.textContent = window.t("status.searching")
    if (this.hasSearchBtnTarget) this.searchBtnTarget.disabled = true
    if (this.hasGridTarget) this.gridTarget.innerHTML = ""

    const result = await this.source.search(this.searchTarget.value.trim())

    if (result.error) {
      if (this.hasStatusTarget) {
        this.statusTarget.innerHTML = `<span class="text-red-500">${result.error}</span>`
      }
    } else {
      if (this.hasStatusTarget) this.statusTarget.textContent = result.message
      if (this.hasGridTarget) {
        this.source.renderGrid(this.gridTarget, "click->pinterest-images#select")
      }
    }

    if (this.hasSearchBtnTarget) this.searchBtnTarget.disabled = false
  }

  select(event) {
    const item = event.currentTarget
    this.selectedImage = {
      url: item.dataset.url,
      thumbnail: item.dataset.thumbnail,
      title: item.dataset.title || "Image",
      source: item.dataset.source || "pinterest"
    }

    // Deselect all and select this one
    this.source.deselectAll(this.gridTarget)
    item.classList.add("ring-2", "ring-blue-500")

    // Show S3 options if enabled
    if (this.s3EnabledValue && this.s3Option) {
      this.s3Option.show()
    }

    // Dispatch selection event to parent
    this.dispatch("selected", {
      detail: {
        type: "external",
        url: this.selectedImage.url,
        name: this.selectedImage.title,
        alt: this.selectedImage.title.replace(/[-_]/g, " ").substring(0, 100)
      }
    })
  }

  async getImageUrl() {
    if (!this.selectedImage) return null

    const s3 = this.s3Option
    const reuploadToS3 = this.s3EnabledValue && s3?.isChecked
    const resizeRatio = s3?.resizeRatio || ""

    if (reuploadToS3) {
      const data = await this.webSource.uploadToS3(this.selectedImage.url, resizeRatio, s3?.keyValue || "")
      return data.url
    }

    return this.selectedImage.url
  }

  reset() {
    this.source.reset()
    this.selectedImage = null
    if (this.hasSearchTarget) this.searchTarget.value = ""
    if (this.hasGridTarget) this.gridTarget.innerHTML = ""
    if (this.hasStatusTarget) this.statusTarget.textContent = window.t("status.enter_keywords_search")
    this.s3Option?.hide()
  }
}
