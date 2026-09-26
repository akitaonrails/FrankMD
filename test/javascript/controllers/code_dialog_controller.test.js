/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
vi.mock("lib/app_prompt", () => ({ appConfirm: vi.fn().mockResolvedValue(true) }))
import { Application } from "@hotwired/stimulus"
import CodeDialogController from "../../../app/javascript/controllers/code_dialog_controller.js"
import { appConfirm } from "lib/app_prompt"

describe("CodeDialogController", () => {
  let application, controller, element

  beforeEach(() => {
    window.t = vi.fn((key) => key)
    vi.clearAllMocks()
    appConfirm.mockResolvedValue(true)

    document.body.innerHTML = `
      <div data-controller="code-dialog">
        <dialog data-code-dialog-target="dialog"></dialog>
        <input data-code-dialog-target="language" type="text" />
        <textarea data-code-dialog-target="content"></textarea>
        <input data-code-dialog-target="indentTabs" type="checkbox" />
        <div data-code-dialog-target="suggestions" class="hidden"></div>
      </div>
    `

    // Mock showModal and close for dialog
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.open = false
    })

    element = document.querySelector('[data-controller="code-dialog"]')
    application = Application.start()
    application.register("code-dialog", CodeDialogController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "code-dialog")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("initializes code state", () => {
      expect(controller.codeEditMode).toBe(false)
      expect(controller.codeStartPos).toBe(0)
      expect(controller.codeEndPos).toBe(0)
    })

    it("initializes code languages array", () => {
      expect(controller.codeLanguages).toContain("javascript")
      expect(controller.codeLanguages).toContain("python")
      expect(controller.codeLanguages).toContain("ruby")
    })
  })

  describe("open()", () => {
    it("opens dialog with empty fields for new code block", () => {
      controller.open()

      expect(controller.dialogTarget.showModal).toHaveBeenCalled()
      expect(controller.languageTarget.value).toBe("")
      expect(controller.contentTarget.value).toBe("")
      expect(controller.codeEditMode).toBe(false)
    })

    it("opens dialog with existing code block for edit mode", () => {
      controller.open({
        language: "javascript",
        content: "const x = 1;",
        editMode: true,
        startPos: 10,
        endPos: 50
      })

      expect(controller.dialogTarget.showModal).toHaveBeenCalled()
      expect(controller.languageTarget.value).toBe("javascript")
      expect(controller.contentTarget.value).toBe("const x = 1;")
      expect(controller.codeEditMode).toBe(true)
      expect(controller.codeStartPos).toBe(10)
      expect(controller.codeEndPos).toBe(50)
    })
  })

  describe("close()", () => {
    it("closes the dialog", () => {
      controller.close()
      expect(controller.dialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("onLanguageInput()", () => {
    it("shows suggestions for matching languages", () => {
      controller.languageTarget.value = "java"
      controller.onLanguageInput()

      expect(controller.suggestionsTarget.classList.contains("hidden")).toBe(false)
      expect(controller.suggestionsTarget.innerHTML).toContain("javascript")
      expect(controller.suggestionsTarget.innerHTML).toContain("java")
    })

    it("hides suggestions when input is empty", () => {
      controller.languageTarget.value = ""
      controller.onLanguageInput()

      expect(controller.suggestionsTarget.classList.contains("hidden")).toBe(true)
    })

    it("hides suggestions when exact match found", () => {
      controller.languageTarget.value = "javascript"
      controller.onLanguageInput()

      expect(controller.suggestionsTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("onLanguageKeydown()", () => {
    it("selects first suggestion on Tab when suggestions visible", () => {
      controller.languageTarget.value = "pyth"
      controller.onLanguageInput()

      const event = new KeyboardEvent("keydown", { key: "Tab" })
      event.preventDefault = vi.fn()
      controller.onLanguageKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      // First match for "pyth" is "python"
      expect(controller.languageTarget.value).toBe("python")
    })

    it("hides suggestions on Escape", () => {
      controller.suggestionsTarget.classList.remove("hidden")
      const event = new KeyboardEvent("keydown", { key: "Escape" })
      controller.onLanguageKeydown(event)

      expect(controller.suggestionsTarget.classList.contains("hidden")).toBe(true)
    })

    it("calls insert on Ctrl+Enter", () => {
      const insertSpy = vi.spyOn(controller, "insert")
      const event = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true })
      event.preventDefault = vi.fn()
      controller.onLanguageKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(insertSpy).toHaveBeenCalled()
    })
  })

  describe("onContentKeydown()", () => {
    it("calls insert on Ctrl+Enter", () => {
      const insertSpy = vi.spyOn(controller, "insert")
      const event = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true })
      event.preventDefault = vi.fn()
      controller.onContentKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(insertSpy).toHaveBeenCalled()
    })

    it("inserts spaces on Tab", () => {
      controller.contentTarget.value = "line1"
      controller.contentTarget.selectionStart = 5
      controller.contentTarget.selectionEnd = 5

      const event = new KeyboardEvent("keydown", { key: "Tab" })
      event.preventDefault = vi.fn()
      controller.onContentKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.contentTarget.value).toBe("line1  ")
    })

    it("inserts tabs when useTabs is checked", () => {
      controller.indentTabsTarget.checked = true
      controller.contentTarget.value = "line1"
      controller.contentTarget.selectionStart = 5
      controller.contentTarget.selectionEnd = 5

      const event = new KeyboardEvent("keydown", { key: "Tab" })
      event.preventDefault = vi.fn()
      controller.onContentKeydown(event)

      expect(controller.contentTarget.value).toBe("line1\t")
    })
  })

  describe("showSuggestions()", () => {
    it("populates suggestions container", () => {
      controller.showSuggestions(["javascript", "java"])

      expect(controller.suggestionsTarget.classList.contains("hidden")).toBe(false)
      expect(controller.suggestionsTarget.querySelectorAll("button").length).toBe(2)
    })
  })

  describe("hideSuggestions()", () => {
    it("hides suggestions container", () => {
      controller.suggestionsTarget.classList.remove("hidden")
      controller.hideSuggestions()

      expect(controller.suggestionsTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("selectLanguage()", () => {
    it("sets language value from clicked suggestion", () => {
      const event = { currentTarget: { dataset: { language: "python" } } }
      controller.selectLanguage(event)

      expect(controller.languageTarget.value).toBe("python")
      expect(controller.suggestionsTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("insert()", () => {
    it("dispatches insert event with code block for new code", async () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.languageTarget.value = "javascript"
      controller.contentTarget.value = "const x = 1;"

      await controller.insert()

      expect(dispatchSpy).toHaveBeenCalledWith("insert", {
        detail: {
          codeBlock: "```javascript\nconst x = 1;\n```",
          language: "javascript",
          editMode: false,
          startPos: 0,
          endPos: 0
        }
      })
    })

    it("dispatches insert event with edit mode info", async () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.codeEditMode = true
      controller.codeStartPos = 10
      controller.codeEndPos = 50
      controller.languageTarget.value = "python"
      controller.contentTarget.value = "print('hello')"

      await controller.insert()

      expect(dispatchSpy).toHaveBeenCalledWith("insert", {
        detail: {
          codeBlock: "```python\nprint('hello')\n```",
          language: "python",
          editMode: true,
          startPos: 10,
          endPos: 50
        }
      })
    })

    it("creates empty code block with blank line inside", async () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.languageTarget.value = "ruby"
      controller.contentTarget.value = ""

      await controller.insert()

      expect(dispatchSpy).toHaveBeenCalledWith("insert", {
        detail: expect.objectContaining({
          codeBlock: "```ruby\n\n```"
        })
      })
    })

    it("shows confirmation for unrecognized language", async () => {
      controller.languageTarget.value = "unknownlang"
      controller.contentTarget.value = "code"

      await controller.insert()

      expect(appConfirm).toHaveBeenCalledWith("dialogs.code.unrecognized_language")
    })

    it("does not insert when confirmation is cancelled", async () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      appConfirm.mockResolvedValue(false)
      controller.languageTarget.value = "unknownlang"
      controller.contentTarget.value = "code"

      await controller.insert()

      expect(dispatchSpy).not.toHaveBeenCalled()
    })

    it("closes dialog after insert", async () => {
      const closeSpy = vi.spyOn(controller, "close")
      controller.languageTarget.value = "javascript"
      controller.contentTarget.value = "code"

      await controller.insert()

      expect(closeSpy).toHaveBeenCalled()
    })
  })
})
