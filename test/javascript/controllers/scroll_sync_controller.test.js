/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Application } from "@hotwired/stimulus"
import ScrollSyncController from "../../../app/javascript/controllers/scroll_sync_controller"

vi.mock("lib/codemirror_adapter", () => ({
  getEditorContent: vi.fn((cm, ta) => cm ? cm.getValue() : "")
}))

describe("ScrollSyncController", () => {
  let application
  let container
  let controller

  const mockPreviewController = {
    isVisible: true,
    hasContentTarget: true,
    contentTarget: null,
    getTopSourceLine: vi.fn(() => null),
    syncScrollRatio: vi.fn(),
    syncToCursor: vi.fn(),
    render: vi.fn(),
    updateWithSync: vi.fn(),
    getScrollRatio: vi.fn(() => 0),
  }

  const mockCodemirrorController = {
    getValue: vi.fn(() => "# Hello"),
    getCursorPosition: vi.fn(() => ({ offset: 0 })),
    getScrollRatio: vi.fn(() => 0.5),
    getTopVisibleLine: vi.fn(() => 1),
    scrollToLine: vi.fn(),
    getScrollInfo: vi.fn(() => ({ top: 0, height: 1000, clientHeight: 500 })),
    scrollTo: vi.fn(),
  }

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="scroll-sync"></div>
    `

    container = document.querySelector('[data-controller="scroll-sync"]')

    application = Application.start()
    application.register("scroll-sync", ScrollSyncController)

    await new Promise((resolve) => setTimeout(resolve, 10))
    controller = application.getControllerForElementAndIdentifier(container, "scroll-sync")

    // Override controller lookups
    controller.getPreviewController = () => mockPreviewController
    controller.getCodemirrorController = () => mockCodemirrorController

    // Reset mocks (and any mockReturnValue overrides from previous tests)
    vi.clearAllMocks()
    mockCodemirrorController.getScrollInfo.mockReturnValue({ top: 0, height: 1000, clientHeight: 500 })
    mockCodemirrorController.getScrollRatio.mockReturnValue(0.5)
    mockCodemirrorController.getTopVisibleLine.mockReturnValue(1)
    mockPreviewController.getTopSourceLine.mockReturnValue(null)
  })

  afterEach(() => {
    if (controller && controller._scrollSourceTimeout) {
      clearTimeout(controller._scrollSourceTimeout)
    }
    if (controller && controller._resizeTimeout) {
      clearTimeout(controller._resizeTimeout)
    }
    if (controller && controller._previewResizeObserver) {
      controller._previewResizeObserver.disconnect()
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    application.stop()
    document.body.innerHTML = ""
  })

  describe("onEditorScroll()", () => {
    it("syncs preview scroll ratio with the editor's top visible line", () => {
      mockCodemirrorController.getTopVisibleLine.mockReturnValue(7)

      controller.onEditorScroll({ detail: { scrollRatio: 0.5 } })

      expect(mockPreviewController.syncScrollRatio).toHaveBeenCalledWith(0.5, 7)
    })

    it("passes null line when the editor lacks line info (ratio fallback)", () => {
      mockCodemirrorController.getTopVisibleLine.mockReturnValue(undefined)

      controller.onEditorScroll({ detail: { scrollRatio: 0.5 } })

      expect(mockPreviewController.syncScrollRatio).toHaveBeenCalledWith(0.5, null)
    })

    it("does not sync when preview is not visible", () => {
      mockPreviewController.isVisible = false

      controller.onEditorScroll({ detail: { scrollRatio: 0.5 } })

      expect(mockPreviewController.syncScrollRatio).not.toHaveBeenCalled()
      mockPreviewController.isVisible = true
    })

    it("does not sync when scroll source is preview (feedback loop prevention)", () => {
      controller._scrollSource = "preview"

      controller.onEditorScroll({ detail: { scrollRatio: 0.5 } })

      expect(mockPreviewController.syncScrollRatio).not.toHaveBeenCalled()
    })

    it("marks scroll source as editor", () => {
      controller.onEditorScroll({ detail: { scrollRatio: 0.5 } })

      expect(controller._scrollSource).toBe("editor")
    })
  })

  describe("onPreviewScroll()", () => {
    it("syncs editor scroll position based on ratio", () => {
      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })

      expect(mockCodemirrorController.scrollTo).toHaveBeenCalled()
    })

    it("does not sync when scroll source is editor (feedback loop prevention)", () => {
      controller._scrollSource = "editor"

      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })

      expect(mockCodemirrorController.scrollTo).not.toHaveBeenCalled()
      expect(mockCodemirrorController.scrollToLine).not.toHaveBeenCalled()
    })

    it("scrolls to top when scrollRatio is near 0", () => {
      // Set top to non-zero so the scroll call triggers
      mockCodemirrorController.getScrollInfo.mockReturnValue({
        top: 100, height: 1000, clientHeight: 500
      })

      controller.onPreviewScroll({
        detail: { scrollRatio: 0.005, sourceLine: null, totalLines: 0 }
      })

      expect(mockCodemirrorController.scrollTo).toHaveBeenCalledWith(0)
    })

    it("scrolls to bottom when scrollRatio is near 1", () => {
      mockCodemirrorController.getScrollInfo.mockReturnValue({
        top: 0, height: 1000, clientHeight: 500
      })

      controller.onPreviewScroll({
        detail: { scrollRatio: 0.995, sourceLine: null, totalLines: 0 }
      })

      expect(mockCodemirrorController.scrollTo).toHaveBeenCalledWith(500) // maxScroll
    })

    it("uses line-anchored scrollToLine when sourceLine is available", () => {
      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: 50, totalLines: 100 }
      })

      expect(mockCodemirrorController.scrollToLine).toHaveBeenCalledWith(50)
      expect(mockCodemirrorController.scrollTo).not.toHaveBeenCalled()
    })

    it("does not scroll when maxScroll is 0", () => {
      mockCodemirrorController.getScrollInfo.mockReturnValue({
        top: 0, height: 500, clientHeight: 500
      })

      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })

      expect(mockCodemirrorController.scrollTo).not.toHaveBeenCalled()
    })

    it("marks scroll source as preview", () => {
      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })

      expect(controller._scrollSource).toBe("preview")
    })
  })

  describe("onProgrammaticPreviewScroll()", () => {
    it("marks the single lock as editor-initiated", () => {
      controller.onProgrammaticPreviewScroll()

      expect(controller._scrollSource).toBe("editor")
    })

    it("typing-path programmatic scroll blocks late preview echo from re-scrolling the editor", () => {
      // Preview controller signals a programmatic scroll (typing path)
      controller.onProgrammaticPreviewScroll()

      // Late preview scroll event (e.g. smooth-scroll animation tail)
      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })

      expect(mockCodemirrorController.scrollTo).not.toHaveBeenCalled()
      expect(mockCodemirrorController.scrollToLine).not.toHaveBeenCalled()
    })

    it("genuine user scroll after the lock expires syncs the editor", async () => {
      controller.onProgrammaticPreviewScroll()

      // Lock expires after 400ms
      await new Promise((resolve) => setTimeout(resolve, 450))
      expect(controller._scrollSource).toBeNull()

      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })

      expect(mockCodemirrorController.scrollTo).toHaveBeenCalled()
    })
  })

  describe("feedback loop prevention", () => {
    it("editor scroll does not trigger reverse sync", () => {
      // Editor scrolls first
      controller.onEditorScroll({ detail: { scrollRatio: 0.5 } })
      expect(controller._scrollSource).toBe("editor")

      // Preview scroll should be blocked
      controller.onPreviewScroll({
        detail: { scrollRatio: 0.3, sourceLine: null, totalLines: 0 }
      })
      expect(mockCodemirrorController.scrollTo).not.toHaveBeenCalled()
    })

    it("scroll source clears after timeout", async () => {
      controller.onEditorScroll({ detail: { scrollRatio: 0.5 } })
      expect(controller._scrollSource).toBe("editor")

      // Wait for timeout (400ms)
      await new Promise((resolve) => setTimeout(resolve, 450))

      expect(controller._scrollSource).toBeNull()
    })
  })

  describe("updatePreviewWithSync()", () => {
    it("renders content without sync in normal mode", () => {
      controller.typewriterModeEnabled = false

      controller.updatePreviewWithSync()

      expect(mockPreviewController.render).toHaveBeenCalled()
      expect(mockPreviewController.updateWithSync).not.toHaveBeenCalled()
    })

    it("uses updateWithSync in typewriter mode", () => {
      controller.typewriterModeEnabled = true

      controller.updatePreviewWithSync()

      expect(mockPreviewController.updateWithSync).toHaveBeenCalled()
      expect(mockPreviewController.render).not.toHaveBeenCalled()
    })

    it("does nothing when preview is not visible", () => {
      mockPreviewController.isVisible = false

      controller.updatePreviewWithSync()

      expect(mockPreviewController.render).not.toHaveBeenCalled()
      mockPreviewController.isVisible = true
    })
  })

  describe("updatePreview()", () => {
    it("renders content via preview controller", () => {
      controller.updatePreview()

      expect(mockPreviewController.render).toHaveBeenCalled()
    })

    it("does nothing when preview is not visible", () => {
      mockPreviewController.isVisible = false

      controller.updatePreview()

      expect(mockPreviewController.render).not.toHaveBeenCalled()
      mockPreviewController.isVisible = true
    })
  })

  describe("onPreviewToggled()", () => {
    it("updates preview and syncs scroll with the editor's top line when preview becomes visible", () => {
      mockCodemirrorController.getTopVisibleLine.mockReturnValue(9)

      controller.onPreviewToggled({ detail: { visible: true } })

      expect(mockPreviewController.render).toHaveBeenCalled()
      expect(mockPreviewController.syncScrollRatio).toHaveBeenCalledWith(0.5, 9)
    })

    it("does nothing when preview is hidden", () => {
      controller.onPreviewToggled({ detail: { visible: false } })

      expect(mockPreviewController.render).not.toHaveBeenCalled()
      expect(mockPreviewController.syncScrollRatio).not.toHaveBeenCalled()
    })

    it("holds the lock for the re-sync echo, then clears it so user scroll isn't swallowed", async () => {
      controller.onPreviewToggled({ detail: { visible: true } })

      // Echo of the toggle re-sync is blocked while the lock is held
      expect(controller._scrollSource).toBe("editor")
      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })
      expect(mockCodemirrorController.scrollTo).not.toHaveBeenCalled()

      // Lock clears on the next animation frames (before the 400ms timeout)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      expect(controller._scrollSource).toBeNull()

      // User scroll right after the toggle now syncs the editor
      controller.onPreviewScroll({
        detail: { scrollRatio: 0.5, sourceLine: null, totalLines: 0 }
      })
      expect(mockCodemirrorController.scrollTo).toHaveBeenCalled()
    })
  })

  describe("onTypewriterToggled()", () => {
    it("tracks typewriter mode state", () => {
      controller.onTypewriterToggled({ detail: { enabled: true } })
      expect(controller.typewriterModeEnabled).toBe(true)

      controller.onTypewriterToggled({ detail: { enabled: false } })
      expect(controller.typewriterModeEnabled).toBe(false)
    })
  })

  describe("re-anchoring after resize", () => {
    it("zoom change re-anchors the preview to the editor's top line (editor lock held)", () => {
      mockCodemirrorController.getTopVisibleLine.mockReturnValue(7)
      controller._markScrollFromEditor()

      controller.onPreviewZoomChanged()

      expect(mockPreviewController.syncScrollRatio).toHaveBeenCalledWith(0.5, 7)
    })

    it("zoom change re-anchors the editor to the preview's top line (preview lock held)", () => {
      mockPreviewController.getTopSourceLine.mockReturnValue(12)
      controller._markScrollFromPreview()

      controller.onPreviewZoomChanged()

      expect(mockCodemirrorController.scrollToLine).toHaveBeenCalledWith(12)
    })

    it("zoom change falls back to ratio when the preview has no line annotations", () => {
      mockPreviewController.getTopSourceLine.mockReturnValue(null)
      controller._markScrollFromPreview()

      const content = document.createElement("div")
      Object.defineProperty(content, "scrollHeight", { value: 1000, configurable: true })
      Object.defineProperty(content, "clientHeight", { value: 500, configurable: true })
      content.scrollTop = 250
      mockPreviewController.contentTarget = content

      controller.onPreviewZoomChanged()

      // preview ratio 0.5 * editor maxScroll 500 = 250
      expect(mockCodemirrorController.scrollTo).toHaveBeenCalledWith(250)
    })

    it("debounced window resize re-anchors both panes", async () => {
      mockCodemirrorController.getTopVisibleLine.mockReturnValue(3)

      window.dispatchEvent(new Event("resize"))
      expect(mockPreviewController.syncScrollRatio).not.toHaveBeenCalled()

      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(mockPreviewController.syncScrollRatio).toHaveBeenCalledWith(0.5, 3)
    })

    it("ResizeObserver on preview content re-anchors while a lock is held", () => {
      const instances = []
      class MockResizeObserver {
        constructor(cb) { this.cb = cb; instances.push(this) }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      vi.stubGlobal("ResizeObserver", MockResizeObserver)

      const content = document.createElement("div")
      mockPreviewController.contentTarget = content
      controller._setupPreviewResizeObserver()

      expect(instances).toHaveLength(1)

      mockCodemirrorController.getTopVisibleLine.mockReturnValue(7)
      controller._markScrollFromEditor()

      // Simulate the observer firing (image loaded, preview reflowed)
      instances[0].cb()

      expect(mockPreviewController.syncScrollRatio).toHaveBeenCalledWith(0.5, 7)
    })
  })
})
