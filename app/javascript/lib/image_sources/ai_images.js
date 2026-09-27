// AI Image Generation
// Handles generating images using AI (Gemini/Imagen)

import { get, post } from "@rails/request.js"
import { escapeHtml } from "lib/text_utils"
import { encodePath } from "lib/url_utils"
import { imagePickerText } from "lib/image_sources/image_picker_text"

export class AiImageSource {
  constructor() {
    this.enabled = false
    this.model = null
    this.generatedData = null
    this.abortController = null
    this.refImage = null
    this.refImageSearchTimeout = null
  }

  reset() {
    this.generatedData = null
    this.refImage = null
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.refImageSearchTimeout) {
      clearTimeout(this.refImageSearchTimeout)
      this.refImageSearchTimeout = null
    }
  }

  async loadConfig() {
    try {
      const response = await get("/ai/image_config", { responseKind: "json" })
      if (response.ok) {
        const config = await response.json
        this.enabled = config.enabled
        this.model = config.model
      }
    } catch (error) {
      console.error("Error loading AI image config:", error)
    }
    return { enabled: this.enabled, model: this.model }
  }

  async generate(prompt) {
    if (!prompt) {
      return { error: imagePickerText("ai_prompt_required", {}, "Please enter a prompt describing the image you want to generate") }
    }

    if (!this.enabled) {
      return { error: imagePickerText("ai_not_configured", {}, "AI image generation is not configured. Please add your Gemini API key to .fed") }
    }

    this.abortController = new AbortController()

    try {
      const requestBody = { prompt }
      if (this.refImage?.path) {
        requestBody.reference_image_path = this.refImage.path
      }

      const response = await post("/ai/generate_image", {
        body: requestBody,
        responseKind: "json",
        signal: this.abortController.signal
      })

      const data = await response.json

      if (data.error) {
        return { error: data.error }
      }

      this.generatedData = {
        data: data.data,
        url: data.url,
        mime_type: data.mime_type,
        model: data.model,
        revised_prompt: data.revised_prompt
      }

      return {
        success: true,
        imageData: this.generatedData,
        previewSrc: data.data
          ? `data:${data.mime_type || 'image/png'};base64,${data.data}`
          : data.url
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("AI image generation cancelled by user")
        return { cancelled: true }
      }
      console.error("AI image generation error:", error)
      return { error: imagePickerText("ai_generation_failed", {}, "Failed to generate image. Please try again.") }
    } finally {
      this.abortController = null
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  setRefImage(path, name) {
    this.refImage = { path, name }
  }

  clearRefImage() {
    this.refImage = null
  }

  async loadRefImages(search = "") {
    try {
      const url = search ? `/images?search=${encodeURIComponent(search)}` : "/images"
      const response = await get(url, { responseKind: "json" })

      if (!response.ok) {
        const data = await response.json
        return { error: data.error || imagePickerText("image_load_failed", {}, "Error loading images") }
      }

      return await response.json
    } catch (error) {
      console.error("Error loading reference images:", error)
      return { error: imagePickerText("image_load_failed", {}, "Error loading images") }
    }
  }

  renderRefImageGrid(images, container, onSelectAction) {
    if (!images || images.length === 0) {
      const message = escapeHtml(imagePickerText("no_images_found", {}, "No images found"))
      container.innerHTML = `<div class="col-span-6 text-center text-[var(--theme-text-muted)] py-4 text-xs">${message}</div>`
      return
    }

    const html = images.map(image => `
      <button
        type="button"
        class="aspect-square rounded overflow-hidden bg-[var(--theme-bg-tertiary)] hover:ring-2 hover:ring-[var(--theme-accent)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] ${this.refImage?.path === image.path ? 'ring-2 ring-[var(--theme-accent)]' : ''}"
        data-action="${onSelectAction}"
        data-path="${escapeHtml(image.path)}"
        data-name="${escapeHtml(image.name)}"
        title="${escapeHtml(image.name)}"
      >
        <img src="/images/preview/${encodePath(image.path)}" alt="${escapeHtml(image.name)}" class="w-full h-full object-cover" loading="lazy">
      </button>
    `).join("")

    container.innerHTML = html
  }

  async save(uploadToS3, s3Prefix = "") {
    if (!this.generatedData) {
      return { error: imagePickerText("ai_no_generated_data", {}, "No generated image data available") }
    }

    try {
      if (this.generatedData.data) {
        // Base64 image data
        const body = {
          data: this.generatedData.data,
          mime_type: this.generatedData.mime_type,
          filename: `ai_${Date.now()}.png`,
          upload_to_s3: uploadToS3
        }
        if (uploadToS3 && s3Prefix) body.s3_prefix = s3Prefix
        const response = await post("/images/upload_base64", {
          body,
          responseKind: "json"
        })

        if (!response.ok) {
          const data = await response.json
          throw new Error(data.error || imagePickerText("ai_save_failed", {}, "Failed to save image"))
        }

        return await response.json
      } else if (this.generatedData.url) {
        // URL image
        if (uploadToS3) {
          const body = { url: this.generatedData.url }
          if (s3Prefix) body.s3_prefix = s3Prefix
          const response = await post("/images/upload_external_to_s3", {
            body,
            responseKind: "json"
          })

          if (!response.ok) {
            const data = await response.json
            throw new Error(data.error || imagePickerText("image_upload_failed", {}, "Failed to upload to S3"))
          }

          return await response.json
        } else {
          return { url: this.generatedData.url }
        }
      }
    } catch (error) {
      console.error("Error saving AI-generated image:", error)
      throw error
    }
  }
}
