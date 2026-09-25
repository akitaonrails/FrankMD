import { Controller } from "@hotwired/stimulus"
import { FolderImageSource } from "lib/image_sources/folder_images"
import { defaultS3Key } from "lib/s3_key"

// Folder Images Tab Controller
// Handles browsing and selecting images from local filesystem via File System Access API

export default class extends Controller {
  static targets = ["apiNotice", "browsePrompt", "container", "error", "status", "grid", "search", "perPage", "prevPage", "nextPage", "pageStatus"]

  static values = {
    s3Enabled: Boolean
  }

  connect() {
    this.source = new FolderImageSource()
    this.searchTimeout = null
    this.selectedImage = null
    this.offset = 0
  }

  disconnect() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
    this.source.cleanup()
  }

  get s3Option() {
    const el = this.element.querySelector('[data-controller="s3-option"]')
    return el ? this.application.getControllerForElementAndIdentifier(el, "s3-option") : null
  }

  get perPage() {
    return this.hasPerPageTarget ? parseInt(this.perPageTarget.value, 10) || 10 : 10
  }

  // Called by parent controller when tab becomes active
  activate() {
    this.setupUI()
  }

  configure(s3Enabled, imageExtensions = null) {
    this.s3EnabledValue = s3Enabled
    if (imageExtensions) this.allowedExtensions = imageExtensions
  }

  setupUI() {
    const hasApi = this.source.isSupported
    const hasFolderImages = this.source.displayedImages.length > 0

    if (this.hasApiNoticeTarget) {
      this.apiNoticeTarget.classList.toggle("hidden", hasApi)
    }
    if (this.hasBrowsePromptTarget) {
      this.browsePromptTarget.classList.toggle("hidden", !hasApi || hasFolderImages)
    }
    if (this.hasContainerTarget) {
      this.containerTarget.classList.toggle("hidden", !hasFolderImages)
    }
  }

  async browse() {
    this.clearBrowseError()
    const result = await this.source.browse(this.allowedExtensions)

    if (result.error) {
      this.showBrowseError(result.error)
      return
    }

    if (!result.cancelled) {
      this.offset = 0
      this.setupUI()
      await this.renderPage()
    }
  }

  clearBrowseError() {
    if (!this.hasErrorTarget) return

    this.errorTarget.textContent = ""
    this.errorTarget.classList.add("hidden")
  }

  showBrowseError(message) {
    if (!this.hasErrorTarget) return

    this.errorTarget.textContent = message
    this.errorTarget.classList.remove("hidden")
  }

  onSearch() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(async () => {
      this.offset = 0
      await this.renderPage()
    }, 300)
  }

  onPerPageChange() {
    this.offset = 0
    this.renderPage()
  }

  prevPage() {
    this.offset = Math.max(0, this.offset - this.perPage)
    this.renderPage()
  }

  nextPage() {
    this.offset += this.perPage
    this.renderPage()
  }

  async renderPage() {
    const term = this.hasSearchTarget ? this.searchTarget.value : ""
    const result = await this.source.filter(term, { offset: this.offset, limit: this.perPage })
    this.source.renderGrid(
      this.gridTarget,
      this.hasStatusTarget ? this.statusTarget : null,
      "click->folder-images#select",
      result.total
    )
    this.updatePagination(result.total)
  }

  updatePagination(total) {
    if (this.hasPrevPageTarget) this.prevPageTarget.disabled = this.offset <= 0
    if (this.hasNextPageTarget) this.nextPageTarget.disabled = this.offset + this.perPage >= total
    if (this.hasPageStatusTarget) {
      const from = total === 0 ? 0 : this.offset + 1
      const to = Math.min(this.offset + this.perPage, total)
      this.pageStatusTarget.textContent = window.t("dialogs.image_picker.page_status", { from, to, total })
    }
  }

  select(event) {
    const index = parseInt(event.currentTarget.dataset.index)
    const image = this.source.getImage(index)
    if (!image) return

    this.selectedImage = {
      name: image.name,
      file: image.file,
      objectUrl: image.objectUrl
    }

    // Deselect all and select this one
    this.source.deselectAll(this.gridTarget)
    event.currentTarget.classList.add("selected")

    // Show S3 options if enabled
    if (this.s3EnabledValue && this.s3Option) {
      this.s3Option.show()
      this.s3Option.setDefaultKey(defaultS3Key(image.name))
    }

    // Dispatch selection event to parent
    this.dispatch("selected", {
      detail: {
        type: "folder",
        name: image.name,
        alt: image.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
      }
    })
  }

  async getImageUrl() {
    if (!this.selectedImage) return null

    const s3 = this.s3Option
    const uploadToS3 = this.s3EnabledValue && s3?.isChecked
    const resizeRatio = s3?.resizeRatio || ""

    const data = await this.source.upload(
      this.selectedImage.file,
      resizeRatio,
      uploadToS3,
      s3?.keyValue || ""
    )
    return data.url
  }

  reset() {
    this.source.reset()
    this.selectedImage = null
    this.offset = 0
    this.clearBrowseError()
    if (this.hasSearchTarget) this.searchTarget.value = ""
    this.s3Option?.hide()
    this.setupUI()
  }
}
