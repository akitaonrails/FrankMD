import { Controller } from "@hotwired/stimulus"
import { get, post } from "@rails/request.js"
import { escapeHtml } from "lib/text_utils"
import { extractYouTubeId } from "lib/url_utils"
import { highlightDropzone, unhighlightDropzone } from "lib/dropzone"

const DEFAULT_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v", ".ogv"]

// Video Dialog Controller
// Handles video embedding from URLs and YouTube search
// Dispatches video-selected event with embed code

export default class extends Controller {
  static targets = [
    "dialog",
    "tabDrop", "tabUrl", "tabSearch",
    "dropPanel", "urlPanel", "searchPanel",
    "dropzone", "dropFileInput", "dropPreview", "dropFeedback", "dropInsertBtn",
    "videoUrl", "videoPreview", "insertVideoBtn",
    "youtubeSearchInput", "youtubeSearchBtn",
    "youtubeSearchStatus", "youtubeSearchResults",
    "youtubeConfigNotice", "youtubeSearchForm",
    "hugoShortcode"
  ]

  connect() {
    this.youtubeSearchResults = []
    this.selectedYoutubeIndex = -1
    this.youtubeApiEnabled = false
    this.detectedVideoType = null
    this.detectedVideoData = null
    this.currentTab = "drop"
    this.s3Enabled = false
    this.videoExtensions = DEFAULT_VIDEO_EXTENSIONS

    this.checkYoutubeApiEnabled()
    this.loadMediaConfig()
  }

  async loadMediaConfig() {
    try {
      const response = await get("/images/config", { responseKind: "json" })
      if (response.ok) {
        const data = await response.json
        this.s3Enabled = data.s3_enabled
        if (data.video_extensions && data.video_extensions.length) {
          this.videoExtensions = data.video_extensions
        }
      }
    } catch (error) {
      this.s3Enabled = false
    }
  }

  get dropS3Option() {
    const el = this.hasDropPanelTarget ? this.dropPanelTarget.querySelector('[data-controller="s3-option"]') : null
    return el ? this.application.getControllerForElementAndIdentifier(el, "s3-option") : null
  }

  get useHugoShortcode() {
    return this.hasHugoShortcodeTarget && this.hugoShortcodeTarget.checked
  }

  youtubeEmbedCode(videoId, title = "YouTube video player") {
    if (this.useHugoShortcode) {
      if (title && title !== "YouTube video player") {
        return `{{< youtube id="${videoId}" title="${title}" >}}`
      }
      return `{{< youtube id="${videoId}" >}}`
    }

    return `<div class="embed-container">
  <iframe
    src="https://www.youtube.com/embed/${videoId}"
    title="${title}"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen>
  </iframe>
</div>`
  }

  async checkYoutubeApiEnabled() {
    try {
      const response = await get("/youtube/config", { responseKind: "json" })
      if (response.ok) {
        const data = await response.json
        this.youtubeApiEnabled = data.enabled
      }
    } catch (error) {
      this.youtubeApiEnabled = false
    }
  }

  open() {
    // Reset drop tab
    this.resetDropTab()

    // Reset URL tab
    this.videoUrlTarget.value = ""
    this.videoPreviewTarget.innerHTML = `<span class="text-[var(--theme-text-muted)]">${window.t("dialogs.video.preview_hint")}</span>`
    this.insertVideoBtnTarget.disabled = true
    this.detectedVideoType = null
    this.detectedVideoData = null

    // Reset search tab
    if (this.hasYoutubeSearchInputTarget) {
      this.youtubeSearchInputTarget.value = ""
    }
    if (this.hasYoutubeSearchResultsTarget) {
      this.youtubeSearchResultsTarget.innerHTML = ""
    }
    if (this.hasYoutubeSearchStatusTarget) {
      this.youtubeSearchStatusTarget.textContent = window.t("status.enter_keywords_search")
    }
    this.youtubeSearchResults = []
    this.selectedYoutubeIndex = -1

    // Show/hide YouTube config notice based on feature availability
    if (this.hasYoutubeConfigNoticeTarget && this.hasYoutubeSearchFormTarget) {
      const youtubeConfigured = this.youtubeApiEnabled
      this.youtubeConfigNoticeTarget.classList.toggle("hidden", youtubeConfigured)
      this.youtubeSearchFormTarget.classList.toggle("hidden", !youtubeConfigured)
    }

    // Reset to Drop tab (default)
    this.switchTab({ currentTarget: { dataset: { tab: "drop" } } })

    this.dialogTarget.showModal()

    // Focus the dropzone so keyboard users land on the default tab's control.
    if (this.hasDropzoneTarget) this.dropzoneTarget.focus()
  }

  // Enter/Space on the focused dropzone opens the native file picker.
  onDropzoneKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      this.openPicker()
    }
  }

  close() {
    this.dialogTarget.close()
  }

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab
    this.switchToTab(tab)
  }

  // Internal method to switch tabs by name
  switchToTab(tab) {
    this.currentTab = tab

    const active = "border-[var(--theme-accent)] text-[var(--theme-accent)]"
    const inactive = "border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]"
    const base = "px-4 py-2 text-sm font-medium border-b-2 "

    if (this.hasTabDropTarget) this.tabDropTarget.className = base + (tab === "drop" ? active : inactive)
    this.tabUrlTarget.className = base + (tab === "url" ? active : inactive)
    this.tabSearchTarget.className = base + (tab === "search" ? active : inactive)

    // Show/hide panels
    if (this.hasDropPanelTarget) this.dropPanelTarget.classList.toggle("hidden", tab !== "drop")
    this.urlPanelTarget.classList.toggle("hidden", tab !== "url")
    this.searchPanelTarget.classList.toggle("hidden", tab !== "search")

    // Focus appropriate input
    if (tab === "url") {
      this.videoUrlTarget.focus()
    } else if (tab === "search" && this.hasYoutubeSearchInputTarget && this.youtubeApiEnabled) {
      this.youtubeSearchInputTarget.focus()
    }
  }

  // Get ordered list of tab names
  getTabOrder() {
    return ["drop", "url", "search"]
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
    if (tabName === "url" && this.hasTabUrlTarget) {
      this.tabUrlTarget.focus()
    } else if (tabName === "search" && this.hasTabSearchTarget) {
      this.tabSearchTarget.focus()
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

  // Drag-and-drop upload
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
    await this.uploadVideoFile(event.dataTransfer.files[0])
  }

  // Clicking the dropzone opens the native file picker
  openPicker() {
    if (this.hasDropFileInputTarget) this.dropFileInputTarget.click()
  }

  async onFileInputChange(event) {
    await this.uploadVideoFile(event.target.files[0])
    event.target.value = ""  // allow re-selecting the same file
  }

  async uploadVideoFile(file) {
    if (!file) return
    // Guard against a second drop/pick landing while the first upload is still
    // in flight — concurrent POSTs race and the slower response would win.
    if (this.uploading) return

    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "no extension"
    if (!this.videoExtensions.some(e => file.name.toLowerCase().endsWith(e))) {
      this.showDropFeedback(window.t("dialogs.video.drop_rejected", {
        name: file.name, ext, list: this.videoExtensions.join(", ")
      }))
      return
    }

    this.uploading = true
    this.showDropFeedback("")
    this.dropPreviewTarget.classList.remove("hidden")
    this.dropPreviewTarget.innerHTML = `<span class="text-[var(--theme-text-muted)]">${window.t("dialogs.video.uploading")}</span>`

    try {
      const s3 = this.dropS3Option
      const formData = new FormData()
      formData.append("file", file)
      if (this.s3Enabled && s3?.isChecked) {
        formData.append("upload_to_s3", "true")
        if (s3.keyValue) formData.append("s3_prefix", s3.keyValue)
      }

      const response = await post("/media/upload", { body: formData, responseKind: "json" })
      const data = await response.json

      if (!response.ok) {
        this.showDropFeedback(data.error || window.t("status.upload_failed"))
        this.dropPreviewTarget.classList.add("hidden")
        return
      }

      this.detectedVideoType = "file"
      this.detectedVideoData = { url: data.url }
      this.dropPreviewTarget.innerHTML = `
        <div class="flex items-center gap-3">
          <svg class="w-8 h-8 text-[var(--theme-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="min-w-0">
            <div class="font-medium text-[var(--theme-text-primary)]">${window.t("dialogs.video.tab_drop")}</div>
            <div class="text-xs text-[var(--theme-text-muted)] truncate max-w-[350px]">${escapeHtml(file.name)}</div>
          </div>
        </div>
      `
      if (this.hasDropInsertBtnTarget) this.dropInsertBtnTarget.disabled = false
    } catch (error) {
      console.error("Video upload error:", error)
      this.showDropFeedback(window.t("status.upload_failed"))
      this.dropPreviewTarget.classList.add("hidden")
    } finally {
      this.uploading = false
    }
  }

  showDropFeedback(message) {
    if (!this.hasDropFeedbackTarget) return
    this.dropFeedbackTarget.textContent = message
    this.dropFeedbackTarget.classList.toggle("hidden", !message)
  }

  resetDropTab() {
    this.showDropFeedback("")
    if (this.hasDropPreviewTarget) {
      this.dropPreviewTarget.innerHTML = ""
      this.dropPreviewTarget.classList.add("hidden")
    }
    if (this.hasDropInsertBtnTarget) this.dropInsertBtnTarget.disabled = true

    // Video uploads at drop time, so the S3 choice must be visible before the drop.
    const s3 = this.dropS3Option
    if (s3) {
      s3.reset()
      if (this.s3Enabled) s3.show(); else s3.hide()
    }
  }

  onVideoUrlInput() {
    const url = this.videoUrlTarget.value.trim()

    if (!url) {
      this.videoPreviewTarget.innerHTML = `<span class="text-[var(--theme-text-muted)]">${window.t("dialogs.video.preview_hint")}</span>`
      this.insertVideoBtnTarget.disabled = true
      this.detectedVideoType = null
      return
    }

    // Check for YouTube
    const youtubeId = extractYouTubeId(url)
    if (youtubeId) {
      this.detectedVideoType = "youtube"
      this.detectedVideoData = { id: youtubeId }
      const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
      this.videoPreviewTarget.innerHTML = `
        <div class="flex gap-3">
          <div class="relative flex-shrink-0 w-32 h-18 rounded overflow-hidden bg-[var(--theme-bg-tertiary)]" data-video-id="${youtubeId}">
            <img
              src="${thumbnailUrl}"
              alt="Video thumbnail"
              class="w-full h-full object-cover"
              data-action="error->video-dialog#thumbnailError"
            >
            <div class="absolute inset-0 flex items-center justify-center">
              <svg class="w-10 h-10 text-red-600 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
          </div>
          <div class="flex flex-col justify-center">
            <div class="font-medium text-[var(--theme-text-primary)]">YouTube Video</div>
            <div class="text-xs text-[var(--theme-text-muted)]">ID: ${youtubeId}</div>
          </div>
        </div>
      `
      this.insertVideoBtnTarget.disabled = false
      return
    }

    // Check for video file (same allow-list the drop tab uses)
    const isVideoFile = this.videoExtensions.some(ext => url.toLowerCase().endsWith(ext))

    if (isVideoFile) {
      this.detectedVideoType = "file"
      this.detectedVideoData = { url: url }
      const filename = url.split("/").pop()
      this.videoPreviewTarget.innerHTML = `
        <div class="flex items-center gap-3">
          <svg class="w-8 h-8 text-[var(--theme-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div class="font-medium text-[var(--theme-text-primary)]">Video File</div>
            <div class="text-xs text-[var(--theme-text-muted)] truncate max-w-[350px]">${escapeHtml(filename)}</div>
          </div>
        </div>
      `
      this.insertVideoBtnTarget.disabled = false
      return
    }

    // Unknown format
    this.detectedVideoType = null
    this.detectedVideoData = null
    this.videoPreviewTarget.innerHTML = `<span class="text-[var(--theme-warning)]">${window.t("dialogs.video.unknown_format")}</span>`
    this.insertVideoBtnTarget.disabled = true
  }

  onVideoUrlKeydown(event) {
    if (event.key === "Enter" && !this.insertVideoBtnTarget.disabled) {
      event.preventDefault()
      this.insertVideo()
    }
  }

  thumbnailError(event) {
    const thumbnail = event.currentTarget

    if (thumbnail.dataset.fallbackApplied === "true") {
      thumbnail.style.display = "none"
      return
    }

    const videoId = thumbnail.closest("[data-video-id]")?.dataset.videoId
    if (!/^[\w-]{11}$/.test(videoId || "")) {
      thumbnail.style.display = "none"
      return
    }

    thumbnail.dataset.fallbackApplied = "true"
    thumbnail.src = `https://img.youtube.com/vi/${videoId}/default.jpg`
  }

  insertVideo() {
    if (!this.detectedVideoType) {
      this.close()
      return
    }

    let embedCode

    if (this.detectedVideoType === "youtube") {
      embedCode = this.youtubeEmbedCode(this.detectedVideoData.id)
    } else if (this.detectedVideoType === "file") {
      const url = this.detectedVideoData.url
      const ext = url.split(".").pop().toLowerCase()
      const mimeTypes = {
        mp4: "video/mp4",
        webm: "video/webm",
        mkv: "video/x-matroska",
        mov: "video/quicktime",
        avi: "video/x-msvideo",
        m4v: "video/x-m4v",
        ogv: "video/ogg"
      }
      const mimeType = mimeTypes[ext] || "video/mp4"

      embedCode = `<video controls class="video-player">
  <source src="${escapeHtml(url)}" type="${mimeType}">
  Your browser does not support the video tag.
</video>`
    }

    this.dispatch("video-selected", { detail: { embedCode } })
    this.close()
  }

  // YouTube Search
  onYoutubeSearchKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault()
      this.searchYoutube()
    } else if (event.key === "ArrowDown" && this.youtubeSearchResults.length > 0) {
      event.preventDefault()
      this.selectedYoutubeIndex = 0
      this.updateYoutubeSelection()
      this.youtubeSearchResultsTarget.querySelector("[data-index='0']")?.focus()
    }
  }

  async searchYoutube() {
    const query = this.youtubeSearchInputTarget.value.trim()

    if (!query) {
      this.youtubeSearchStatusTarget.textContent = window.t("status.please_enter_keywords")
      return
    }

    if (!this.youtubeApiEnabled) {
      this.youtubeSearchStatusTarget.innerHTML = `<span class="text-amber-500">${window.t("status.youtube_not_configured_js")}</span>`
      return
    }

    this.youtubeSearchStatusTarget.textContent = window.t("status.searching")
    this.youtubeSearchBtnTarget.disabled = true
    this.youtubeSearchResultsTarget.innerHTML = ""

    try {
      const response = await get(`/youtube/search?q=${encodeURIComponent(query)}`, { responseKind: "html" })

      if (!response.ok) {
        const errorData = await response.json
        this.youtubeSearchStatusTarget.innerHTML = `<span class="text-red-500">${errorData?.error || window.t("status.search_failed_retry")}</span>`
        this.youtubeSearchResults = []
      } else {
        const html = await response.text
        this.youtubeSearchResultsTarget.innerHTML = html

        // Extract results data from rendered buttons
        const buttons = this.youtubeSearchResultsTarget.querySelectorAll("[data-video-id]")
        this.youtubeSearchResults = Array.from(buttons).map(btn => ({
          id: btn.dataset.videoId,
          title: btn.dataset.videoTitle
        }))

        if (this.youtubeSearchResults.length === 0) {
          this.youtubeSearchStatusTarget.textContent = window.t("status.no_videos_found")
        } else {
          this.youtubeSearchStatusTarget.textContent = window.t("status.found_videos", { count: this.youtubeSearchResults.length })
        }
        this.selectedYoutubeIndex = -1
      }
    } catch (error) {
      console.error("YouTube search error:", error)
      this.youtubeSearchStatusTarget.innerHTML = `<span class="text-red-500">${window.t("status.search_failed_retry")}</span>`
      this.youtubeSearchResults = []
    } finally {
      this.youtubeSearchBtnTarget.disabled = false
    }
  }

  onYoutubeResultKeydown(event) {
    const currentIndex = parseInt(event.currentTarget.dataset.index)

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      const nextIndex = Math.min(currentIndex + (event.key === "ArrowDown" ? 2 : 1), this.youtubeSearchResults.length - 1)
      this.selectedYoutubeIndex = nextIndex
      this.updateYoutubeSelection()
      this.youtubeSearchResultsTarget.querySelector(`[data-index='${nextIndex}']`)?.focus()
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      const prevIndex = Math.max(currentIndex - (event.key === "ArrowUp" ? 2 : 1), 0)
      if (event.key === "ArrowUp" && currentIndex < 2) {
        this.youtubeSearchInputTarget.focus()
        this.selectedYoutubeIndex = -1
        this.updateYoutubeSelection()
      } else {
        this.selectedYoutubeIndex = prevIndex
        this.updateYoutubeSelection()
        this.youtubeSearchResultsTarget.querySelector(`[data-index='${prevIndex}']`)?.focus()
      }
    } else if (event.key === "Enter") {
      event.preventDefault()
      this.selectYoutubeVideo(event)
    } else if (event.key === "Escape") {
      this.youtubeSearchInputTarget.focus()
      this.selectedYoutubeIndex = -1
      this.updateYoutubeSelection()
    }
  }

  updateYoutubeSelection() {
    this.youtubeSearchResultsTarget.querySelectorAll("[data-index]").forEach((btn, index) => {
      if (index === this.selectedYoutubeIndex) {
        btn.classList.add("ring-2", "ring-[var(--theme-accent)]")
      } else {
        btn.classList.remove("ring-2", "ring-[var(--theme-accent)]")
      }
    })
  }

  selectYoutubeVideo(event) {
    const videoId = event.currentTarget.dataset.videoId
    const videoTitle = event.currentTarget.dataset.videoTitle || "YouTube video"

    if (!videoId) {
      return
    }

    const embedCode = this.youtubeEmbedCode(videoId, videoTitle)

    this.dispatch("video-selected", { detail: { embedCode } })
    this.close()
  }
}
