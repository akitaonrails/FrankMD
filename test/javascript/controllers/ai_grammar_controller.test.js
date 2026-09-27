/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
vi.mock("lib/app_prompt", () => ({ appAlert: vi.fn().mockResolvedValue(undefined) }))
import { Application } from "@hotwired/stimulus"
import AiGrammarController from "../../../app/javascript/controllers/ai_grammar_controller.js"
import { appAlert } from "lib/app_prompt"

describe("AiGrammarController", () => {
  let application, controller, element

  // Mock window.t for translations
  beforeEach(() => {
    vi.clearAllMocks()
    appAlert.mockResolvedValue(undefined)
    window.t = vi.fn((key) => key)

    document.body.innerHTML = `
      <div data-controller="ai-grammar">
        <dialog data-ai-grammar-target="dialog"></dialog>
        <div data-ai-grammar-target="configNotice" class="hidden"></div>
        <div data-ai-grammar-target="diffContent" class="hidden"></div>
        <div data-ai-grammar-target="originalText"></div>
        <textarea data-ai-grammar-target="correctedText"></textarea>
        <div data-ai-grammar-target="correctedDiff"></div>
        <span data-ai-grammar-target="providerBadge" class="hidden"></span>
        <button data-ai-grammar-target="editToggle"></button>
        <div data-ai-grammar-target="processingOverlay" class="hidden"></div>
        <span data-ai-grammar-target="processingProvider"></span>
      </div>
    `

    // Mock showModal and close for dialog
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.open = false
    })

    element = document.querySelector('[data-controller="ai-grammar"]')
    application = Application.start()
    application.register("ai-grammar", AiGrammarController)

    // Get controller instance
    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "ai-grammar")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("initializes AI state as disabled", () => {
      expect(controller.aiEnabled).toBe(false)
      expect(controller.aiProvider).toBe(null)
      expect(controller.aiModel).toBe(null)
    })

    it("calls checkAiAvailability on connect", async () => {
      const checkSpy = vi.spyOn(controller, "checkAiAvailability")
      controller.connect()
      expect(checkSpy).toHaveBeenCalled()
    })
  })

  describe("checkAiAvailability()", () => {
    it("sets aiEnabled to true when API returns enabled", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          enabled: true,
          provider: "openai",
          model: "gpt-4"
        })
      })

      await controller.checkAiAvailability()

      expect(controller.aiEnabled).toBe(true)
      expect(controller.aiProvider).toBe("openai")
      expect(controller.aiModel).toBe("gpt-4")
    })

    it("sets aiEnabled to false when API returns disabled", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          enabled: false,
          provider: null,
          model: null
        })
      })

      await controller.checkAiAvailability()

      expect(controller.aiEnabled).toBe(false)
    })

    it("handles API errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      await controller.checkAiAvailability()

      expect(controller.aiEnabled).toBe(false)
      expect(controller.aiProvider).toBe(null)
      expect(controller.aiModel).toBe(null)
    })
  })

  describe("open()", () => {
    it("shows config notice when AI is not enabled", async () => {
      controller.aiEnabled = false
      await controller.open("/path/to/file.md")

      expect(controller.configNoticeTarget.classList.contains("hidden")).toBe(false)
      expect(controller.diffContentTarget.classList.contains("hidden")).toBe(true)
      expect(controller.dialogTarget.showModal).toHaveBeenCalled()
    })

    it("uses the shared app alert when no file path is provided", async () => {
      controller.aiEnabled = true

      await controller.open(null)

      expect(appAlert).toHaveBeenCalledWith("errors.no_file_open")
    })

    it("dispatches processing-started event", async () => {
      controller.aiEnabled = true
      const dispatchSpy = vi.spyOn(controller, "dispatch")

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          original: "test",
          corrected: "test",
          provider: "openai",
          model: "gpt-4"
        })
      })

      await controller.open("/path/to/file.md")

      expect(dispatchSpy).toHaveBeenCalledWith("processing-started")
    })

    it("shows processing overlay when AI is enabled", async () => {
      controller.aiEnabled = true
      controller.aiProvider = "openai"
      controller.aiModel = "gpt-4"

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          original: "test",
          corrected: "test corrected",
          provider: "openai",
          model: "gpt-4"
        })
      })

      await controller.open("/path/to/file.md")

      // Overlay should be hidden after completion (cleanup runs)
      expect(controller.processingOverlayTarget.classList.contains("hidden")).toBe(true)
    })

    it("handles API errors", async () => {
      controller.aiEnabled = true

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          error: "AI service unavailable"
        })
      })

      await controller.open("/path/to/file.md")

      expect(appAlert).toHaveBeenCalledWith("errors.failed_to_process_ai: AI service unavailable")
    })

    it("populates diff content on success", async () => {
      controller.aiEnabled = true

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          original: "Hello wrold",
          corrected: "Hello world",
          provider: "openai",
          model: "gpt-4"
        })
      })

      await controller.open("/path/to/file.md")

      expect(controller.correctedTextTarget.value).toBe("Hello world")
      expect(controller.dialogTarget.showModal).toHaveBeenCalled()
    })
  })

  describe("close()", () => {
    it("closes the dialog", () => {
      controller.close()
      expect(controller.dialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("toggleEditMode()", () => {
    it("switches from diff view to edit view", () => {
      controller.correctedDiffTarget.classList.remove("hidden")
      controller.correctedTextTarget.classList.add("hidden")

      controller.toggleEditMode()

      expect(controller.correctedDiffTarget.classList.contains("hidden")).toBe(true)
      expect(controller.correctedTextTarget.classList.contains("hidden")).toBe(false)
      expect(controller.editToggleTarget.textContent).toBe("preview.title")
    })

    it("switches from edit view to diff view", () => {
      controller.correctedDiffTarget.classList.add("hidden")
      controller.correctedTextTarget.classList.remove("hidden")

      controller.toggleEditMode()

      expect(controller.correctedDiffTarget.classList.contains("hidden")).toBe(false)
      expect(controller.correctedTextTarget.classList.contains("hidden")).toBe(true)
      expect(controller.editToggleTarget.textContent).toBe("common.edit")
    })
  })

  describe("accept()", () => {
    it("dispatches accepted event with corrected text", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.correctedTextTarget.value = "Corrected text content"

      controller.accept()

      expect(dispatchSpy).toHaveBeenCalledWith("accepted", {
        detail: { correctedText: "Corrected text content" }
      })
    })

    it("closes the dialog after accepting", () => {
      const closeSpy = vi.spyOn(controller, "close")
      controller.accept()
      expect(closeSpy).toHaveBeenCalled()
    })
  })

  describe("cleanup()", () => {
    it("hides processing overlay", () => {
      controller.processingOverlayTarget.classList.remove("hidden")

      controller.cleanup()

      expect(controller.processingOverlayTarget.classList.contains("hidden")).toBe(true)
    })

    it("dispatches processing-ended event", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")

      controller.cleanup()

      expect(dispatchSpy).toHaveBeenCalledWith("processing-ended")
    })

    it("clears abort controller", () => {
      controller.aiAbortController = new AbortController()

      controller.cleanup()

      expect(controller.aiAbortController).toBe(null)
    })
  })

  describe("escapeHtml()", () => {
    it("escapes HTML special characters", () => {
      const escaped = controller.escapeHtml('<script>alert("xss")</script>')
      expect(escaped).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;")
    })

    it("escapes ampersands", () => {
      const escaped = controller.escapeHtml("Tom & Jerry")
      expect(escaped).toBe("Tom &amp; Jerry")
    })

    it("escapes single quotes", () => {
      const escaped = controller.escapeHtml("it's")
      expect(escaped).toBe("it&#039;s")
    })
  })

  describe("renderDiffOriginal()", () => {
    it("renders equal content with equal class", () => {
      const diff = [{ type: "equal", value: "hello" }]
      const html = controller.renderDiffOriginal(diff)
      expect(html).toBe('<span class="ai-diff-equal">hello</span>')
    })

    it("renders deleted content with del class", () => {
      const diff = [{ type: "delete", value: "removed" }]
      const html = controller.renderDiffOriginal(diff)
      expect(html).toBe('<span class="ai-diff-del">removed</span>')
    })

    it("ignores inserted content", () => {
      const diff = [{ type: "insert", value: "new" }]
      const html = controller.renderDiffOriginal(diff)
      expect(html).toBe("")
    })
  })

  describe("renderDiffCorrected()", () => {
    it("renders equal content with equal class", () => {
      const diff = [{ type: "equal", value: "hello" }]
      const html = controller.renderDiffCorrected(diff)
      expect(html).toBe('<span class="ai-diff-equal">hello</span>')
    })

    it("renders inserted content with add class", () => {
      const diff = [{ type: "insert", value: "added" }]
      const html = controller.renderDiffCorrected(diff)
      expect(html).toBe('<span class="ai-diff-add">added</span>')
    })

    it("ignores deleted content", () => {
      const diff = [{ type: "delete", value: "removed" }]
      const html = controller.renderDiffCorrected(diff)
      expect(html).toBe("")
    })
  })
})
