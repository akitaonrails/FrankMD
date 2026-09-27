import { Controller } from "@hotwired/stimulus"
import { LocalImageSource } from "lib/image_sources/local_images"
import { defaultS3Key } from "lib/s3_key"
import { appConfirm } from "lib/app_prompt"
import { clearInlineError, showInlineError } from "lib/inline_messages"

// Local Images Tab Controller
// Handles searching and selecting images from the server's images directory

export default class extends Controller {
  static targets = ["configNotice", "form", "search", "grid", "perPage", "prevPage", "nextPage", "pageStatus", "error"]

  static values = {
    enabled: Boolean,
    s3Enabled: Boolean
  }

  connect() {
    this.source = new LocalImageSource()
    this.searchTimeout = null
    this.offset = 0
    this.total = 0
  }

  disconnect() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
  }

  get s3Option() {
    const el = this.element.querySelector('[data-controller="s3-option"]')
    return el ? this.application.getControllerForElementAndIdentifier(el, "s3-option") : null
  }

  get perPage() {
    return this.hasPerPageTarget ? parseInt(this.perPageTarget.value, 10) || 10 : 10
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
    clearInlineError(this.hasErrorTarget ? this.errorTarget : null)
    const data = await this.source.load(search, { limit: this.perPage, offset: this.offset })
    if (data.error) {
      showInlineError(this.hasErrorTarget ? this.errorTarget : null, data.error)
      return
    }

    if (this.hasGridTarget) {
      this.total = data.total || 0
      // Stepped past the end (e.g. deleted the last item on the last page): go back a page.
      if (this.offset > 0 && this.offset >= this.total) {
        this.offset = Math.max(0, this.offset - this.perPage)
        return this.loadImages(search)
      }
      this.source.renderGrid(data.images, this.gridTarget, "click->local-images#select")
      this.updatePagination()
    }
  }

  onSearch() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(() => {
      this.offset = 0
      this.loadImages(this.searchTarget.value.trim())
    }, 300)
  }

  onPerPageChange() {
    this.offset = 0
    this.loadImages(this.currentSearch())
  }

  prevPage() {
    this.offset = Math.max(0, this.offset - this.perPage)
    this.loadImages(this.currentSearch())
  }

  nextPage() {
    this.offset += this.perPage
    this.loadImages(this.currentSearch())
  }

  currentSearch() {
    return this.hasSearchTarget ? this.searchTarget.value.trim() : ""
  }

  updatePagination() {
    if (this.hasPrevPageTarget) this.prevPageTarget.disabled = this.offset <= 0
    if (this.hasNextPageTarget) this.nextPageTarget.disabled = this.offset + this.perPage >= this.total
    if (this.hasPageStatusTarget) {
      const from = this.total === 0 ? 0 : this.offset + 1
      const to = Math.min(this.offset + this.perPage, this.total)
      this.pageStatusTarget.textContent = window.t("dialogs.image_picker.page_status", { from, to, total: this.total })
    }
  }

  // Delete the image whose trash button was clicked. stopPropagation keeps the
  // click from also triggering the tile's select action.
  async deleteImage(event) {
    event.stopPropagation()
    const btn = event.currentTarget
    const path = btn.dataset.path
    const name = btn.dataset.name

    clearInlineError(this.hasErrorTarget ? this.errorTarget : null)
    if (!await appConfirm(window.t("dialogs.image_picker.delete_confirm", { name }), {
      acceptLabel: window.t("common.delete"),
      destructive: true
    })) return

    try {
      await this.source.deleteImage(path)
      if (this.source.selectedPath === path) {
        this.source.selectedPath = null
        this.s3Option?.hide()
      }
      await this.loadImages(this.currentSearch())
    } catch (error) {
      showInlineError(this.hasErrorTarget ? this.errorTarget : null,
        error.message || window.t("dialogs.image_picker.delete_failed"))
    }
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
    this.offset = 0
    this.total = 0
    this.s3Option?.hide()
  }
}
