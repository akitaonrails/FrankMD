/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import PathDisplayController from "../../../app/javascript/controllers/path_display_controller.js"

// Mock window.t translation function
global.window = global.window || {}
window.t = (key) => key

describe("PathDisplayController", () => {
  let application, controller, element

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-controller="path-display" class="path-container">
        <span data-path-display-target="text" class="path-text">Select a note</span>
      </div>
    `

    // Mock navigator.clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      configurable: true
    })

    element = document.querySelector('[data-controller="path-display"]')
    application = Application.start()
    application.register("path-display", PathDisplayController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "path-display")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("sets up resize listener", () => {
      expect(controller.resizeHandler).toBeDefined()
    })
  })

  describe("update()", () => {
    it("shows select note message for null path", () => {
      controller.update(null)

      expect(controller.textTarget.textContent).toBe("editor.select_note")
      expect(controller.textTarget.dataset.fullPath).toBe("")
    })

    it("stores full path in dataset", () => {
      controller.update("folder/test.md")

      expect(controller.textTarget.dataset.fullPath).toBe("folder/test.md")
    })

    it("shows full path when it fits", () => {
      // Mock element dimensions
      Object.defineProperty(element.parentElement, "clientWidth", { value: 500 })

      controller.update("short.md")

      expect(controller.textTarget.textContent).toBe("short.md")
      expect(element.classList.contains("truncated")).toBe(false)
    })
  })

  it("shows a basename while preserving the full path for tooltips and copying", async () => {
    controller.basenameValue = true
    controller.renameLabelValue = "Rename document"
    controller.update("nested/<note>.md")
    expect(controller.textTarget.textContent).toBe("<note>")
    expect(element.title).toBe("nested/<note>.md")
    expect(element.getAttribute("aria-label")).toBe("Rename document: <note>")
    expect(element.querySelector("note")).toBeNull()
    controller.copy()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("nested/<note>.md")
    controller.update(null)
    expect(element.title).toBe("editor.select_note")
  })

  describe("copy()", () => {
    it("copies full path to clipboard", async () => {
      controller.textTarget.dataset.fullPath = "folder/test.md"

      controller.copy()

      await vi.waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("folder/test.md")
      })
    })

    it("does nothing if no path stored", () => {
      controller.textTarget.dataset.fullPath = ""

      controller.copy()

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    })

    it("shows toast notification temporarily", async () => {
      vi.useFakeTimers()
      controller.textTarget.dataset.fullPath = "test.md"

      controller.copy()

      // Wait for clipboard promise to resolve
      await vi.waitFor(() => {
        const toast = document.getElementById("app-toast")
        expect(toast).toBeTruthy()
        expect(toast.textContent).toBe("status.copied_to_clipboard")
      })

      // Toast should be removed after duration + fade out time
      vi.advanceTimersByTime(2300)
      expect(document.getElementById("app-toast")).toBeFalsy()

      vi.useRealTimers()
    })
  })

  describe("showFull()", () => {
    it("does nothing if not truncated", () => {
      controller.textTarget.dataset.fullPath = "short.md"
      controller.textTarget.textContent = "short.md"
      element.classList.remove("truncated")

      controller.showFull()

      expect(controller.textTarget.textContent).toBe("short.md")
    })

    it("shows full path when truncated", () => {
      controller.textTarget.dataset.fullPath = "very/long/path/file.md"
      controller.textTarget.textContent = "...file.md"
      element.classList.add("truncated")

      controller.showFull()

      expect(controller.textTarget.textContent).toBe("very/long/path/file.md")
    })
  })

  describe("hideFull()", () => {
    it("restores truncated path", () => {
      const updateSpy = vi.spyOn(controller, "update")
      controller.textTarget.dataset.fullPath = "very/long/path/file.md"

      controller.hideFull()

      expect(updateSpy).toHaveBeenCalledWith("very/long/path/file.md")
    })
  })

  describe("debounce()", () => {
    it("debounces function calls", () => {
      vi.useFakeTimers()
      const fn = vi.fn()
      const debounced = controller.debounce(fn, 100)

      debounced()
      debounced()
      debounced()

      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)

      expect(fn).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })
})
