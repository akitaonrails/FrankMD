import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["stage", "status", "closeButton"]
  static values = { loading: String, error: String }

  open({ detail = {} }) {
    let url
    try { url = new URL(detail.src, document.baseURI) } catch { return }
    if (!detail.src || !["http:", "https:", "blob:", "data:"].includes(url.protocol)) return
    if (url.protocol === "data:" && !/^data:image\/[a-z0-9.+-]+[;,]/i.test(detail.src)) return

    this.trigger = detail.trigger
    this.fallback = detail.fallback
    const image = document.createElement("img")
    this.image = image
    image.className = "image-viewer-image"
    image.alt = detail.alt || ""
    image.hidden = true
    this.statusTarget.textContent = this.loadingValue
    image.addEventListener("load", () => {
      if (this.image !== image) return
      image.hidden = false
      this.statusTarget.textContent = ""
    }, { once: true })
    image.addEventListener("error", () => {
      if (this.image === image) this.statusTarget.textContent = this.errorValue
    }, { once: true })
    this.stageTarget.replaceChildren(image)
    image.src = url.href
    if (!this.element.open) this.element.showModal()
    this.closeButtonTarget.focus()
  }

  close() {
    if (this.element.open) this.element.close()
  }

  closeOnBackdrop(event) {
    if (event.target === this.element) this.close()
  }

  onClose() {
    this.image = null
    this.stageTarget.replaceChildren()
    this.statusTarget.textContent = ""
    const target = this.trigger?.isConnected ? this.trigger : this.fallback
    if (target?.isConnected) target.focus()
    this.trigger = this.fallback = null
  }

  disconnect() {
    this.close()
    this.image = null
  }
}
