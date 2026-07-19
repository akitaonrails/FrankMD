import { Controller } from "@hotwired/stimulus"
import { AiImageSource } from "lib/image_sources/ai_images"
import { encodePath } from "lib/url_utils"
import { defaultS3Prefix } from "lib/s3_key"

// AI Images Tab Controller
// Handles generating images using AI (Gemini/Imagen)

export default class extends Controller {
  static targets = [
    "configNotice", "form", "model", "prompt", "generateBtn",
    "processing", "processingModel", "result", "preview",
    "revisedPromptContainer", "revisedPrompt",
    "s3Option", "saveS3", "keyOption", "keyInput",
    "refSection", "refPreviewContainer", "refPreview", "refName",
    "refPicker", "refSearch", "refGrid"
  ]

  static values = {
    enabled: Boolean,
    s3Enabled: Boolean,
    imagesEnabled: Boolean
  }

  connect() {
    this.source = new AiImageSource()
    this.searchTimeout = null
    this.generatedPrompt = null
  }

  disconnect() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
    this.source.abort()
  }

  // Called by parent controller when tab becomes active
  async activate() {
    if (this.enabledValue && this.hasPromptTarget) {
      this.promptTarget.focus()
    }
    // Load reference images if enabled and grid is empty
    if (this.imagesEnabledValue && this.hasRefGridTarget && !this.refGridTarget.innerHTML.trim()) {
      await this.loadRefImages()
    }
  }

  async configure(enabled, s3Enabled, imagesEnabled) {
    this.enabledValue = enabled
    this.s3EnabledValue = s3Enabled
    this.imagesEnabledValue = imagesEnabled
    this.source.enabled = enabled

    if (this.hasConfigNoticeTarget && this.hasFormTarget) {
      this.configNoticeTarget.classList.toggle("hidden", enabled)
      this.formTarget.classList.toggle("hidden", !enabled)
    }
    if (this.hasS3OptionTarget) {
      this.s3OptionTarget.classList.toggle("hidden", !s3Enabled)
    }
    if (this.hasModelTarget && this.source.model) {
      this.modelTarget.textContent = this.source.model
    }
    if (this.hasRefSectionTarget) {
      this.refSectionTarget.classList.toggle("hidden", !imagesEnabled)
    }
  }

  async loadConfig() {
    await this.source.loadConfig()
    return { enabled: this.source.enabled, model: this.source.model }
  }

  onPromptKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      this.generate()
    }
  }

  async generate() {
    const prompt = this.promptTarget.value.trim()
    this.generatedPrompt = prompt

    // Show processing UI
    if (this.hasProcessingTarget) this.processingTarget.classList.remove("hidden")
    if (this.hasProcessingModelTarget) {
      this.processingModelTarget.textContent = this.source.model || "imagen-4.0-generate-001"
    }
    if (this.hasGenerateBtnTarget) this.generateBtnTarget.disabled = true
    if (this.hasResultTarget) this.resultTarget.classList.add("hidden")

    // ESC to cancel
    const escHandler = (e) => {
      if (e.key === "Escape") this.source.abort()
    }
    document.addEventListener("keydown", escHandler)

    const result = await this.source.generate(prompt)

    document.removeEventListener("keydown", escHandler)

    // Hide processing UI
    if (this.hasProcessingTarget) this.processingTarget.classList.add("hidden")
    if (this.hasGenerateBtnTarget) this.generateBtnTarget.disabled = false

    if (result.error) {
      alert(result.error)
      return
    }

    if (result.cancelled) return

    // Show result
    if (this.hasPreviewTarget) {
      this.previewTarget.src = result.previewSrc
    }

    if (this.hasRevisedPromptContainerTarget && this.hasRevisedPromptTarget) {
      if (result.imageData.revised_prompt) {
        this.revisedPromptTarget.textContent = result.imageData.revised_prompt
        this.revisedPromptContainerTarget.classList.remove("hidden")
      } else {
        this.revisedPromptContainerTarget.classList.add("hidden")
      }
    }

    if (this.hasResultTarget) this.resultTarget.classList.remove("hidden")

    // Dispatch selection event to parent
    this.dispatch("selected", {
      detail: {
        type: "ai",
        name: `ai_${Date.now()}.png`,
        alt: prompt.length > 100 ? prompt.substring(0, 100) + "..." : prompt
      }
    })
  }

  async loadRefImages(search = "") {
    if (!this.imagesEnabledValue || !this.hasRefGridTarget) return

    const images = await this.source.loadRefImages(search)
    if (!images.error) {
      this.source.renderRefImageGrid(images, this.refGridTarget, "click->ai-images#selectRefImage")
    }
  }

  onRefSearch() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(() => {
      this.loadRefImages(this.refSearchTarget.value.trim())
    }, 300)
  }

  selectRefImage(event) {
    const button = event.currentTarget
    const path = button.dataset.path
    const name = button.dataset.name

    this.source.setRefImage(path, name)

    if (this.hasRefPreviewTarget) {
      this.refPreviewTarget.src = `/images/preview/${encodePath(path)}`
    }
    if (this.hasRefNameTarget) {
      this.refNameTarget.textContent = name
    }
    if (this.hasRefPreviewContainerTarget) {
      this.refPreviewContainerTarget.classList.remove("hidden")
    }
    if (this.hasRefPickerTarget) {
      this.refPickerTarget.classList.add("hidden")
    }
  }

  clearRefImage() {
    this.source.clearRefImage()

    if (this.hasRefPreviewContainerTarget) {
      this.refPreviewContainerTarget.classList.add("hidden")
    }
    if (this.hasRefPickerTarget) {
      this.refPickerTarget.classList.remove("hidden")
    }
    if (this.hasRefSearchTarget) {
      this.refSearchTarget.value = ""
    }
    this.loadRefImages()
  }

  // Reveal the destination-prefix input when "Save to S3" is picked, pre-filled
  // with the default prefix. The AI tab owns the whole filename, so this is a
  // prefix (like external URLs), not a full key.
  onSaveOptionChange() {
    const useS3 = this.hasSaveS3Target && this.saveS3Target.checked
    if (this.hasKeyOptionTarget) this.keyOptionTarget.classList.toggle("hidden", !useS3)
    if (useS3 && this.hasKeyInputTarget && !this.keyInputTarget.value) {
      this.keyInputTarget.value = defaultS3Prefix()
    }
  }

  async getImageUrl() {
    const uploadToS3 = this.s3EnabledValue && this.hasSaveS3Target && this.saveS3Target.checked
    const s3Prefix = uploadToS3 && this.hasKeyInputTarget ? this.keyInputTarget.value.trim() : ""
    const data = await this.source.save(uploadToS3, s3Prefix)
    return data.url
  }

  reset() {
    this.source.reset()
    this.generatedPrompt = null
    if (this.hasPromptTarget) this.promptTarget.value = ""
    if (this.hasProcessingTarget) this.processingTarget.classList.add("hidden")
    if (this.hasResultTarget) this.resultTarget.classList.add("hidden")
    if (this.hasGenerateBtnTarget) this.generateBtnTarget.disabled = false
    if (this.hasRefPreviewContainerTarget) this.refPreviewContainerTarget.classList.add("hidden")
    if (this.hasRefPickerTarget) this.refPickerTarget.classList.remove("hidden")
    if (this.hasRefGridTarget) this.refGridTarget.innerHTML = ""
    if (this.hasRefSearchTarget) this.refSearchTarget.value = ""
  }
}
