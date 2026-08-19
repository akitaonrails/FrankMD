/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import PreviewController from "../../../app/javascript/controllers/preview_controller.js"

describe("PreviewController", () => {
  let application, controller, element

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-controller="preview" data-preview-zoom-value="100">
        <aside data-preview-target="panel" class="hidden">
          <span data-preview-target="zoomLevel">100%</span>
          <div data-preview-target="content"></div>
        </aside>
      </div>
    `

    // Mock scrollTo and scrollIntoView
    Element.prototype.scrollTo = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()

    element = document.querySelector('[data-controller="preview"]')
    application = Application.start()
    application.register("preview", PreviewController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "preview")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("initializes zoom levels array", () => {
      expect(controller.zoomLevels).toEqual([50, 75, 90, 100, 110, 125, 150, 175, 200])
    })

    it("applies initial zoom", () => {
      expect(controller.zoomValue).toBe(100)
      expect(controller.zoomLevelTarget.textContent).toBe("100%")
    })
  })

  describe("toggle()", () => {
    it("shows hidden panel", () => {
      expect(controller.panelTarget.classList.contains("hidden")).toBe(true)

      const result = controller.toggle()

      expect(result).toBe(true)
      expect(controller.panelTarget.classList.contains("hidden")).toBe(false)
      expect(controller.panelTarget.classList.contains("flex")).toBe(true)
      expect(document.body.classList.contains("preview-visible")).toBe(true)
    })

    it("hides visible panel", () => {
      controller.panelTarget.classList.remove("hidden")
      controller.panelTarget.classList.add("flex")

      const result = controller.toggle()

      expect(result).toBe(false)
      expect(controller.panelTarget.classList.contains("hidden")).toBe(true)
      expect(controller.panelTarget.classList.contains("flex")).toBe(false)
    })

    it("dispatches toggled event", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")

      controller.toggle()

      expect(dispatchSpy).toHaveBeenCalledWith("toggled", {
        detail: { visible: true }
      })
    })
  })

  describe("show()", () => {
    it("shows the panel", () => {
      controller.show()

      expect(controller.panelTarget.classList.contains("hidden")).toBe(false)
      expect(controller.panelTarget.classList.contains("flex")).toBe(true)
    })

    it("does nothing if already visible", () => {
      controller.panelTarget.classList.remove("hidden")
      controller.panelTarget.classList.add("flex")
      const dispatchSpy = vi.spyOn(controller, "dispatch")

      controller.show()

      expect(dispatchSpy).not.toHaveBeenCalled()
    })

    it("dispatches toggled event", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")

      controller.show()

      expect(dispatchSpy).toHaveBeenCalledWith("toggled", {
        detail: { visible: true }
      })
    })
  })

  describe("hide()", () => {
    it("hides the panel", () => {
      controller.panelTarget.classList.remove("hidden")
      controller.panelTarget.classList.add("flex")

      controller.hide()

      expect(controller.panelTarget.classList.contains("hidden")).toBe(true)
      expect(controller.panelTarget.classList.contains("flex")).toBe(false)
    })

    it("does nothing if already hidden", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")

      controller.hide()

      expect(dispatchSpy).not.toHaveBeenCalled()
    })
  })

  describe("isVisible", () => {
    it("returns false when panel is hidden", () => {
      expect(controller.isVisible).toBe(false)
    })

    it("returns true when panel is visible", () => {
      controller.panelTarget.classList.remove("hidden")
      expect(controller.isVisible).toBe(true)
    })
  })

  describe("render()", () => {
    beforeEach(() => {
      controller.panelTarget.classList.remove("hidden")
    })

    it("renders markdown content", () => {
      controller.render("# Hello\n\nWorld")

      // Content now includes data-source-line attributes for scroll sync
      expect(controller.contentTarget.innerHTML).toContain("<h1")
      expect(controller.contentTarget.innerHTML).toContain("Hello</h1>")
      expect(controller.contentTarget.innerHTML).toContain("<p")
      expect(controller.contentTarget.innerHTML).toContain("World</p>")
    })

    it("does nothing when hidden", () => {
      controller.panelTarget.classList.add("hidden")
      controller.render("# Test")

      expect(controller.contentTarget.innerHTML).toBe("")
    })

    it("handles empty content", () => {
      controller.render("")
      expect(controller.contentTarget.innerHTML).toBe("")
    })

    it("sets _isUpdatingContent flag during render", () => {
      expect(controller._isUpdatingContent).toBe(false)

      controller.render("# Test")

      // Flag should be set immediately after render
      expect(controller._isUpdatingContent).toBe(true)
    })

    it("clears _isUpdatingContent flag after timeout", async () => {
      controller.render("# Test")
      expect(controller._isUpdatingContent).toBe(true)

      // Wait for the 100ms timeout to clear the flag
      await new Promise(resolve => setTimeout(resolve, 110))
      expect(controller._isUpdatingContent).toBe(false)
    })
  })

  describe("update()", () => {
    beforeEach(() => {
      controller.panelTarget.classList.remove("hidden")
    })

    it("renders content and syncs scroll", () => {
      const renderSpy = vi.spyOn(controller, "render")
      const syncSpy = vi.spyOn(controller, "syncScrollRatio")

      controller.update("# Test", { scrollRatio: 0.5 })

      expect(renderSpy).toHaveBeenCalledWith("# Test")
      expect(syncSpy).toHaveBeenCalledWith(0.5)
    })

    it("syncs to typewriter mode when specified", () => {
      const syncSpy = vi.spyOn(controller, "syncToTypewriter")

      controller.update("# Test", {
        typewriterMode: true,
        currentLine: 5,
        totalLines: 10
      })

      expect(syncSpy).toHaveBeenCalledWith(5, 10)
    })
  })

  describe("zoomIn()", () => {
    it("increases zoom to next level", () => {
      controller.zoomValue = 100
      controller.zoomIn()

      expect(controller.zoomValue).toBe(110)
    })

    it("does not exceed max zoom", () => {
      controller.zoomValue = 200
      controller.zoomIn()

      expect(controller.zoomValue).toBe(200)
    })

    it("dispatches zoom-changed event", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.zoomValue = 100

      controller.zoomIn()

      expect(dispatchSpy).toHaveBeenCalledWith("zoom-changed", {
        detail: { zoom: 110 }
      })
    })
  })

  describe("zoomOut()", () => {
    it("decreases zoom to previous level", () => {
      controller.zoomValue = 100
      controller.zoomOut()

      expect(controller.zoomValue).toBe(90)
    })

    it("does not go below min zoom", () => {
      controller.zoomValue = 50
      controller.zoomOut()

      expect(controller.zoomValue).toBe(50)
    })

    it("dispatches zoom-changed event", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.zoomValue = 100

      controller.zoomOut()

      expect(dispatchSpy).toHaveBeenCalledWith("zoom-changed", {
        detail: { zoom: 90 }
      })
    })
  })

  describe("applyZoom()", () => {
    it("applies zoom to content target", () => {
      controller.zoomValue = 125
      controller.applyZoom()

      expect(controller.contentTarget.style.fontSize).toBe("125%")
    })

    it("updates zoom level display", () => {
      controller.zoomValue = 150
      controller.applyZoom()

      expect(controller.zoomLevelTarget.textContent).toBe("150%")
    })
  })

  describe("zoomValueChanged()", () => {
    it("calls applyZoom when value changes", () => {
      const applySpy = vi.spyOn(controller, "applyZoom")

      controller.zoomValueChanged()

      expect(applySpy).toHaveBeenCalled()
    })
  })

  describe("syncScrollRatio()", () => {
    beforeEach(() => {
      controller.panelTarget.classList.remove("hidden")
      // Mock scrollHeight and clientHeight
      Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000 })
      Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400 })
    })

    it("sets scroll position based on ratio", async () => {
      controller.syncScrollRatio(0.5)

      // Wait for requestAnimationFrame
      await new Promise(resolve => setTimeout(resolve, 20))

      // scrollHeight - clientHeight = 600, 0.5 * 600 = 300
      expect(controller.contentTarget.scrollTop).toBe(300)
    })

    it("does nothing when preview is hidden", () => {
      controller.panelTarget.classList.add("hidden")

      controller.syncScrollRatio(0.5)

      expect(controller.contentTarget.scrollTop).toBe(0)
    })

    it("respects syncScrollEnabled value", () => {
      controller.syncScrollEnabledValue = false

      controller.syncScrollRatio(0.5)

      expect(controller.contentTarget.scrollTop).toBe(0)
    })

    it("scrolls to exact 0 when ratio is near 0", async () => {
      // Set scrollTop to some value first
      controller.contentTarget.scrollTop = 100

      controller.syncScrollRatio(0.005)

      // Wait for requestAnimationFrame
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(controller.contentTarget.scrollTop).toBe(0)
    })

    it("scrolls to exact bottom when ratio is near 1", async () => {
      controller.syncScrollRatio(0.995)

      // Wait for requestAnimationFrame
      await new Promise(resolve => setTimeout(resolve, 20))

      // scrollHeight - clientHeight = 600
      expect(controller.contentTarget.scrollTop).toBe(600)
    })
  })

  describe("syncToLine()", () => {
    beforeEach(() => {
      controller.panelTarget.classList.remove("hidden")
      Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000 })
      Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400 })
    })

    it("scrolls to line position", () => {
      controller.syncToLine(5, 10)

      // Line ratio = (5-1)/(10-1) = 4/9 ≈ 0.444
      // scrollHeight - clientHeight = 600
      // targetScroll ≈ 0.444 * 600 ≈ 266.67
      expect(controller.contentTarget.scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: "smooth"
      })
    })

    it("does nothing when totalLines <= 1", () => {
      controller.syncToLine(1, 1)

      expect(controller.contentTarget.scrollTo).not.toHaveBeenCalled()
    })
  })

  describe("syncToTypewriter()", () => {
    beforeEach(() => {
      Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000 })
      Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400 })
    })

    it("centers content at cursor position", () => {
      controller.syncToTypewriter(5, 10)

      // Should set scrollTop to center the line
      expect(controller.contentTarget.scrollTop).toBeGreaterThanOrEqual(0)
    })

    it("does nothing when totalLines <= 1", () => {
      const originalScrollTop = controller.contentTarget.scrollTop
      controller.syncToTypewriter(1, 1)

      expect(controller.contentTarget.scrollTop).toBe(originalScrollTop)
    })
  })

  describe("setTypewriterMode()", () => {
    it("adds typewriter class when enabled", () => {
      controller.setTypewriterMode(true)

      expect(controller.typewriterModeValue).toBe(true)
      expect(controller.contentTarget.classList.contains("preview-typewriter-mode")).toBe(true)
    })

    it("removes typewriter class when disabled", () => {
      controller.contentTarget.classList.add("preview-typewriter-mode")

      controller.setTypewriterMode(false)

      expect(controller.typewriterModeValue).toBe(false)
      expect(controller.contentTarget.classList.contains("preview-typewriter-mode")).toBe(false)
    })
  })

  describe("bidirectional scroll sync", () => {
    beforeEach(() => {
      controller.show()
      // Setup editor textarea reference
      const textarea = document.createElement("textarea")
      textarea.value = "line1\nline2\nline3\nline4\nline5"
      document.body.appendChild(textarea)
      controller.editorTextarea = textarea
    })

    describe("_notifyProgrammaticScroll()", () => {
      it("dispatches preview:programmatic-scroll (single lock lives in scroll-sync)", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller._notifyProgrammaticScroll()

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")
      })

      it("is dispatched by syncToLineSmooth (typing path)", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.syncToLineSmooth(3, 10)

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")
      })

      it("is dispatched by syncScrollRatio (editor/toggle path)", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.syncScrollRatio(0.5)

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")
      })

      it("is dispatched by syncToTypewriter", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.syncToTypewriter(3, 10)

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")
      })

      it("is dispatched by syncToLine (cursor jump)", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.syncToLine(3, 10)

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")
      })
    })

    describe("onPreviewScroll()", () => {
      it("dispatches scroll event with scroll ratio and line info", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        // Mock scroll position
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        controller.onPreviewScroll()

        expect(dispatchSpy).toHaveBeenCalledWith("scroll", {
          detail: {
            scrollRatio: 0.5,
            sourceLine: null, // No elements with data-source-line in test
            totalLines: 0,    // totalSourceLines not set
            typewriterMode: false
          }
        })
      })

      it("does not dispatch when scroll sync is disabled", () => {
        controller.syncScrollEnabledValue = false
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.onPreviewScroll()

        expect(dispatchSpy).not.toHaveBeenCalled()
      })

      it("dispatches echo scroll events (scroll-sync's single lock blocks them)", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        // Mock scroll position
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        controller.onPreviewScroll()

        // Echo blocking moved to the scroll-sync controller's lock; the preview
        // always dispatches and lets the lock decide
        expect(dispatchSpy).toHaveBeenCalledWith("scroll", expect.any(Object))
      })

      it("does not dispatch during content updates", () => {
        controller._isUpdatingContent = true
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.onPreviewScroll()

        expect(dispatchSpy).not.toHaveBeenCalled()
      })
    })

    describe("syncScrollRatio() signals programmatic scroll", () => {
      it("dispatches programmatic-scroll so scroll-sync marks its lock", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.syncScrollRatio(0.5)

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")
      })

      it("syncs (and dispatches) when no local lock exists", () => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { cb(); return 1 })

        const dispatchSpy = vi.spyOn(controller, "dispatch")

        controller.syncScrollRatio(0.5)

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")
      })
    })

    describe("_getPreviewScrollRatio()", () => {
      it("returns correct scroll ratio", () => {
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        expect(controller._getPreviewScrollRatio()).toBe(0.5)
      })

      it("returns 0 when content is not scrollable", () => {
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 0, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 100, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        expect(controller._getPreviewScrollRatio()).toBe(0)
      })
    })
  })

  describe("content caching", () => {
    beforeEach(() => {
      // Make panel visible for updateWithSync tests
      controller.panelTarget.classList.remove("hidden")
      controller.panelTarget.classList.add("flex")
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("initializes _lastRenderedContent to null", () => {
      expect(controller._lastRenderedContent).toBe(null)
    })

    it("show() invalidates content cache", () => {
      controller._lastRenderedContent = "cached content"
      controller.panelTarget.classList.add("hidden")
      controller.panelTarget.classList.remove("flex")

      controller.show()

      expect(controller._lastRenderedContent).toBe(null)
    })

    it("updateWithSync skips DOM update when content unchanged", () => {
      const renderSpy = vi.spyOn(controller, "render")

      // First call - should render
      controller.updateWithSync("# Hello", { cursorPos: 0 })
      vi.advanceTimersByTime(200)
      expect(renderSpy).toHaveBeenCalledTimes(1)
      expect(controller._lastRenderedContent).toBe("# Hello")

      // Second call with same content - should skip render
      controller.updateWithSync("# Hello", { cursorPos: 0 })
      vi.advanceTimersByTime(200)
      // render called only once (from first call)
      expect(renderSpy).toHaveBeenCalledTimes(1)
    })

    it("updateWithSync renders when content changes", () => {
      const renderSpy = vi.spyOn(controller, "render")

      // First call
      controller.updateWithSync("# Hello", { cursorPos: 0 })
      vi.advanceTimersByTime(200)
      expect(renderSpy).toHaveBeenCalledTimes(1)

      // Second call with different content - should render
      controller.updateWithSync("# Hello World", { cursorPos: 0 })
      vi.advanceTimersByTime(200)
      expect(renderSpy).toHaveBeenCalledTimes(2)
    })

    it("updateWithSync still syncs scroll when content unchanged but line changes", () => {
      const syncSpy = vi.spyOn(controller, "syncToLineSmooth")

      // First call - establishes content and line
      controller.updateWithSync("# Hello\n\nWorld", { cursorPos: 0 })
      vi.advanceTimersByTime(200)
      controller._lastSyncedLine = 1
      controller._lastSyncedTotalLines = 3

      // Second call with same content but cursor on different line
      controller.updateWithSync("# Hello\n\nWorld", { cursorPos: 10 }) // cursor after newlines
      vi.advanceTimersByTime(200)

      // Should have called sync (line changed from 1 to 3)
      expect(syncSpy).toHaveBeenCalled()
    })
  })

  describe("scroll sync isolation", () => {
    // These tests ensure that content updates do NOT trigger unwanted scroll sync
    // The editor should only sync to preview via explicit scroll events
    // The preview should only sync to editor when user explicitly scrolls the preview

    beforeEach(() => {
      controller.panelTarget.classList.remove("hidden")
      controller.panelTarget.classList.add("flex")
    })

    describe("content update isolation", () => {
      it("render() sets _isUpdatingContent to true immediately", () => {
        expect(controller._isUpdatingContent).toBe(false)

        controller.render("# Test content")

        expect(controller._isUpdatingContent).toBe(true)
      })

      it("render() clears _isUpdatingContent after 100ms", async () => {
        controller.render("# Test content")
        expect(controller._isUpdatingContent).toBe(true)

        // Wait for timeout (100ms + buffer)
        await new Promise(resolve => setTimeout(resolve, 110))

        expect(controller._isUpdatingContent).toBe(false)
      })

      it("onPreviewScroll does not dispatch when _isUpdatingContent is true", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        // Simulate content update in progress
        controller._isUpdatingContent = true

        // Mock scroll position
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        controller.onPreviewScroll()

        expect(dispatchSpy).not.toHaveBeenCalled()
      })

      it("onPreviewScroll dispatches when _isUpdatingContent is false", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        // Ensure content update is NOT in progress
        controller._isUpdatingContent = false
        controller._scrollSource = null

        // Mock scroll position
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        controller.onPreviewScroll()

        expect(dispatchSpy).toHaveBeenCalledWith("scroll", expect.any(Object))
      })

      it("multiple rapid renders extend the content update window", async () => {
        // First render
        controller.render("# First")
        expect(controller._isUpdatingContent).toBe(true)

        // Wait 50ms (less than 100ms timeout)
        await new Promise(resolve => setTimeout(resolve, 50))

        // Second render should reset the timeout
        controller.render("# Second")
        expect(controller._isUpdatingContent).toBe(true)

        // Wait another 50ms (100ms total from first render, but only 50ms from second)
        await new Promise(resolve => setTimeout(resolve, 50))

        // Should still be updating because second render reset the timer
        expect(controller._isUpdatingContent).toBe(true)

        // Wait for full timeout from second render
        await new Promise(resolve => setTimeout(resolve, 60))

        expect(controller._isUpdatingContent).toBe(false)
      })
    })

    describe("scroll source tracking (delegated to scroll-sync)", () => {
      it("no longer keeps a private _scrollSource lock", () => {
        expect(controller._scrollSource).toBeUndefined()
      })

      it("echo scroll events dispatch and rely on scroll-sync's lock", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { cb(); return 1 })

        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400, configurable: true })

        // Editor-driven sync: marks scroll-sync's lock via the event
        controller.syncScrollRatio(0.5)
        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")

        // Preview scroll event fires (from the sync animation): dispatched,
        // scroll-sync's lock is responsible for not re-scrolling the editor
        controller.onPreviewScroll()
        expect(dispatchSpy).toHaveBeenCalledWith("scroll", expect.any(Object))
      })
    })

    describe("edge case handling", () => {
      beforeEach(() => {
        // Mock RAF to execute immediately
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { cb(); return 1 })
        // Mock scroll properties
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400, configurable: true })
      })

      it("syncScrollRatio scrolls to exact 0 when ratio is near 0", () => {
        controller.contentTarget.scrollTop = 100 // Start at non-zero

        controller.syncScrollRatio(0.005)

        expect(controller.contentTarget.scrollTop).toBe(0)
      })

      it("syncScrollRatio scrolls to exact bottom when ratio is near 1", () => {
        controller.syncScrollRatio(0.995)

        // scrollHeight - clientHeight = 600
        expect(controller.contentTarget.scrollTop).toBe(600)
      })

      it("syncScrollRatio handles ratio of exactly 0", () => {
        controller.contentTarget.scrollTop = 100

        controller.syncScrollRatio(0)

        expect(controller.contentTarget.scrollTop).toBe(0)
      })

      it("syncScrollRatio handles ratio of exactly 1", () => {
        controller.syncScrollRatio(1)

        expect(controller.contentTarget.scrollTop).toBe(600)
      })
    })

    describe("combined scenarios", () => {
      it("typing scenario: render does not cause editor sync", async () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        // Simulate typing: content is rendered
        controller.render("# Hello World")

        // Content update flag should prevent scroll dispatch
        expect(controller._isUpdatingContent).toBe(true)

        // Mock scroll position (as if DOM changed and scrolled)
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        // Trigger scroll event (simulating browser behavior when DOM changes)
        controller.onPreviewScroll()

        // Should NOT dispatch because we're in content update mode
        expect(dispatchSpy).not.toHaveBeenCalled()
      })

      it("explicit user scroll: preview dispatches after content update settles", async () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")

        // Simulate content render completing
        controller.render("# Hello World")

        // Wait for content update flag to clear
        await new Promise(resolve => setTimeout(resolve, 110))

        expect(controller._isUpdatingContent).toBe(false)

        // Mock scroll position
        Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

        // Now user explicitly scrolls preview
        controller.onPreviewScroll()

        // Should dispatch because content update is complete
        // totalLines is 1 because render() calculated it from "# Hello World"
        expect(dispatchSpy).toHaveBeenCalledWith("scroll", {
          detail: {
            scrollRatio: 0.5,
            sourceLine: null,
            totalLines: 1,
            typewriterMode: false
          }
        })
      })

      it("editor scroll then preview scroll: single lock prevents feedback loop", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { cb(); return 1 })

        Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000, configurable: true })
        Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400, configurable: true })

        // Editor syncs to preview: preview notifies scroll-sync (single lock)
        controller.syncScrollRatio(0.5)

        expect(dispatchSpy).toHaveBeenCalledWith("programmatic-scroll")

        // Preview scroll event fires (from the sync animation): dispatched as a
        // normal scroll event; scroll-sync's lock blocks it from re-scrolling
        // the editor
        controller.onPreviewScroll()

        expect(dispatchSpy).toHaveBeenCalledWith("scroll", expect.any(Object))
      })
    })
  })

  describe("unified line mapping (typing path and scroll path share anchors)", () => {
    let h1First, h1Second

    const mockRects = (pageOffset) => {
      const content = controller.contentTarget
      content.getBoundingClientRect = () => ({ top: pageOffset, left: 0, right: 400, bottom: pageOffset + 500, width: 400, height: 500 })
      const rectFor = (top) => () => ({ top: pageOffset + top, left: 0, right: 400, bottom: pageOffset + top + 20, width: 400, height: 20 })
      h1First.getBoundingClientRect = rectFor(0)
      h1Second.getBoundingClientRect = rectFor(100)
    }

    beforeEach(() => {
      controller.show()
      controller.render("# First\n\n# Second\n\n")

      h1First = controller.contentTarget.querySelector('[data-source-line="1"]')
      h1Second = controller.contentTarget.querySelector('[data-source-line="3"]')
      expect(h1First).toBeTruthy()
      expect(h1Second).toBeTruthy()

      Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000, configurable: true })
      Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400, configurable: true })
      vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { cb(); return 1 })
    })

    it("typing path anchors on the element with the cursor's source line", () => {
      mockRects(0)

      // Cursor on source line 3 ("# Second")
      controller.syncToLineSmooth(3, 4)

      // Element top 100 - 50px padding
      expect(controller.contentTarget.scrollTo).toHaveBeenCalledWith({ top: 50, behavior: "smooth" })
    })

    it("scroll path anchors on the same element for the same line", () => {
      mockRects(0)

      // Ratio that maps to source line 3 (round(0.5 * 4) + 1 = 3)
      controller.syncScrollRatio(0.5)

      // Same anchor element (top 100), positioned at the viewport top
      expect(controller.contentTarget.scrollTop).toBe(100)
    })

    it("both paths are invariant to the container's page offset", () => {
      mockRects(5000)

      controller.syncToLineSmooth(3, 4)
      expect(controller.contentTarget.scrollTo).toHaveBeenCalledWith({ top: 50, behavior: "smooth" })

      controller.syncScrollRatio(0.5)
      expect(controller.contentTarget.scrollTop).toBe(100)
    })

    it("typing path accounts for stripped frontmatter via absolute line anchors", () => {
      // Re-render with 4 lines of frontmatter: body starts at source line 5
      controller.render("---\ntitle: Test\n---\n\n# First\n\n# Second\n\n")
      h1First = controller.contentTarget.querySelector('[data-source-line="5"]')
      h1Second = controller.contentTarget.querySelector('[data-source-line="7"]')
      expect(h1First).toBeTruthy()
      expect(h1Second).toBeTruthy()

      mockRects(0)

      // Editor cursor on absolute line 7 ("# Second" after frontmatter)
      controller.syncToLineSmooth(7, 9)

      expect(controller.contentTarget.scrollTo).toHaveBeenCalledWith({ top: 50, behavior: "smooth" })
    })

    it("falls back to element-count ratio when no line annotations exist", () => {
      controller.contentTarget.querySelectorAll("[data-source-line]").forEach(el => {
        el.removeAttribute("data-source-line")
      })
      mockRects(0)

      // Line 3 of 4 -> ratio 0.5 -> element index 1 of 2 (top 100) - padding 50
      controller.syncToLineSmooth(3, 4)

      expect(controller.contentTarget.scrollTo).toHaveBeenCalledWith({ top: 50, behavior: "smooth" })
    })

    it("prefers an explicit source line over the ratio-derived line", () => {
      mockRects(0)

      // Ratio 0.5 alone would derive line 3; explicit line 1 wins
      controller.syncScrollRatio(0.5, 1)

      expect(controller.contentTarget.scrollTop).toBe(0)
    })
  })

  describe("scroll sync toggle (syncScrollEnabledValue)", () => {
    beforeEach(() => {
      controller.show()
      Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 1000, configurable: true })
      Object.defineProperty(controller.contentTarget, "clientHeight", { value: 400, configurable: true })
      vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { cb(); return 1 })
    })

    it("value=false blocks editor -> preview sync (ratio path)", () => {
      controller.syncScrollEnabledValue = false

      controller.syncScrollRatio(0.5)

      expect(controller.contentTarget.scrollTop).toBe(0)
    })

    it("value=false blocks editor -> preview sync (typing path)", () => {
      controller.syncScrollEnabledValue = false

      controller.syncToLineSmooth(3, 10)

      expect(controller.contentTarget.scrollTo).not.toHaveBeenCalled()
    })

    it("value=false blocks preview -> editor sync", () => {
      controller.syncScrollEnabledValue = false
      const dispatchSpy = vi.spyOn(controller, "dispatch")

      Object.defineProperty(controller.contentTarget, "scrollTop", { value: 50, configurable: true })
      Object.defineProperty(controller.contentTarget, "scrollHeight", { value: 200, configurable: true })
      Object.defineProperty(controller.contentTarget, "clientHeight", { value: 100, configurable: true })

      controller.onPreviewScroll()

      expect(dispatchSpy).not.toHaveBeenCalled()
    })

    it("value=false blocks typewriter sync", () => {
      controller.syncScrollEnabledValue = false

      controller.syncToTypewriter(5, 10)

      expect(controller.contentTarget.scrollTo).not.toHaveBeenCalled()
    })
  })
})
