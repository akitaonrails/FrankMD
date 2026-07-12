import { Controller } from "@hotwired/stimulus"
import { get } from "@rails/request.js"

// Image Picker Controller
// Thin orchestration layer that coordinates between source-specific controllers
// Each tab has its own controller that handles source-specific logic

export default class extends Controller {
  static targets = [
    "dialog",
    // Tab buttons
    "tabDrop", "tabLocal", "tabFolder", "tabWeb", "tabGoogle", "tabPinterest", "tabAi",
    // Tab panels (contain nested controllers)
    "panelDrop", "panelLocal", "panelFolder", "panelWeb", "panelGoogle", "panelPinterest", "panelAi",
    // Common options
    "options", "selectedName", "alt", "link",
    "loading", "loadingText", "insertBtn"
  ]

  connect() {
    this.currentTab = "drop"
    this.selectedSource = null
    this.selectedImageData = null

    // Load configuration
    this.loadConfig()
  }

  async loadConfig() {
    try {
      const response = await get("/images/config", { responseKind: "json" })
      if (response.ok) {
        this.config = await response.json
      }
    } catch (error) {
      console.error("Error loading images config:", error)
      this.config = { enabled: false, s3_enabled: false, google_enabled: false }
    }

    // Configure each source controller
    this.configureSourceControllers()
  }

  configureSourceControllers() {
    const dropCtrl = this.getSourceController("drop-images")
    if (dropCtrl) dropCtrl.configure(this.config.s3_enabled, this.config.image_extensions)

    const localCtrl = this.getSourceController("local-images")
    if (localCtrl) localCtrl.configure(this.config.enabled, this.config.s3_enabled)

    const folderCtrl = this.getSourceController("folder-images")
    if (folderCtrl) folderCtrl.configure(this.config.s3_enabled, this.config.image_extensions)

    const webCtrl = this.getSourceController("web-images")
    if (webCtrl) webCtrl.configure(this.config.s3_enabled)

    const googleCtrl = this.getSourceController("google-images")
    if (googleCtrl) googleCtrl.configure(this.config.google_enabled, this.config.s3_enabled)

    const pinterestCtrl = this.getSourceController("pinterest-images")
    if (pinterestCtrl) pinterestCtrl.configure(this.config.s3_enabled)

    // AI controller loads its own config
    const aiCtrl = this.getSourceController("ai-images")
    if (aiCtrl) {
      aiCtrl.loadConfig().then(() => {
        aiCtrl.configure(aiCtrl.source.enabled, this.config.s3_enabled, this.config.enabled)
      })
    }
  }

  getSourceController(name) {
    const element = this.element.querySelector(`[data-controller~="${name}"]`)
    if (!element) return null
    return this.application.getControllerForElementAndIdentifier(element, name)
  }

  // Dialog management
  async open() {
    this.resetAll()
    this.switchTab({ currentTarget: { dataset: { tab: "drop" } } })

    // Activate the drop tab (default)
    const dropCtrl = this.getSourceController("drop-images")
    if (dropCtrl) await dropCtrl.activate()

    this.dialogTarget.showModal()
  }

  close() {
    const folderCtrl = this.getSourceController("folder-images")
    if (folderCtrl) folderCtrl.source.cleanup()

    this.dialogTarget.close()
  }

  closeDialog() {
    this.close()
  }

  resetAll() {
    this.selectedSource = null
    this.selectedImageData = null
    this.currentTab = "drop"

    // Reset common UI
    if (this.hasAltTarget) this.altTarget.value = ""
    if (this.hasLinkTarget) this.linkTarget.value = ""
    if (this.hasOptionsTarget) this.optionsTarget.classList.add("hidden")
    if (this.hasInsertBtnTarget) this.insertBtnTarget.disabled = true

    // Reset each source controller
    const sources = ["drop-images", "local-images", "folder-images", "web-images", "google-images", "pinterest-images", "ai-images"]
    sources.forEach(name => {
      const ctrl = this.getSourceController(name)
      if (ctrl) ctrl.reset()
    })
  }

  // Tab switching
  switchTab(event) {
    const tab = event.currentTarget.dataset.tab
    this.switchToTab(tab)
  }

  // Internal method to switch tabs by name
  switchToTab(tab) {
    this.currentTab = tab

    const activeClasses = "border-[var(--theme-accent)] text-[var(--theme-accent)]"
    const inactiveClasses = "border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]"

    const tabs = ["Drop", "Local", "Folder", "Web", "Google", "Pinterest", "Ai"]
    tabs.forEach(t => {
      const tabTarget = this[`hasTab${t}Target`] ? this[`tab${t}Target`] : null
      const panelTarget = this[`hasPanel${t}Target`] ? this[`panel${t}Target`] : null

      if (tabTarget) {
        tabTarget.className = `px-4 py-2 text-sm font-medium border-b-2 ${tab === t.toLowerCase() ? activeClasses : inactiveClasses}`
      }
      if (panelTarget) {
        panelTarget.classList.toggle("hidden", tab !== t.toLowerCase())
      }
    })

    // Activate the selected tab's controller
    const controllerMap = {
      drop: "drop-images",
      local: "local-images",
      folder: "folder-images",
      web: "web-images",
      google: "google-images",
      pinterest: "pinterest-images",
      ai: "ai-images"
    }

    const ctrl = this.getSourceController(controllerMap[tab])
    if (ctrl) ctrl.activate()
  }

  // Get ordered list of tab names
  getTabOrder() {
    return ["drop", "local", "folder", "web", "google", "pinterest", "ai"]
  }

  // Handle arrow key navigation on tab buttons
  onTabKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

    event.preventDefault()
    const tabs = this.getTabOrder()
    const currentIndex = tabs.indexOf(this.currentTab)

    let newIndex
    if (event.key === "ArrowRight") {
      newIndex = (currentIndex + 1) % tabs.length
    } else {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length
    }

    this.switchToTab(tabs[newIndex])
    this.focusTab(tabs[newIndex])
  }

  // Focus the tab button for a given tab name
  focusTab(tabName) {
    const targetName = `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Target`
    if (this[`has${targetName.replace('Target', '')}Target`]) {
      this[targetName].focus()
    }
  }

  // Handle mouse wheel on tab bar to switch tabs
  onTabWheel(event) {
    event.preventDefault()
    const tabs = this.getTabOrder()
    const currentIndex = tabs.indexOf(this.currentTab)

    let newIndex
    if (event.deltaY > 0 || event.deltaX > 0) {
      // Scroll down/right -> next tab
      newIndex = (currentIndex + 1) % tabs.length
    } else {
      // Scroll up/left -> previous tab
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length
    }

    this.switchToTab(tabs[newIndex])
  }

  // Handle selection events from source controllers
  onSourceSelected(event) {
    const { type, name, alt, path, url } = event.detail
    this.selectedSource = event.target.closest("[data-controller]").dataset.controller.split(" ")[0]
    this.selectedImageData = { type, name, alt, path, url }

    // Show common options
    if (this.hasOptionsTarget) this.optionsTarget.classList.remove("hidden")
    if (this.hasSelectedNameTarget) this.selectedNameTarget.textContent = name
    if (this.hasInsertBtnTarget) this.insertBtnTarget.disabled = false
    if (this.hasAltTarget) this.altTarget.value = alt || ""
  }

  // Loading state
  showLoading(message) {
    if (this.hasLoadingTarget) {
      this.loadingTarget.classList.remove("hidden")
      this.loadingTarget.classList.add("flex")
    }
    if (this.hasLoadingTextTarget) {
      this.loadingTextTarget.textContent = message
    }
  }

  hideLoading() {
    if (this.hasLoadingTarget) {
      this.loadingTarget.classList.add("hidden")
      this.loadingTarget.classList.remove("flex")
    }
  }

  // Insert image
  async insertImage() {
    if (!this.selectedSource || !this.selectedImageData) return

    const ctrl = this.getSourceController(this.selectedSource)
    if (!ctrl) return

    try {
      this.showLoading("Processing image...")
      this.insertBtnTarget.disabled = true

      const imageUrl = await ctrl.getImageUrl()
      if (!imageUrl) {
        this.hideLoading()
        this.insertBtnTarget.disabled = false
        return
      }

      // Build markdown
      const altText = this.altTarget.value.trim() || this.selectedImageData.name || "Image"
      const linkUrl = this.linkTarget.value.trim()

      let markdown = `![${altText}](${imageUrl})`
      if (linkUrl) {
        markdown = `[![${altText}](${imageUrl})](${linkUrl})`
      }

      this.hideLoading()
      this.dispatch("image-selected", { detail: { markdown } })
      this.close()
    } catch (error) {
      console.error("Error inserting image:", error)
      alert(`Failed to insert image: ${error.message}`)
      this.hideLoading()
      this.insertBtnTarget.disabled = false
    }
  }
}
