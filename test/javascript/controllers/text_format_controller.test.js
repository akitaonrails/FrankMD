/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import TextFormatController from "../../../app/javascript/controllers/text_format_controller.js"

describe("TextFormatController", () => {
  let application, controller, element
  let originalTranslator

  beforeEach(() => {
    originalTranslator = window.t
    window.t = vi.fn((key) => key.split(".").at(-1))

    document.body.innerHTML = `
      <div data-controller="text-format">
        <div data-text-format-target="menu"
             data-action="keydown->text-format#onMenuKeydown"
             tabindex="-1"
             class="hidden">
        </div>
      </div>
    `

    element = document.querySelector('[data-controller="text-format"]')
    application = Application.start()
    application.register("text-format", TextFormatController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "text-format")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
    if (originalTranslator) window.t = originalTranslator
    else delete window.t
  })

  describe("static formats", () => {
    it("has 7 format options", () => {
      expect(TextFormatController.formats).toHaveLength(7)
    })

    it("includes bold format", () => {
      const bold = TextFormatController.formats.find(f => f.id === "bold")
      expect(bold).toBeDefined()
      expect(bold.prefix).toBe("**")
      expect(bold.suffix).toBe("**")
      expect(bold.hotkey).toBe("B")
    })

    it("includes italic format", () => {
      const italic = TextFormatController.formats.find(f => f.id === "italic")
      expect(italic).toBeDefined()
      expect(italic.prefix).toBe("*")
      expect(italic.suffix).toBe("*")
      expect(italic.hotkey).toBe("I")
    })

    it("includes strikethrough format", () => {
      const strikethrough = TextFormatController.formats.find(f => f.id === "strikethrough")
      expect(strikethrough).toBeDefined()
      expect(strikethrough.prefix).toBe("~~")
      expect(strikethrough.suffix).toBe("~~")
      expect(strikethrough.hotkey).toBe("S")
    })

    it("includes highlight format", () => {
      const highlight = TextFormatController.formats.find(f => f.id === "highlight")
      expect(highlight).toBeDefined()
      expect(highlight.prefix).toBe("==")
      expect(highlight.suffix).toBe("==")
      expect(highlight.hotkey).toBe("H")
    })

    it("includes subscript format", () => {
      const subscript = TextFormatController.formats.find(f => f.id === "subscript")
      expect(subscript).toBeDefined()
      expect(subscript.prefix).toBe("~")
      expect(subscript.suffix).toBe("~")
      expect(subscript.hotkey).toBe("U")
    })

    it("includes superscript format", () => {
      const superscript = TextFormatController.formats.find(f => f.id === "superscript")
      expect(superscript).toBeDefined()
      expect(superscript.prefix).toBe("^")
      expect(superscript.suffix).toBe("^")
      expect(superscript.hotkey).toBe("P")
    })

    it("includes link format", () => {
      const link = TextFormatController.formats.find(f => f.id === "link")
      expect(link).toBeDefined()
      expect(link.prefix).toBe("[")
      expect(link.suffix).toBe("](url)")
      expect(link.hotkey).toBe("L")
    })
  })

  describe("connect()", () => {
    it("initializes selectedIndex to 0", () => {
      expect(controller.selectedIndex).toBe(0)
    })

    it("initializes selectionData to null", () => {
      expect(controller.selectionData).toBeNull()
    })
  })

  describe("open()", () => {
    it("shows the menu", () => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)
    })

    it("stores selection data", () => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)

      expect(controller.selectionData).toEqual(selectionData)
    })

    it("resets selectedIndex to 0", () => {
      controller.selectedIndex = 3
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)

      expect(controller.selectedIndex).toBe(0)
    })

    it("renders menu items", () => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)

      const buttons = controller.menuTarget.querySelectorAll("button")
      expect(buttons).toHaveLength(7)
    })

    it("does not open if no selection data provided", () => {
      controller.open(null, 100, 100)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open if selection text is empty", () => {
      const selectionData = { start: 0, end: 0, text: "" }
      controller.open(selectionData, 100, 100)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("close()", () => {
    it("hides the menu", () => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)
      controller.close()

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("clears selection data", () => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)
      controller.close()

      expect(controller.selectionData).toBeNull()
    })
  })

  describe("renderMenu()", () => {
    beforeEach(() => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)
    })

    it("renders a button for each format", () => {
      const buttons = controller.menuTarget.querySelectorAll("button")
      expect(buttons).toHaveLength(7)
      expect(window.t).toHaveBeenCalledWith("dialogs.text_format.bold")
      expect(window.t).toHaveBeenCalledWith("dialogs.text_format.link")
      expect(buttons[0].textContent).toContain("bold")
    })

    it("highlights selected item with accent color", () => {
      controller.selectedIndex = 2 // Strikethrough
      controller.renderMenu()

      const buttons = controller.menuTarget.querySelectorAll("button")
      expect(buttons[2].className).toContain("bg-[var(--theme-accent)]")
    })

    it("shows hotkey for each item", () => {
      const buttons = controller.menuTarget.querySelectorAll("button")
      const hotkeys = Array.from(buttons).map(b => b.querySelector("span:last-child").textContent)

      expect(hotkeys).toEqual(["B", "I", "S", "H", "U", "P", "L"])
    })

    it("underlines hotkey character in label", () => {
      const buttons = controller.menuTarget.querySelectorAll("button")
      const firstButton = buttons[0]
      const label = firstButton.querySelector("span:first-child")

      expect(label.innerHTML).toContain("<u>")
    })
  })

  describe("formatLabelWithHotkey()", () => {
    it("underlines first occurrence of hotkey character", () => {
      const result = controller.formatLabelWithHotkey("Bold", "B")
      expect(result).toBe("<u>B</u>old")
    })

    it("handles hotkey in middle of word", () => {
      const result = controller.formatLabelWithHotkey("Italic", "I")
      expect(result).toBe("<u>I</u>talic")
    })

    it("returns original label if hotkey not found", () => {
      const result = controller.formatLabelWithHotkey("Bold", "X")
      expect(result).toBe("Bold")
    })

    it("is case insensitive", () => {
      const result = controller.formatLabelWithHotkey("subscript", "U")
      expect(result).toBe("s<u>u</u>bscript")
    })
  })

  describe("onMenuKeydown()", () => {
    beforeEach(() => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)
    })

    it("ArrowDown moves selection down", () => {
      expect(controller.selectedIndex).toBe(0)

      const event = new KeyboardEvent("keydown", { key: "ArrowDown" })
      controller.onMenuKeydown(event)

      expect(controller.selectedIndex).toBe(1)
    })

    it("ArrowDown wraps to top", () => {
      controller.selectedIndex = 6
      controller.renderMenu()

      const event = new KeyboardEvent("keydown", { key: "ArrowDown" })
      controller.onMenuKeydown(event)

      expect(controller.selectedIndex).toBe(0)
    })

    it("ArrowUp moves selection up", () => {
      controller.selectedIndex = 2
      controller.renderMenu()

      const event = new KeyboardEvent("keydown", { key: "ArrowUp" })
      controller.onMenuKeydown(event)

      expect(controller.selectedIndex).toBe(1)
    })

    it("ArrowUp wraps to bottom", () => {
      expect(controller.selectedIndex).toBe(0)

      const event = new KeyboardEvent("keydown", { key: "ArrowUp" })
      controller.onMenuKeydown(event)

      expect(controller.selectedIndex).toBe(6)
    })

    it("Enter applies selected format", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      controller.selectedIndex = 1 // Italic
      controller.renderMenu()

      const event = new KeyboardEvent("keydown", { key: "Enter" })
      controller.onMenuKeydown(event)

      expect(handler).toHaveBeenCalled()
      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("italic")
    })

    it("Escape closes menu", () => {
      const closedHandler = vi.fn()
      element.addEventListener("text-format:closed", closedHandler)

      const event = new KeyboardEvent("keydown", { key: "Escape" })
      controller.onMenuKeydown(event)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
      expect(closedHandler).toHaveBeenCalled()
    })

    it("Hotkey B applies bold format", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      const event = new KeyboardEvent("keydown", { key: "B" })
      controller.onMenuKeydown(event)

      expect(handler).toHaveBeenCalled()
      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("bold")
    })

    it("Hotkey I applies italic format", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      const event = new KeyboardEvent("keydown", { key: "I" })
      controller.onMenuKeydown(event)

      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("italic")
    })

    it("Hotkey S applies strikethrough format", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      const event = new KeyboardEvent("keydown", { key: "S" })
      controller.onMenuKeydown(event)

      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("strikethrough")
    })

    it("Hotkey L applies link format", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      const event = new KeyboardEvent("keydown", { key: "L" })
      controller.onMenuKeydown(event)

      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("link")
    })

    it("lowercase hotkey also works", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      const event = new KeyboardEvent("keydown", { key: "b" })
      controller.onMenuKeydown(event)

      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("bold")
    })
  })

  describe("onItemHover()", () => {
    beforeEach(() => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)
    })

    it("updates selection on hover", () => {
      const event = { currentTarget: { dataset: { index: "3" } } }
      controller.onItemHover(event)

      expect(controller.selectedIndex).toBe(3)
    })

    it("does not update if hovering same item", () => {
      controller.selectedIndex = 3
      const renderSpy = vi.spyOn(controller, "renderMenu")

      const event = { currentTarget: { dataset: { index: "3" } } }
      controller.onItemHover(event)

      // renderMenu should not be called if index is same
      expect(renderSpy).not.toHaveBeenCalled()
    })
  })

  describe("onItemClick()", () => {
    beforeEach(() => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)
    })

    it("applies format on click", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      const event = { currentTarget: { dataset: { index: "2" } } }
      controller.onItemClick(event)

      expect(handler).toHaveBeenCalled()
      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("strikethrough")
    })
  })

  describe("applyFormat()", () => {
    beforeEach(() => {
      const selectionData = { start: 0, end: 5, text: "hello" }
      controller.open(selectionData, 100, 100)
    })

    it("dispatches applied event with format details", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      const format = { id: "bold", prefix: "**", suffix: "**" }
      controller.applyFormat(format)

      expect(handler).toHaveBeenCalled()
      const detail = handler.mock.calls[0][0].detail
      expect(detail.format).toBe("bold")
      expect(detail.prefix).toBe("**")
      expect(detail.suffix).toBe("**")
      expect(detail.selectionData).toEqual({ start: 0, end: 5, text: "hello" })
    })

    it("closes menu after applying format", () => {
      const format = { id: "bold", prefix: "**", suffix: "**" }
      controller.applyFormat(format)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does nothing if format is null", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      controller.applyFormat(null)

      expect(handler).not.toHaveBeenCalled()
    })

    it("does nothing if selection data is null", () => {
      const handler = vi.fn()
      element.addEventListener("text-format:applied", handler)

      controller.selectionData = null
      const format = { id: "bold", prefix: "**", suffix: "**" }
      controller.applyFormat(format)

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe("getFormat()", () => {
    it("returns format by id", () => {
      const format = controller.getFormat("bold")
      expect(format).toBeDefined()
      expect(format.id).toBe("bold")
    })

    it("returns undefined for unknown id", () => {
      const format = controller.getFormat("unknown")
      expect(format).toBeUndefined()
    })
  })

  describe("positionMenu()", () => {
    beforeEach(() => {
      // Set up menu with known dimensions
      controller.menuTarget.style.width = "180px"
      controller.menuTarget.style.height = "200px"
    })

    it("positions menu at specified coordinates", () => {
      controller.positionMenu(100, 200)

      expect(controller.menuTarget.style.left).toBe("100px")
      expect(controller.menuTarget.style.top).toBe("200px")
    })
  })

  describe("isToggleable()", () => {
    it("returns true for symmetric formats (bold)", () => {
      const format = { prefix: "**", suffix: "**" }
      expect(controller.isToggleable(format)).toBe(true)
    })

    it("returns true for symmetric formats (italic)", () => {
      const format = { prefix: "*", suffix: "*" }
      expect(controller.isToggleable(format)).toBe(true)
    })

    it("returns false for asymmetric formats (link)", () => {
      const format = { prefix: "[", suffix: "](url)" }
      expect(controller.isToggleable(format)).toBe(false)
    })
  })

  describe("getUnwrapInfo()", () => {
    let textarea

    beforeEach(() => {
      textarea = document.createElement("textarea")
      document.body.appendChild(textarea)
    })

    afterEach(() => {
      textarea.remove()
    })

    it("detects markers inside selection", () => {
      const format = { prefix: "**", suffix: "**" }
      textarea.value = "some **bold** text"
      textarea.setSelectionRange(5, 13) // Select "**bold**"

      const info = controller.getUnwrapInfo(format, textarea)

      expect(info.canUnwrap).toBe(true)
      expect(info.newText).toBe("bold")
    })

    it("detects markers outside selection", () => {
      const format = { prefix: "**", suffix: "**" }
      textarea.value = "some **bold** text"
      textarea.setSelectionRange(7, 11) // Select "bold" only

      const info = controller.getUnwrapInfo(format, textarea)

      expect(info.canUnwrap).toBe(true)
      expect(info.newText).toBe("bold")
    })

    it("returns canUnwrap false when no markers present", () => {
      const format = { prefix: "**", suffix: "**" }
      textarea.value = "some plain text"
      textarea.setSelectionRange(5, 10) // Select "plain"

      const info = controller.getUnwrapInfo(format, textarea)

      expect(info.canUnwrap).toBe(false)
    })

    it("handles italic markers", () => {
      const format = { prefix: "*", suffix: "*" }
      textarea.value = "some *italic* text"
      textarea.setSelectionRange(6, 12) // Select "italic" only

      const info = controller.getUnwrapInfo(format, textarea)

      expect(info.canUnwrap).toBe(true)
      expect(info.newText).toBe("italic")
    })
  })

  describe("applyFormatById() toggle behavior", () => {
    let textarea

    beforeEach(() => {
      textarea = document.createElement("textarea")
      document.body.appendChild(textarea)
    })

    afterEach(() => {
      textarea.remove()
    })

    it("removes bold markers when text is already bold (markers outside selection)", () => {
      textarea.value = "some **bold** text"
      textarea.setSelectionRange(7, 11) // Select "bold" only

      controller.applyFormatById("bold", textarea)

      expect(textarea.value).toBe("some bold text")
    })

    it("removes bold markers when selection includes markers", () => {
      textarea.value = "some **bold** text"
      textarea.setSelectionRange(5, 13) // Select "**bold**"

      controller.applyFormatById("bold", textarea)

      expect(textarea.value).toBe("some bold text")
    })

    it("adds bold markers when text is not bold", () => {
      textarea.value = "some plain text"
      textarea.setSelectionRange(5, 10) // Select "plain"

      controller.applyFormatById("bold", textarea)

      expect(textarea.value).toBe("some **plain** text")
    })

    it("removes italic markers when text is already italic", () => {
      textarea.value = "some *italic* text"
      textarea.setSelectionRange(6, 12) // Select "italic" only

      controller.applyFormatById("italic", textarea)

      expect(textarea.value).toBe("some italic text")
    })

    it("removes strikethrough markers when text is already strikethrough", () => {
      textarea.value = "some ~~deleted~~ text"
      textarea.setSelectionRange(7, 14) // Select "deleted" only

      controller.applyFormatById("strikethrough", textarea)

      expect(textarea.value).toBe("some deleted text")
    })

    it("does not toggle link format (asymmetric)", () => {
      textarea.value = "some [link](url) text"
      textarea.setSelectionRange(6, 10) // Select "link" only

      controller.applyFormatById("link", textarea)

      // Should add link format, not remove it (since link is not toggleable)
      expect(textarea.value).toBe("some [[link](url)](url) text")
    })
  })

  describe("openAtPosition()", () => {
    let textarea

    beforeEach(() => {
      textarea = document.createElement("textarea")
      textarea.value = "Hello World"
      document.body.appendChild(textarea)
    })

    afterEach(() => {
      document.body.removeChild(textarea)
    })

    it("opens menu when text is selected", () => {
      textarea.setSelectionRange(0, 5) // Select "Hello"

      controller.openAtPosition(textarea, 100, 200)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)
      expect(controller.selectionData).toEqual({
        start: 0,
        end: 5,
        text: "Hello"
      })
    })

    it("does not open menu when no text is selected", () => {
      textarea.setSelectionRange(3, 3) // Cursor only, no selection

      controller.openAtPosition(textarea, 100, 200)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open menu when selection is only whitespace", () => {
      textarea.value = "Hello   World"
      textarea.setSelectionRange(5, 8) // Select "   " (spaces)

      controller.openAtPosition(textarea, 100, 200)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("positions menu at specified coordinates", () => {
      textarea.setSelectionRange(0, 5)

      controller.openAtPosition(textarea, 150, 250)

      expect(controller.menuTarget.style.left).toBe("150px")
      expect(controller.menuTarget.style.top).toBe("250px")
    })
  })

  describe("openAtCursor()", () => {
    let textarea

    beforeEach(() => {
      textarea = document.createElement("textarea")
      textarea.value = "Hello World"
      document.body.appendChild(textarea)
      // Mock getBoundingClientRect for position calculation
      textarea.getBoundingClientRect = vi.fn(() => ({
        top: 100,
        left: 50,
        width: 300,
        height: 100
      }))
    })

    afterEach(() => {
      document.body.removeChild(textarea)
    })

    it("opens menu when text is selected", () => {
      textarea.setSelectionRange(0, 5) // Select "Hello"

      controller.openAtCursor(textarea)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)
      expect(controller.selectionData).toEqual({
        start: 0,
        end: 5,
        text: "Hello"
      })
    })

    it("does not open menu when no text is selected", () => {
      textarea.setSelectionRange(3, 3) // Cursor only

      controller.openAtCursor(textarea)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open menu when selection is only whitespace", () => {
      textarea.value = "Hello   World"
      textarea.setSelectionRange(5, 8) // Select spaces

      controller.openAtCursor(textarea)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("applyFormatToEditor()", () => {
    let mockCm

    beforeEach(() => {
      mockCm = {
        getValue: vi.fn(() => "Hello World"),
        replaceRange: vi.fn(),
        setSelection: vi.fn(),
        focus: vi.fn(),
        getSelection: vi.fn(() => ({ from: 0, to: 5, text: "Hello" })),
      }
    })

    it("wraps selected text with format markers", () => {
      const format = { prefix: "**", suffix: "**" }
      const selectionData = { start: 0, end: 5, text: "Hello" }

      controller.applyFormatToEditor(format, selectionData, mockCm)

      expect(mockCm.replaceRange).toHaveBeenCalledWith("**Hello**", 0, 5)
      expect(mockCm.focus).toHaveBeenCalled()
    })

    it("unwraps when selection includes markers (toggle)", () => {
      const format = { prefix: "**", suffix: "**" }
      const selectionData = { start: 0, end: 9, text: "**Hello**" }

      controller.applyFormatToEditor(format, selectionData, mockCm)

      expect(mockCm.replaceRange).toHaveBeenCalledWith("Hello", 0, 9)
      expect(mockCm.setSelection).toHaveBeenCalledWith(0, 5)
    })

    it("unwraps when markers are outside selection (toggle)", () => {
      mockCm.getValue.mockReturnValue("**Hello** World")
      const format = { prefix: "**", suffix: "**" }
      const selectionData = { start: 2, end: 7, text: "Hello" }

      controller.applyFormatToEditor(format, selectionData, mockCm)

      expect(mockCm.replaceRange).toHaveBeenCalledWith("Hello", 0, 9)
      expect(mockCm.setSelection).toHaveBeenCalledWith(0, 5)
    })

    it("positions cursor at url for link format", () => {
      const format = { prefix: "[", suffix: "](url)" }
      const selectionData = { start: 0, end: 5, text: "Hello" }

      controller.applyFormatToEditor(format, selectionData, mockCm)

      expect(mockCm.replaceRange).toHaveBeenCalledWith("[Hello](url)", 0, 5)
      // urlStart = 0 + 1 + 5 + 2 = 8, urlEnd = 8 + 3 = 11
      expect(mockCm.setSelection).toHaveBeenCalledWith(8, 11)
    })

    it("does nothing when format is null", () => {
      controller.applyFormatToEditor(null, { start: 0, end: 5, text: "Hello" }, mockCm)
      expect(mockCm.replaceRange).not.toHaveBeenCalled()
    })

    it("does nothing when selectionData is null", () => {
      controller.applyFormatToEditor({ prefix: "**", suffix: "**" }, null, mockCm)
      expect(mockCm.replaceRange).not.toHaveBeenCalled()
    })
  })

  describe("onContextMenu()", () => {
    let mockCm

    beforeEach(() => {
      mockCm = {
        getSelection: vi.fn(() => ({ from: 0, to: 5, text: "Hello" })),
      }
    })

    it("opens menu when text is selected in CodeMirror", () => {
      const event = { clientX: 100, clientY: 200, preventDefault: vi.fn() }

      controller.onContextMenu(event, mockCm, true)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)
      expect(controller.selectionData).toEqual({ start: 0, end: 5, text: "Hello" })
    })

    it("positions menu at click coordinates", () => {
      const event = { clientX: 150, clientY: 250, preventDefault: vi.fn() }

      controller.onContextMenu(event, mockCm, true)

      expect(controller.menuTarget.style.left).toBe("150px")
      expect(controller.menuTarget.style.top).toBe("250px")
    })

    it("does not require a textarea element in the DOM", () => {
      // Ensure no textarea with data-app-target exists
      const existing = document.querySelector('[data-app-target="textarea"]')
      expect(existing).toBeNull()

      const event = { clientX: 100, clientY: 200, preventDefault: vi.fn() }
      controller.onContextMenu(event, mockCm, true)

      // Menu should still open using CodeMirror selection directly
      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)
    })

    it("does not open when no text is selected", () => {
      mockCm.getSelection.mockReturnValue({ from: 5, to: 5, text: "" })

      const event = { clientX: 100, clientY: 200, preventDefault: vi.fn() }
      controller.onContextMenu(event, mockCm, true)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open when selection is only whitespace", () => {
      mockCm.getSelection.mockReturnValue({ from: 5, to: 8, text: "   " })

      const event = { clientX: 100, clientY: 200, preventDefault: vi.fn() }
      controller.onContextMenu(event, mockCm, true)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open when not markdown", () => {
      const event = { clientX: 100, clientY: 200, preventDefault: vi.fn() }
      controller.onContextMenu(event, mockCm, false)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open when codemirrorController is null", () => {
      const event = { clientX: 100, clientY: 200, preventDefault: vi.fn() }
      controller.onContextMenu(event, null, true)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })
  })

  describe("openFromKeyboard()", () => {
    let mockCm

    beforeEach(() => {
      mockCm = {
        getSelection: vi.fn(() => ({ from: 0, to: 5, text: "Hello" })),
        editor: { coordsAtPos: vi.fn(() => ({ left: 120, bottom: 180 })) },
        element: { getBoundingClientRect: vi.fn(() => ({ left: 50, top: 100, width: 400, height: 300 })) },
      }
    })

    it("opens menu when text is selected in CodeMirror", () => {
      controller.openFromKeyboard(mockCm)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)
      expect(controller.selectionData).toEqual({ start: 0, end: 5, text: "Hello" })
    })

    it("positions menu using CodeMirror cursor coordinates", () => {
      controller.openFromKeyboard(mockCm)

      expect(mockCm.editor.coordsAtPos).toHaveBeenCalledWith(5)
      expect(controller.menuTarget.style.left).toBe("120px")
      expect(controller.menuTarget.style.top).toBe("184px") // bottom + 4
    })

    it("falls back to element center when coordsAtPos returns null", () => {
      mockCm.editor.coordsAtPos.mockReturnValue(null)

      controller.openFromKeyboard(mockCm)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(false)
      expect(controller.menuTarget.style.left).toBe("250px") // 50 + 400/2
      expect(controller.menuTarget.style.top).toBe("250px") // 100 + 300/2
    })

    it("does not open when no text is selected", () => {
      mockCm.getSelection.mockReturnValue({ from: 5, to: 5, text: "" })

      controller.openFromKeyboard(mockCm)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open when selection is only whitespace", () => {
      mockCm.getSelection.mockReturnValue({ from: 0, to: 3, text: "   " })

      controller.openFromKeyboard(mockCm)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })

    it("does not open when codemirrorController is null", () => {
      controller.openFromKeyboard(null)

      expect(controller.menuTarget.classList.contains("hidden")).toBe(true)
    })
  })
})
