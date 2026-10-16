import { Controller } from "@hotwired/stimulus"
import { get, destroy } from "@rails/request.js"
import { LocalImageSource } from "lib/image_sources/local_images"
import { defaultS3Key } from "lib/s3_key"
import { encodePath } from "lib/url_utils"
import { appConfirm } from "lib/app_prompt"
import { clearInlineError, showInlineError } from "lib/inline_messages"

// The Library tab browses existing files; optional copies use active storage.
export default class extends Controller {
  static outlets = ["s3-option"]
  static targets = ["collection", "search", "grid", "perPage", "results", "error"]

  connect() {
    this.offset = 0
    this.total = 0
    this.selectedImage = null
  }

  disconnect() {
    clearTimeout(this.searchTimeout)
    this.request?.abort()
  }

  get s3Option() {
    return this.hasS3OptionOutlet ? this.s3OptionOutlet : null
  }

  get collection() {
    return this.hasCollectionTarget ? this.collectionTarget.value : "managed"
  }

  get perPage() {
    return this.hasPerPageTarget ? Number(this.perPageTarget.value) || 10 : 10
  }

  resultsTargetConnected(target) {
    this.total = Number(target.dataset.total) || 0
  }

  configure(enabled) {
    if (this.hasCollectionTarget) {
      this.collectionTarget.querySelector('[value="server"]').disabled = !enabled
      if (!enabled) this.collectionTarget.value = "managed"
    }
  }

  async activate() {
    await this.loadImages()
  }

  async loadImages() {
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    this.clearSelection()
    clearInlineError(this.hasErrorTarget ? this.errorTarget : null)
    const params = new URLSearchParams({
      collection: this.collection, search: this.hasSearchTarget ? this.searchTarget.value.trim() : "",
      limit: this.perPage, offset: this.offset
    })
    try {
      const response = await get(`/library/picker?${params}`, { responseKind: "turbo-stream", signal: request.signal })
      if (!response.ok) throw new Error(window.t("dialogs.image_picker.image_load_failed"))
    } catch (error) {
      if (!request.signal.aborted) showInlineError(this.hasErrorTarget ? this.errorTarget : null, error.message)
    }
  }

  onSearch() {
    clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(() => {
      this.offset = 0
      this.loadImages()
    }, 300)
  }

  onCollectionChange() {
    this.offset = 0
    return this.loadImages()
  }

  onPerPageChange() {
    this.offset = 0
    return this.loadImages()
  }

  prevPage() {
    this.offset = Math.max(0, this.offset - this.perPage)
    return this.loadImages()
  }

  nextPage() {
    this.offset += this.perPage
    return this.loadImages()
  }

  select(event) {
    const { path, name, url, collection } = event.currentTarget.dataset
    this.selectedImage = { path, name, url, collection }
    this.gridTarget.querySelectorAll(".selected").forEach(item => item.classList.remove("selected"))
    event.currentTarget.closest(".image-grid-item").classList.add("selected")
    if (collection === "server") {
      this.s3Option?.show()
      this.s3Option?.setDefaultKey(defaultS3Key(name))
    } else {
      this.s3Option?.hide()
    }
    this.dispatch("selected", { detail: { type: "local", name, path, url, alt: name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") } })
  }

  async getImageUrl() {
    if (!this.selectedImage) return null
    const { path, url, collection } = this.selectedImage
    if (collection === "server" && this.s3Option?.isChecked) {
      const result = await new LocalImageSource().saveCopy(path, this.s3Option.resizeRatio, this.s3Option.keyValue)
      return result.url
    }
    return url
  }

  async deleteImage(event) {
    event.stopPropagation()
    const { path, name, collection } = event.currentTarget.dataset
    if (!await appConfirm(window.t("dialogs.image_picker.delete_confirm", { name }), {
      acceptLabel: window.t("common.delete"), destructive: true
    })) return
    try {
      const endpoint = collection === "server" ? "images" : "library"
      const response = await destroy(`/${endpoint}/file/${encodePath(path)}`, { responseKind: "json" })
      if (!response.ok) {
        const data = await response.json
        throw new Error(data.error || window.t("dialogs.image_picker.delete_failed"))
      }
      if (this.offset > 0 && this.offset >= this.total - 1) this.offset = Math.max(0, this.offset - this.perPage)
      await this.loadImages()
    } catch (error) {
      showInlineError(this.hasErrorTarget ? this.errorTarget : null, error.message)
    }
  }

  clearSelection() {
    this.selectedImage = null
    this.s3Option?.hide()
    this.dispatch("deselected")
  }

  reset() {
    clearTimeout(this.searchTimeout)
    this.request?.abort()
    this.offset = 0
    if (this.hasCollectionTarget) this.collectionTarget.value = "managed"
    if (this.hasSearchTarget) this.searchTarget.value = ""
    this.clearSelection()
  }
}
