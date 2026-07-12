/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import VideoDialogController from "../../../app/javascript/controllers/video_dialog_controller.js"

describe("VideoDialogController", () => {
  let application, controller, element

  beforeEach(() => {
    // Mock window.t for translations
    window.t = vi.fn((key) => key)

    document.body.innerHTML = `
      <div data-controller="video-dialog">
        <dialog data-video-dialog-target="dialog"></dialog>
        <button data-video-dialog-target="tabDrop" data-tab="drop"></button>
        <button data-video-dialog-target="tabUrl" data-tab="url"></button>
        <button data-video-dialog-target="tabSearch" data-tab="search"></button>
        <div data-video-dialog-target="dropPanel">
          <div data-video-dialog-target="dropzone"></div>
          <input data-video-dialog-target="dropFileInput" type="file" />
          <div data-video-dialog-target="dropFeedback" class="hidden"></div>
          <div data-video-dialog-target="dropPreview" class="hidden"></div>
          <button data-video-dialog-target="dropInsertBtn" disabled></button>
        </div>
        <div data-video-dialog-target="urlPanel"></div>
        <div data-video-dialog-target="searchPanel" class="hidden"></div>
        <input data-video-dialog-target="videoUrl" type="text" />
        <div data-video-dialog-target="videoPreview"></div>
        <button data-video-dialog-target="insertVideoBtn" disabled></button>
        <input data-video-dialog-target="youtubeSearchInput" type="text" />
        <button data-video-dialog-target="youtubeSearchBtn"></button>
        <div data-video-dialog-target="youtubeSearchStatus"></div>
        <div data-video-dialog-target="youtubeSearchResults"></div>
        <div data-video-dialog-target="youtubeConfigNotice"></div>
        <div data-video-dialog-target="youtubeSearchForm"></div>
        <input type="checkbox" data-video-dialog-target="hugoShortcode" />
      </div>
    `

    // Mock showModal and close for dialog
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.open = false
    })

    // Mock fetch for YouTube config check
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ enabled: false })
    })

    element = document.querySelector('[data-controller="video-dialog"]')
    application = Application.start()
    application.register("video-dialog", VideoDialogController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "video-dialog")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("initializes empty search results", () => {
      expect(controller.youtubeSearchResults).toEqual([])
    })

    it("initializes selected index to -1", () => {
      expect(controller.selectedYoutubeIndex).toBe(-1)
    })

    it("checks YouTube API availability", () => {
      expect(global.fetch).toHaveBeenCalledWith("/youtube/config", {
        method: "GET",
        headers: { "Accept": "application/json" }
      })
    })
  })

  describe("open()", () => {
    it("shows the dialog", () => {
      controller.open()

      expect(controller.dialogTarget.showModal).toHaveBeenCalled()
    })

    it("resets video URL input", () => {
      controller.videoUrlTarget.value = "https://example.com/video"
      controller.open()

      expect(controller.videoUrlTarget.value).toBe("")
    })

    it("disables insert button", () => {
      controller.insertVideoBtnTarget.disabled = false
      controller.open()

      expect(controller.insertVideoBtnTarget.disabled).toBe(true)
    })

    it("resets detected video type", () => {
      controller.detectedVideoType = "youtube"
      controller.detectedVideoData = { id: "abc123" }
      controller.open()

      expect(controller.detectedVideoType).toBeNull()
      expect(controller.detectedVideoData).toBeNull()
    })

    it("resets search results", () => {
      controller.youtubeSearchResults = [{ id: "abc" }]
      controller.selectedYoutubeIndex = 0
      controller.open()

      expect(controller.youtubeSearchResults).toEqual([])
      expect(controller.selectedYoutubeIndex).toBe(-1)
    })
  })

  describe("close()", () => {
    it("closes the dialog", () => {
      controller.open()
      controller.close()

      expect(controller.dialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("switchTab()", () => {
    it("shows URL panel when URL tab selected", () => {
      const event = { currentTarget: { dataset: { tab: "url" } } }
      controller.switchTab(event)

      expect(controller.urlPanelTarget.classList.contains("hidden")).toBe(false)
      expect(controller.searchPanelTarget.classList.contains("hidden")).toBe(true)
    })

    it("shows search panel when search tab selected", () => {
      const event = { currentTarget: { dataset: { tab: "search" } } }
      controller.switchTab(event)

      expect(controller.urlPanelTarget.classList.contains("hidden")).toBe(true)
      expect(controller.searchPanelTarget.classList.contains("hidden")).toBe(false)
    })
  })

  describe("onVideoUrlInput()", () => {
    it("disables insert button when URL is empty", () => {
      controller.videoUrlTarget.value = ""
      controller.onVideoUrlInput()

      expect(controller.insertVideoBtnTarget.disabled).toBe(true)
      expect(controller.detectedVideoType).toBeNull()
    })

    it("detects YouTube URL", () => {
      controller.videoUrlTarget.value = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      controller.onVideoUrlInput()

      expect(controller.detectedVideoType).toBe("youtube")
      expect(controller.detectedVideoData.id).toBe("dQw4w9WgXcQ")
      expect(controller.insertVideoBtnTarget.disabled).toBe(false)
    })

    it("detects short YouTube URL", () => {
      controller.videoUrlTarget.value = "https://youtu.be/dQw4w9WgXcQ"
      controller.onVideoUrlInput()

      expect(controller.detectedVideoType).toBe("youtube")
      expect(controller.detectedVideoData.id).toBe("dQw4w9WgXcQ")
    })

    it("detects video file URL", () => {
      controller.videoUrlTarget.value = "https://example.com/video.mp4"
      controller.onVideoUrlInput()

      expect(controller.detectedVideoType).toBe("file")
      expect(controller.detectedVideoData.url).toBe("https://example.com/video.mp4")
      expect(controller.insertVideoBtnTarget.disabled).toBe(false)
    })

    it("detects WebM file URL", () => {
      controller.videoUrlTarget.value = "https://example.com/video.webm"
      controller.onVideoUrlInput()

      expect(controller.detectedVideoType).toBe("file")
    })

    it("shows unknown format for invalid URLs", () => {
      controller.videoUrlTarget.value = "https://example.com/page.html"
      controller.onVideoUrlInput()

      expect(controller.detectedVideoType).toBeNull()
      expect(controller.insertVideoBtnTarget.disabled).toBe(true)
    })
  })

  describe("onVideoUrlKeydown()", () => {
    it("calls insertVideo on Enter when button is enabled", () => {
      const insertSpy = vi.spyOn(controller, "insertVideo")
      controller.insertVideoBtnTarget.disabled = false
      const event = { key: "Enter", preventDefault: vi.fn() }

      controller.onVideoUrlKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(insertSpy).toHaveBeenCalled()
    })

    it("does not call insertVideo when button is disabled", () => {
      const insertSpy = vi.spyOn(controller, "insertVideo")
      controller.insertVideoBtnTarget.disabled = true
      const event = { key: "Enter", preventDefault: vi.fn() }

      controller.onVideoUrlKeydown(event)

      expect(insertSpy).not.toHaveBeenCalled()
    })
  })

  describe("insertVideo()", () => {
    it("closes dialog when no video type detected", () => {
      const closeSpy = vi.spyOn(controller, "close")
      controller.detectedVideoType = null

      controller.insertVideo()

      expect(closeSpy).toHaveBeenCalled()
    })

    it("dispatches video-selected event for YouTube video", () => {
      const handler = vi.fn()
      element.addEventListener("video-dialog:video-selected", handler)

      controller.detectedVideoType = "youtube"
      controller.detectedVideoData = { id: "abc123" }
      controller.insertVideo()

      expect(handler).toHaveBeenCalled()
      const embedCode = handler.mock.calls[0][0].detail.embedCode
      expect(embedCode).toContain("youtube.com/embed/abc123")
    })

    it("dispatches Hugo shortcode for YouTube when checkbox is checked", () => {
      const handler = vi.fn()
      element.addEventListener("video-dialog:video-selected", handler)

      controller.hugoShortcodeTarget.checked = true
      controller.detectedVideoType = "youtube"
      controller.detectedVideoData = { id: "abc123" }
      controller.insertVideo()

      expect(handler).toHaveBeenCalled()
      const embedCode = handler.mock.calls[0][0].detail.embedCode
      expect(embedCode).toBe('{{< youtube id="abc123" >}}')
    })

    it("dispatches video-selected event for video file", () => {
      const handler = vi.fn()
      element.addEventListener("video-dialog:video-selected", handler)

      controller.detectedVideoType = "file"
      controller.detectedVideoData = { url: "https://example.com/video.mp4" }
      controller.insertVideo()

      expect(handler).toHaveBeenCalled()
      const embedCode = handler.mock.calls[0][0].detail.embedCode
      expect(embedCode).toContain("video controls")
      expect(embedCode).toContain("video.mp4")
      expect(embedCode).toContain("video/mp4")
    })

    it("closes dialog after inserting", () => {
      const closeSpy = vi.spyOn(controller, "close")

      controller.detectedVideoType = "youtube"
      controller.detectedVideoData = { id: "abc123" }
      controller.insertVideo()

      expect(closeSpy).toHaveBeenCalled()
    })
  })

  describe("youtubeEmbedCode()", () => {
    it("returns HTML embed when checkbox is unchecked", () => {
      controller.hugoShortcodeTarget.checked = false
      const code = controller.youtubeEmbedCode("abc123", "My Video")

      expect(code).toContain("youtube.com/embed/abc123")
      expect(code).toContain('title="My Video"')
      expect(code).toContain("embed-container")
      expect(code).not.toContain("{{<")
    })

    it("returns shortcode without title when title is default", () => {
      controller.hugoShortcodeTarget.checked = true
      const code = controller.youtubeEmbedCode("abc123", "YouTube video player")

      expect(code).toBe('{{< youtube id="abc123" >}}')
    })

    it("returns shortcode with title when title is custom", () => {
      controller.hugoShortcodeTarget.checked = true
      const code = controller.youtubeEmbedCode("abc123", "My Custom Title")

      expect(code).toBe('{{< youtube id="abc123" title="My Custom Title" >}}')
    })

    it("returns shortcode without title when title is omitted", () => {
      controller.hugoShortcodeTarget.checked = true
      const code = controller.youtubeEmbedCode("abc123")

      expect(code).toBe('{{< youtube id="abc123" >}}')
    })
  })

  describe("searchYoutube()", () => {
    it("shows error when query is empty", async () => {
      controller.youtubeSearchInputTarget.value = ""
      await controller.searchYoutube()

      expect(controller.youtubeSearchStatusTarget.textContent).toBe("status.please_enter_keywords")
    })

    it("shows error when YouTube API is not enabled", async () => {
      controller.youtubeApiEnabled = false
      controller.youtubeSearchInputTarget.value = "test query"

      await controller.searchYoutube()

      expect(controller.youtubeSearchStatusTarget.innerHTML).toContain("youtube_not_configured")
    })

    it("fetches search results when API is enabled", async () => {
      controller.youtubeApiEnabled = true
      controller.youtubeSearchInputTarget.value = "test query"

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<button data-index="0" data-video-id="vid1" data-video-title="Video 1" data-action="click->video-dialog#selectYoutubeVideo">Video 1</button>')
      })

      await controller.searchYoutube()

      expect(global.fetch).toHaveBeenCalledWith("/youtube/search?q=test%20query", {
        method: "GET",
        headers: {}
      })
    })

    it("stores search results from HTML response", async () => {
      controller.youtubeApiEnabled = true
      controller.youtubeSearchInputTarget.value = "test"

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(
          '<button data-index="0" data-video-id="vid1" data-video-title="Video 1" data-action="click->video-dialog#selectYoutubeVideo">Video 1</button>' +
          '<button data-index="1" data-video-id="vid2" data-video-title="Video 2" data-action="click->video-dialog#selectYoutubeVideo">Video 2</button>'
        )
      })

      await controller.searchYoutube()

      expect(controller.youtubeSearchResults).toEqual([
        { id: "vid1", title: "Video 1" },
        { id: "vid2", title: "Video 2" }
      ])
    })

    it("handles search errors", async () => {
      controller.youtubeApiEnabled = true
      controller.youtubeSearchInputTarget.value = "test"

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      await controller.searchYoutube()

      expect(controller.youtubeSearchStatusTarget.innerHTML).toContain("search_failed")
      expect(controller.youtubeSearchResults).toEqual([])
    })

    it("shows no results message when empty", async () => {
      controller.youtubeApiEnabled = true
      controller.youtubeSearchInputTarget.value = "test"

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("")
      })

      await controller.searchYoutube()

      expect(controller.youtubeSearchStatusTarget.textContent).toBe("status.no_videos_found")
    })
  })

  describe("updateYoutubeSelection()", () => {
    it("does nothing when results are empty", () => {
      controller.youtubeSearchResultsTarget.innerHTML = ""
      controller.updateYoutubeSelection()

      expect(controller.youtubeSearchResultsTarget.innerHTML).toBe("")
    })

    it("highlights selected video button", () => {
      controller.youtubeSearchResultsTarget.innerHTML =
        '<button data-index="0" data-video-id="vid1" data-video-title="Video 1">Video 1</button>' +
        '<button data-index="1" data-video-id="vid2" data-video-title="Video 2">Video 2</button>'
      controller.youtubeSearchResults = [
        { id: "vid1", title: "Video 1" },
        { id: "vid2", title: "Video 2" }
      ]
      controller.selectedYoutubeIndex = 1
      controller.updateYoutubeSelection()

      const buttons = controller.youtubeSearchResultsTarget.querySelectorAll("button")
      expect(buttons[0].classList.contains("ring-2")).toBe(false)
      expect(buttons[1].classList.contains("ring-2")).toBe(true)
      expect(buttons[1].classList.contains("ring-[var(--theme-accent)]")).toBe(true)
    })

    it("removes highlight when index is -1", () => {
      controller.youtubeSearchResultsTarget.innerHTML =
        '<button data-index="0" data-video-id="vid1" data-video-title="Video 1" class="ring-2 ring-[var(--theme-accent)]">Video 1</button>'
      controller.youtubeSearchResults = [{ id: "vid1", title: "Video 1" }]
      controller.selectedYoutubeIndex = -1
      controller.updateYoutubeSelection()

      const buttons = controller.youtubeSearchResultsTarget.querySelectorAll("button")
      expect(buttons[0].classList.contains("ring-2")).toBe(false)
    })
  })

  describe("selectYoutubeVideo()", () => {
    it("dispatches video-selected event with embed code", () => {
      const handler = vi.fn()
      element.addEventListener("video-dialog:video-selected", handler)

      const event = {
        currentTarget: {
          dataset: { videoId: "xyz789", videoTitle: "Test Title" }
        }
      }
      controller.selectYoutubeVideo(event)

      expect(handler).toHaveBeenCalled()
      const embedCode = handler.mock.calls[0][0].detail.embedCode
      expect(embedCode).toContain("youtube.com/embed/xyz789")
      expect(embedCode).toContain("Test Title")
    })

    it("dispatches Hugo shortcode with title when checkbox is checked", () => {
      const handler = vi.fn()
      element.addEventListener("video-dialog:video-selected", handler)

      controller.hugoShortcodeTarget.checked = true
      const event = {
        currentTarget: {
          dataset: { videoId: "xyz789", videoTitle: "Test Title" }
        }
      }
      controller.selectYoutubeVideo(event)

      expect(handler).toHaveBeenCalled()
      const embedCode = handler.mock.calls[0][0].detail.embedCode
      expect(embedCode).toBe('{{< youtube id="xyz789" title="Test Title" >}}')
    })

    it("does nothing when videoId is missing", () => {
      const handler = vi.fn()
      element.addEventListener("video-dialog:video-selected", handler)

      const event = {
        currentTarget: { dataset: {} }
      }
      controller.selectYoutubeVideo(event)

      expect(handler).not.toHaveBeenCalled()
    })

    it("closes dialog after selection", () => {
      const closeSpy = vi.spyOn(controller, "close")

      const event = {
        currentTarget: {
          dataset: { videoId: "xyz789", videoTitle: "Test" }
        }
      }
      controller.selectYoutubeVideo(event)

      expect(closeSpy).toHaveBeenCalled()
    })
  })

  describe("onDrop() (drag-and-drop upload)", () => {
    function dropEvent(fileName) {
      return {
        preventDefault: vi.fn(),
        dataTransfer: { files: [ new File([ "data" ], fileName, { type: "video/mp4" }) ] }
      }
    }

    it("rejects a disallowed extension with a reason and does not upload", async () => {
      const fetchSpy = vi.fn()
      global.fetch = fetchSpy

      await controller.onDrop(dropEvent("notes.txt"))

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(controller.detectedVideoType).toBeNull()
      expect(controller.dropFeedbackTarget.classList.contains("hidden")).toBe(false)
      expect(controller.dropFeedbackTarget.textContent).toBe("dialogs.video.drop_rejected")
    })

    it("uploads a valid video and enables the insert button", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "videos/clip.mp4" })
      })

      await controller.onDrop(dropEvent("clip.mp4"))

      expect(global.fetch).toHaveBeenCalledWith("/media/upload", expect.objectContaining({ method: "POST" }))
      expect(controller.detectedVideoType).toBe("file")
      expect(controller.detectedVideoData.url).toBe("videos/clip.mp4")
      expect(controller.dropInsertBtnTarget.disabled).toBe(false)
    })

    it("surfaces the server error when upload fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "boom" })
      })

      await controller.onDrop(dropEvent("clip.mp4"))

      expect(controller.detectedVideoType).toBeNull()
      expect(controller.dropFeedbackTarget.textContent).toBe("boom")
    })

    it("shows the localized uploading label, not a raw status key", async () => {
      let resolve
      global.fetch = vi.fn(() => new Promise((r) => {
        resolve = () => r({ ok: true, json: () => Promise.resolve({ url: "videos/clip.mp4" }) })
      }))

      const inFlight = controller.onDrop(dropEvent("clip.mp4"))

      // While uploading, the label uses a key that actually exists in the locales.
      expect(window.t).toHaveBeenCalledWith("dialogs.video.uploading")
      expect(window.t).not.toHaveBeenCalledWith("status.uploading")

      resolve()
      await inFlight
    })

    it("ignores a second drop while an upload is already in flight", async () => {
      let resolve
      const fetchSpy = vi.fn(() => new Promise((r) => {
        resolve = () => r({ ok: true, json: () => Promise.resolve({ url: "videos/clip.mp4" }) })
      }))
      global.fetch = fetchSpy

      const first = controller.onDrop(dropEvent("clip.mp4"))
      await controller.onDrop(dropEvent("clip2.mp4")) // second drop before first resolves

      expect(fetchSpy).toHaveBeenCalledTimes(1)

      resolve()
      await first
    })
  })

  describe("onDropzoneKeydown()", () => {
    it("opens the file picker on Enter", () => {
      const spy = vi.spyOn(controller, "openPicker").mockImplementation(() => {})
      controller.onDropzoneKeydown({ key: "Enter", preventDefault: vi.fn() })
      expect(spy).toHaveBeenCalled()
    })

    it("opens the file picker on Space", () => {
      const spy = vi.spyOn(controller, "openPicker").mockImplementation(() => {})
      controller.onDropzoneKeydown({ key: " ", preventDefault: vi.fn() })
      expect(spy).toHaveBeenCalled()
    })

    it("ignores other keys", () => {
      const spy = vi.spyOn(controller, "openPicker").mockImplementation(() => {})
      controller.onDropzoneKeydown({ key: "a", preventDefault: vi.fn() })
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe("openPicker() / onFileInputChange()", () => {
    it("opens the native file picker when the dropzone is clicked", () => {
      const clickSpy = vi.spyOn(controller.dropFileInputTarget, "click").mockImplementation(() => {})
      controller.openPicker()
      expect(clickSpy).toHaveBeenCalled()
    })

    it("uploads a file selected via the picker", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "videos/picked.mp4" })
      })

      await controller.onFileInputChange({
        target: { files: [ new File([ "d" ], "picked.mp4", { type: "video/mp4" }) ], value: "picked.mp4" }
      })

      expect(controller.detectedVideoType).toBe("file")
      expect(controller.detectedVideoData.url).toBe("videos/picked.mp4")
      expect(controller.dropInsertBtnTarget.disabled).toBe(false)
    })
  })

  describe("onYoutubeSearchKeydown()", () => {
    it("triggers search on Enter", () => {
      const searchSpy = vi.spyOn(controller, "searchYoutube")
      const event = { key: "Enter", preventDefault: vi.fn() }

      controller.onYoutubeSearchKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(searchSpy).toHaveBeenCalled()
    })

    it("navigates to first result on ArrowDown", () => {
      controller.youtubeSearchResultsTarget.innerHTML =
        '<button data-index="0" data-video-id="vid1" data-video-title="Video">Video</button>'
      controller.youtubeSearchResults = [
        { id: "vid1", title: "Video" }
      ]

      const event = { key: "ArrowDown", preventDefault: vi.fn() }
      controller.onYoutubeSearchKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.selectedYoutubeIndex).toBe(0)
    })
  })
})
