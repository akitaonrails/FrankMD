import { Controller } from "@hotwired/stimulus"
import { FolderImageSource, DEFAULT_IMAGE_EXTENSIONS } from "lib/image_sources/folder_images"
import { highlightDropzone, unhighlightDropzone } from "lib/dropzone"

// Drop Images Tab Controller
// Accepts drag-and-dropped image files. Reuses FolderImageSource machinery
// (preview grid, select, upload) since dropped files are the same File objects
// the folder picker produces.

export default class extends Controller {
  static targets = ["dropzone", "fileInput", "container", "grid", "status", "feedback"]

  static values = {
    s3Enabled: Boolean
  }

  connect() {
    this.source = new FolderImageSource()
    this.allowedExtensions = DEFAULT_IMAGE_EXTENSIONS
    this.selectedImage = null
  }

  disconnect() {
    this.source.cleanup()
  }

  get s3Option() {
    const el = this.element.querySelector('[data-controller="s3-option"]')
    return el ? this.application.getControllerForElementAndIdentifier(el, "s3-option") : null
  }

  // Called by parent controller when tab becomes active; focus the dropzone
  // so keyboard users land on the default tab's control.
  activate() {
    if (this.hasDropzoneTarget) this.dropzoneTarget.focus()
  }

  configure(s3Enabled, imageExtensions = null) {
    this.s3EnabledValue = s3Enabled
    if (imageExtensions && imageExtensions.length) this.allowedExtensions = imageExtensions
  }

  onDragover(event) {
    event.preventDefault()
    highlightDropzone(this.dropzoneTarget)
  }

  onDragleave(event) {
    event.preventDefault()
    unhighlightDropzone(this.dropzoneTarget, event.relatedTarget)
  }

  async onDrop(event) {
    event.preventDefault()
    unhighlightDropzone(this.dropzoneTarget)
    await this.ingestFiles(event.dataTransfer.files)
  }

  // Clicking the dropzone opens the native file picker
  openPicker() {
    if (this.hasFileInputTarget) this.fileInputTarget.click()
  }

  // Enter/Space on the focused dropzone opens the native file picker.
  onDropzoneKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      this.openPicker()
    }
  }

  async onFileInputChange(event) {
    await this.ingestFiles(event.target.files)
    event.target.value = ""  // allow re-selecting the same file
  }

  async ingestFiles(fileList) {
    // A fresh ingest replaces the grid; clear any prior selection so the
    // parent's Insert button can't upload a stale, no-longer-visible file.
    if (this.selectedImage) {
      this.selectedImage = null
      this.dispatch("deselected", { detail: { type: "drop" } })
    }

    const { count, rejected } = await this.source.ingest(fileList, this.allowedExtensions)

    this.showRejected(rejected)

    if (count > 0) {
      this.containerTarget.classList.remove("hidden")
      this.source.renderGrid(
        this.gridTarget,
        this.hasStatusTarget ? this.statusTarget : null,
        "click->drop-images#select",
        count
      )
    } else {
      this.containerTarget.classList.add("hidden")
    }
  }

  showRejected(rejected) {
    if (!this.hasFeedbackTarget) return

    if (!rejected || rejected.length === 0) {
      this.feedbackTarget.textContent = ""
      this.feedbackTarget.classList.add("hidden")
      return
    }

    const list = this.allowedExtensions.join(", ")
    const messages = rejected.map(r =>
      window.t("dialogs.image_picker.drop_rejected", { name: r.name, ext: r.ext, list })
    )
    this.feedbackTarget.textContent = messages.join(" ")
    this.feedbackTarget.classList.remove("hidden")
  }

  select(event) {
    const index = parseInt(event.currentTarget.dataset.index)
    const image = this.source.getImage(index)
    if (!image) return

    this.selectedImage = { name: image.name, file: image.file }

    this.source.deselectAll(this.gridTarget)
    event.currentTarget.classList.add("selected")

    if (this.s3EnabledValue && this.s3Option) {
      this.s3Option.show()
    }

    this.dispatch("selected", {
      detail: {
        type: "drop",
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

    const data = await this.source.upload(this.selectedImage.file, resizeRatio, uploadToS3)
    return data.url
  }

  reset() {
    this.source.reset()
    this.selectedImage = null
    if (this.hasFeedbackTarget) {
      this.feedbackTarget.textContent = ""
      this.feedbackTarget.classList.add("hidden")
    }
    if (this.hasContainerTarget) this.containerTarget.classList.add("hidden")
    this.s3Option?.hide()
  }
}
