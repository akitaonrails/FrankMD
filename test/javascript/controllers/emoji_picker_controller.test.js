/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import EmojiPickerController from "../../../app/javascript/controllers/emoji_picker_controller.js"

// Sample emoji data matching the real format in public/emoji-data/*.json
const SAMPLE_EMOJI_DATA = [
  { hexcode: "1F600", label: "grinning face", unicode: "😀", tags: ["happy", "smile"] },
  { hexcode: "1F602", label: "face with tears of joy", unicode: "😂", tags: ["laugh", "crying"] },
  { hexcode: "2764", label: "red heart", unicode: "❤️", tags: ["love"] }
]

describe("EmojiPickerController", () => {
  let application, controller, element

  beforeEach(() => {
    window.t = vi.fn((key) => key)

    // Mock fetch to handle /emoji-data/*.json requests (relative URLs fail in Node)
    global.fetch = vi.fn((url) => {
      const urlStr = typeof url === "string" ? url : url.toString()
      if (urlStr.match(/\/emoji-data\/\w+\.json/)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(SAMPLE_EMOJI_DATA)
        })
      }
      // Pass through other URLs (shouldn't happen in this test, but safe fallback)
      return Promise.reject(new Error(`Unmocked fetch: ${urlStr}`))
    })

    document.body.innerHTML = `
      <div data-controller="emoji-picker"
           data-emoji-picker-columns-value="10"
           data-emoji-picker-emoticon-columns-value="5"
           data-emoji-picker-icon-columns-value="8">
        <dialog data-emoji-picker-target="dialog"></dialog>
        <input data-emoji-picker-target="input" type="text" />
        <div data-emoji-picker-target="grid"></div>
        <div data-emoji-picker-target="preview"></div>
        <button data-emoji-picker-target="tabEmoji" class="px-3 py-1 text-sm rounded-md hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]"></button>
        <button data-emoji-picker-target="tabEmoticons" class="px-3 py-1 text-sm rounded-md hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]"></button>
        <button data-emoji-picker-target="tabIcons" class="px-3 py-1 text-sm rounded-md hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]"></button>
      </div>
    `

    // Mock showModal and close for dialog
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.open = false
    })

    // Mock scrollIntoView for all elements
    Element.prototype.scrollIntoView = vi.fn()

    element = document.querySelector('[data-controller="emoji-picker"]')
    application = Application.start()
    application.register("emoji-picker", EmojiPickerController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "emoji-picker")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("connect()", () => {
    it("initializes emoji data arrays", () => {
      expect(controller.allEmojis).toBeDefined()
      expect(controller.allEmojis.length).toBeGreaterThan(0)
      expect(controller.allEmoticons).toBeDefined()
      expect(controller.allEmoticons.length).toBeGreaterThan(0)
    })

    it("initializes filtered items with all emojis", () => {
      expect(controller.filteredItems).toEqual(controller.allEmojis)
    })

    it("initializes selected index to 0", () => {
      expect(controller.selectedIndex).toBe(0)
    })

    it("initializes active tab to emoji", () => {
      expect(controller.activeTab).toBe("emoji")
    })
  })

  describe("open()", () => {
    it("opens the dialog", () => {
      controller.open()
      expect(controller.dialogTarget.showModal).toHaveBeenCalled()
    })

    it("clears the search input", () => {
      controller.inputTarget.value = "test"
      controller.open()
      expect(controller.inputTarget.value).toBe("")
    })

    it("resets to emoji tab", () => {
      controller.activeTab = "emoticons"
      controller.open()
      expect(controller.activeTab).toBe("emoji")
    })

    it("resets selected index to 0", () => {
      controller.selectedIndex = 5
      controller.open()
      expect(controller.selectedIndex).toBe(0)
    })

    it("renders emoji grid on open", () => {
      controller.open()
      expect(controller.gridTarget.innerHTML).toContain("button")
      expect(controller.gridTarget.innerHTML).toContain("data-emoji")
    })

    it("updates preview on open", () => {
      controller.open()
      expect(controller.previewTarget.innerHTML).not.toBe("")
    })
  })

  describe("close()", () => {
    it("closes the dialog", () => {
      controller.close()
      expect(controller.dialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("tab switching", () => {
    describe("switchToEmoji()", () => {
      it("switches to emoji tab", () => {
        controller.activeTab = "emoticons"
        controller.switchToEmoji()
        expect(controller.activeTab).toBe("emoji")
      })

      it("does nothing if already on emoji tab", () => {
        controller.activeTab = "emoji"
        const updateSpy = vi.spyOn(controller, "updateTabStyles")
        controller.switchToEmoji()
        expect(updateSpy).not.toHaveBeenCalled()
      })

      it("resets selected index when switching", () => {
        controller.activeTab = "emoticons"
        controller.selectedIndex = 5
        controller.switchToEmoji()
        expect(controller.selectedIndex).toBe(0)
      })
    })

    describe("switchToEmoticons()", () => {
      it("switches to emoticons tab", () => {
        controller.activeTab = "emoji"
        controller.switchToEmoticons()
        expect(controller.activeTab).toBe("emoticons")
      })

      it("does nothing if already on emoticons tab", () => {
        controller.activeTab = "emoticons"
        const updateSpy = vi.spyOn(controller, "updateTabStyles")
        controller.switchToEmoticons()
        expect(updateSpy).not.toHaveBeenCalled()
      })

      it("resets selected index when switching", () => {
        controller.activeTab = "emoji"
        controller.selectedIndex = 5
        controller.switchToEmoticons()
        expect(controller.selectedIndex).toBe(0)
      })
    })

    describe("switchToIcons()", () => {
      it("switches to icons tab", () => {
        controller.activeTab = "emoji"
        controller.switchToIcons()
        expect(controller.activeTab).toBe("icons")
      })

      it("does nothing if already on icons tab", () => {
        controller.activeTab = "icons"
        const updateSpy = vi.spyOn(controller, "updateTabStyles")
        controller.switchToIcons()
        expect(updateSpy).not.toHaveBeenCalled()
      })

      it("resets selected index when switching", () => {
        controller.activeTab = "emoji"
        controller.selectedIndex = 5
        controller.switchToIcons()
        expect(controller.selectedIndex).toBe(0)
      })
    })
  })

  describe("onInput() - search filtering", () => {
    it("filters emojis by shortcode", () => {
      controller.activeTab = "emoji"
      controller.inputTarget.value = "heart"
      controller.onInput()

      // Should find emojis with "heart" in name
      expect(controller.filteredItems.some(([name]) => name.includes("heart"))).toBe(true)
    })

    it("filters emojis by keywords", () => {
      controller.activeTab = "emoji"
      controller.inputTarget.value = "love"
      controller.onInput()

      // Should find emojis with "love" in keywords
      expect(controller.filteredItems.length).toBeGreaterThan(0)
    })

    it("filters emoticons by name", () => {
      controller.activeTab = "emoticons"
      controller.filteredItems = [...controller.allEmoticons]
      controller.inputTarget.value = "happy"
      controller.onInput()

      expect(controller.filteredItems.some(([name]) => name.includes("happy"))).toBe(true)
    })

    it("filters emoticons by keywords", () => {
      controller.activeTab = "emoticons"
      controller.filteredItems = [...controller.allEmoticons]
      controller.inputTarget.value = "smile"
      controller.onInput()

      expect(controller.filteredItems.length).toBeGreaterThan(0)
    })

    it("filters icons by name", () => {
      controller.activeTab = "icons"
      controller.filteredItems = [...controller.allIcons]
      controller.inputTarget.value = "heart"
      controller.onInput()

      expect(controller.filteredItems.some(([name]) => name.includes("heart"))).toBe(true)
    })

    it("filters icons by keywords", () => {
      controller.activeTab = "icons"
      controller.filteredItems = [...controller.allIcons]
      controller.inputTarget.value = "love"
      controller.onInput()

      expect(controller.filteredItems.length).toBeGreaterThan(0)
    })

    it("shows all items when search is empty", () => {
      controller.activeTab = "emoji"
      controller.inputTarget.value = ""
      controller.onInput()

      expect(controller.filteredItems).toEqual(controller.allEmojis)
    })

    it("shows empty state when no matches", () => {
      controller.inputTarget.value = "xyznonexistent123"
      controller.onInput()

      expect(controller.filteredItems.length).toBe(0)
      expect(controller.gridTarget.innerHTML).toContain("status.no_matches")
    })

    it("resets selected index on filter", () => {
      controller.selectedIndex = 10
      controller.inputTarget.value = "smile"
      controller.onInput()

      expect(controller.selectedIndex).toBe(0)
    })
  })

  describe("getCurrentColumns()", () => {
    it("returns emoji columns for emoji tab", () => {
      controller.activeTab = "emoji"
      expect(controller.getCurrentColumns()).toBe(10)
    })

    it("returns emoticon columns for emoticons tab", () => {
      controller.activeTab = "emoticons"
      expect(controller.getCurrentColumns()).toBe(5)
    })

    it("returns icon columns for icons tab", () => {
      controller.activeTab = "icons"
      expect(controller.getCurrentColumns()).toBe(8)
    })
  })

  describe("keyboard navigation", () => {
    beforeEach(() => {
      controller.open()
    })

    describe("ArrowRight", () => {
      it("moves selection right", () => {
        const initialIndex = controller.selectedIndex
        const event = new KeyboardEvent("keydown", { key: "ArrowRight" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(controller.selectedIndex).toBe(initialIndex + 1)
      })

      it("wraps to beginning at end", () => {
        controller.selectedIndex = controller.filteredItems.length - 1
        const event = new KeyboardEvent("keydown", { key: "ArrowRight" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(controller.selectedIndex).toBe(0)
      })
    })

    describe("ArrowLeft", () => {
      it("moves selection left", () => {
        controller.selectedIndex = 5
        const event = new KeyboardEvent("keydown", { key: "ArrowLeft" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(controller.selectedIndex).toBe(4)
      })

      it("wraps to end at beginning", () => {
        controller.selectedIndex = 0
        const event = new KeyboardEvent("keydown", { key: "ArrowLeft" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(controller.selectedIndex).toBe(controller.filteredItems.length - 1)
      })
    })

    describe("ArrowDown", () => {
      it("moves selection down one row", () => {
        controller.selectedIndex = 0
        const cols = controller.getCurrentColumns()
        const event = new KeyboardEvent("keydown", { key: "ArrowDown" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(controller.selectedIndex).toBe(cols)
      })

      it("wraps to first row at last row", () => {
        const cols = controller.getCurrentColumns()
        const total = controller.filteredItems.length
        const lastRowStart = Math.floor((total - 1) / cols) * cols
        controller.selectedIndex = lastRowStart // First item of last row

        const event = new KeyboardEvent("keydown", { key: "ArrowDown" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        // Should wrap to first row, same column
        expect(controller.selectedIndex).toBe(0)
      })
    })

    describe("ArrowUp", () => {
      it("moves selection up one row", () => {
        const cols = controller.getCurrentColumns()
        controller.selectedIndex = cols // Start at second row
        const event = new KeyboardEvent("keydown", { key: "ArrowUp" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(controller.selectedIndex).toBe(0)
      })

      it("wraps to last row at first row", () => {
        controller.selectedIndex = 0
        const event = new KeyboardEvent("keydown", { key: "ArrowUp" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        // Should be somewhere in the last row
        const cols = controller.getCurrentColumns()
        const total = controller.filteredItems.length
        const lastRowStart = Math.floor((total - 1) / cols) * cols
        expect(controller.selectedIndex).toBeGreaterThanOrEqual(lastRowStart)
      })
    })

    describe("Tab key", () => {
      it("does not prevent default - allows normal tab navigation", () => {
        controller.activeTab = "emoji"
        const event = new KeyboardEvent("keydown", { key: "Tab" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        // Tab key should NOT prevent default - it works normally for focus
        expect(event.preventDefault).not.toHaveBeenCalled()
        // Tab should NOT change the active tab - arrow keys do that now
        expect(controller.activeTab).toBe("emoji")
      })
    })
  })

  describe("onTabKeydown() - arrow key tab navigation", () => {
    beforeEach(() => {
      controller.open()
    })

    it("switches from emoji to emoticons with ArrowRight", () => {
      controller.activeTab = "emoji"
      const event = new KeyboardEvent("keydown", { key: "ArrowRight" })
      event.preventDefault = vi.fn()
      controller.onTabKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.activeTab).toBe("emoticons")
    })

    it("switches from emoticons to icons with ArrowRight", () => {
      controller.activeTab = "emoticons"
      const event = new KeyboardEvent("keydown", { key: "ArrowRight" })
      event.preventDefault = vi.fn()
      controller.onTabKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.activeTab).toBe("icons")
    })

    it("switches from icons to emoji with ArrowRight (wrap)", () => {
      controller.activeTab = "icons"
      const event = new KeyboardEvent("keydown", { key: "ArrowRight" })
      event.preventDefault = vi.fn()
      controller.onTabKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.activeTab).toBe("emoji")
    })

    it("switches from emoticons to emoji with ArrowLeft", () => {
      controller.activeTab = "emoticons"
      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" })
      event.preventDefault = vi.fn()
      controller.onTabKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.activeTab).toBe("emoji")
    })

    it("switches from emoji to icons with ArrowLeft (wrap)", () => {
      controller.activeTab = "emoji"
      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" })
      event.preventDefault = vi.fn()
      controller.onTabKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.activeTab).toBe("icons")
    })

    it("switches from icons to emoticons with ArrowLeft", () => {
      controller.activeTab = "icons"
      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" })
      event.preventDefault = vi.fn()
      controller.onTabKeydown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(controller.activeTab).toBe("emoticons")
    })

    it("ignores other keys", () => {
      controller.activeTab = "emoji"
      const event = new KeyboardEvent("keydown", { key: "Enter" })
      event.preventDefault = vi.fn()
      controller.onTabKeydown(event)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(controller.activeTab).toBe("emoji")
    })

    describe("Enter", () => {
      it("selects current item and dispatches event", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        controller.selectedIndex = 0

        const event = new KeyboardEvent("keydown", { key: "Enter" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(dispatchSpy).toHaveBeenCalledWith("selected", expect.objectContaining({
          detail: expect.objectContaining({
            type: "emoji"
          })
        }))
      })

      it("dispatches emoji with shortcode format", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        controller.activeTab = "emoji"
        controller.selectedIndex = 0
        const [shortcode] = controller.filteredItems[0]

        const event = new KeyboardEvent("keydown", { key: "Enter" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(dispatchSpy).toHaveBeenCalledWith("selected", {
          detail: { text: `:${shortcode}:`, type: "emoji" }
        })
      })

      it("dispatches emoticon as raw text", () => {
        controller.switchToEmoticons()
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        controller.selectedIndex = 0
        const [, emoticon] = controller.filteredItems[0]

        const event = new KeyboardEvent("keydown", { key: "Enter" })
        event.preventDefault = vi.fn()
        controller.onKeydown(event)

        expect(dispatchSpy).toHaveBeenCalledWith("selected", {
          detail: { text: emoticon, type: "emoticons" }
        })
      })
    })
  })

  describe("mouse interaction", () => {
    beforeEach(() => {
      controller.open()
    })

    describe("onHover()", () => {
      it("updates selected index on hover", () => {
        const mockEvent = {
          currentTarget: { dataset: { index: "5" } }
        }
        controller.onHover(mockEvent)

        expect(controller.selectedIndex).toBe(5)
      })

      it("does nothing for same index", () => {
        controller.selectedIndex = 5
        const renderSpy = vi.spyOn(controller, "renderGrid")

        const mockEvent = {
          currentTarget: { dataset: { index: "5" } }
        }
        controller.onHover(mockEvent)

        expect(renderSpy).not.toHaveBeenCalled()
      })
    })

    describe("selectFromClick()", () => {
      it("dispatches emoji selection on click", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        controller.activeTab = "emoji"

        const mockEvent = {
          currentTarget: { dataset: { shortcode: "smile" } }
        }
        controller.selectFromClick(mockEvent)

        expect(dispatchSpy).toHaveBeenCalledWith("selected", {
          detail: { text: ":smile:", type: "emoji" }
        })
      })

      it("dispatches emoticon selection on click", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        controller.activeTab = "emoticons"

        const mockEvent = {
          currentTarget: { dataset: { emoticon: "(◕‿◕)" } }
        }
        controller.selectFromClick(mockEvent)

        expect(dispatchSpy).toHaveBeenCalledWith("selected", {
          detail: { text: "(◕‿◕)", type: "emoticons" }
        })
      })

      it("dispatches icon selection on click", () => {
        const dispatchSpy = vi.spyOn(controller, "dispatch")
        controller.activeTab = "icons"

        const mockEvent = {
          currentTarget: { dataset: { name: "heart" } }
        }
        controller.selectFromClick(mockEvent)

        expect(dispatchSpy).toHaveBeenCalledWith("selected", {
          detail: { text: ":ph-heart:", type: "icons" }
        })
      })
    })
  })

  describe("rendering", () => {
    describe("renderEmojiGrid()", () => {
      beforeEach(() => {
        controller.open()
      })

      it("renders emoji buttons with data attributes", () => {
        const buttons = controller.gridTarget.querySelectorAll("button")
        expect(buttons.length).toBeGreaterThan(0)

        const firstButton = buttons[0]
        expect(firstButton.dataset.index).toBe("0")
        expect(firstButton.dataset.shortcode).toBeDefined()
        expect(firstButton.dataset.emoji).toBeDefined()
      })

      it("highlights selected item", () => {
        controller.selectedIndex = 0
        controller.renderGrid()

        const selectedButton = controller.gridTarget.querySelector('[data-index="0"]')
        expect(selectedButton.classList.contains("bg-[var(--theme-accent)]")).toBe(true)
      })
    })

    describe("renderEmoticonGrid()", () => {
      beforeEach(() => {
        controller.open()
        controller.switchToEmoticons()
      })

      it("renders emoticon buttons with data attributes", () => {
        const buttons = controller.gridTarget.querySelectorAll("button")
        expect(buttons.length).toBeGreaterThan(0)

        const firstButton = buttons[0]
        expect(firstButton.dataset.index).toBe("0")
        expect(firstButton.dataset.name).toBeDefined()
        expect(firstButton.dataset.emoticon).toBeDefined()
      })

      it("uses different column count for emoticons", () => {
        expect(controller.gridTarget.style.gridTemplateColumns).toContain("repeat(5")
      })
    })

    describe("renderIconGrid()", () => {
      beforeEach(() => {
        controller.open()
        controller.switchToIcons()
      })

      it("renders icon buttons with an inline SVG", () => {
        const buttons = controller.gridTarget.querySelectorAll("button")
        expect(buttons.length).toBeGreaterThan(0)

        const firstButton = buttons[0]
        expect(firstButton.dataset.index).toBe("0")
        expect(firstButton.dataset.name).toBeDefined()
        expect(firstButton.querySelector("svg")).not.toBeNull()
      })

      it("uses different column count for icons", () => {
        expect(controller.gridTarget.style.gridTemplateColumns).toContain("repeat(8")
      })
    })

    describe("updatePreview()", () => {
      it("shows emoji preview with shortcode", () => {
        controller.activeTab = "emoji"
        controller.filteredItems = [["smile", "😄", "happy"]]
        controller.selectedIndex = 0
        controller.updatePreview()

        expect(controller.previewTarget.innerHTML).toContain("😄")
        expect(controller.previewTarget.innerHTML).toContain(":smile:")
      })

      it("shows emoticon preview with name", () => {
        controller.activeTab = "emoticons"
        controller.filteredItems = [["happy", "(◕‿◕)", "smile"]]
        controller.selectedIndex = 0
        controller.updatePreview()

        expect(controller.previewTarget.innerHTML).toContain("(◕‿◕)")
        expect(controller.previewTarget.innerHTML).toContain("happy")
      })

      it("shows icon preview with shortcode and inline SVG", () => {
        controller.activeTab = "icons"
        controller.filteredItems = [["heart", "M1 2 3", "0 0 256 256", "love"]]
        controller.selectedIndex = 0
        controller.updatePreview()

        expect(controller.previewTarget.innerHTML).toContain("<svg")
        expect(controller.previewTarget.innerHTML).toContain(":ph-heart:")
      })

      it("clears preview when no items", () => {
        controller.filteredItems = []
        controller.updatePreview()

        expect(controller.previewTarget.innerHTML).toBe("")
      })
    })
  })

  describe("dispatchSelected()", () => {
    it("dispatches selected event with text", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.activeTab = "emoji"
      controller.dispatchSelected(":test:")

      expect(dispatchSpy).toHaveBeenCalledWith("selected", {
        detail: { text: ":test:", type: "emoji" }
      })
    })

    it("closes dialog after dispatch", () => {
      controller.dispatchSelected(":test:")
      expect(controller.dialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("i18n support", () => {
    describe("connect() i18n initialization", () => {
      it("initializes i18n properties during connect", () => {
        // After connect completes asynchronously, i18nSearchIndex should be a Map
        // (either from loaded data or empty Map on error)
        // We verify the property exists and the loading mechanism works
        expect(controller.i18nSearchIndex === null || controller.i18nSearchIndex instanceof Map).toBe(true)
      })

      it("has i18nLoaded property", () => {
        // After async loading, this should be true or false depending on load state
        expect(typeof controller.i18nLoaded).toBe("boolean")
      })
    })

    describe("loadI18nData()", () => {
      it("sets i18nLoaded to true after loading completes", async () => {
        // Reset and reload to verify the loading mechanism works
        controller.i18nLoaded = false
        controller.i18nSearchIndex = null

        await controller.loadI18nData()

        // After loadI18nData completes (success or fallback), these should be set
        expect(controller.i18nLoaded).toBe(true)
        expect(controller.i18nSearchIndex).toBeInstanceOf(Map)
      })

      it("builds search index with emoji data", async () => {
        // Reset and reload
        controller.i18nLoaded = false
        controller.i18nSearchIndex = null

        await controller.loadI18nData()

        // The index should contain emojis from our mock data
        expect(controller.i18nSearchIndex).toBeInstanceOf(Map)
        expect(controller.i18nSearchIndex.has("😀")).toBe(true)
        expect(controller.i18nSearchIndex.has("😂")).toBe(true)
      })

      it("results in a Map even if loading fails", async () => {
        // Reset state
        controller.i18nLoaded = false
        controller.i18nSearchIndex = null

        // Override fetch to simulate failure
        global.fetch = vi.fn().mockRejectedValue(new Error("network error"))

        await controller.loadI18nData()

        // Should always have a Map (empty on error)
        expect(controller.i18nSearchIndex).toBeInstanceOf(Map)
      })

      it("skips loading if already loaded", async () => {
        // Mark as already loaded
        controller.i18nLoaded = true
        const existingIndex = new Map([["test", { searchTerms: "test" }]])
        controller.i18nSearchIndex = existingIndex

        await controller.loadI18nData()

        // Should keep existing index unchanged
        expect(controller.i18nSearchIndex).toBe(existingIndex)
      })
    })

    describe("searchEmojisWithI18n()", () => {
      beforeEach(() => {
        // Setup i18n search index with translated terms
        controller.i18nSearchIndex = new Map([
          ["😀", { label: "rosto sorridente", tags: ["feliz"], searchTerms: "rosto sorridente feliz" }],
          ["😂", { label: "rosto chorando", tags: ["rindo"], searchTerms: "rosto chorando rindo" }],
          ["❤️", { label: "coração", tags: ["amor"], searchTerms: "coração amor" }]
        ])
      })

      it("finds emoji by English shortcode", () => {
        const results = controller.searchEmojisWithI18n("grin")
        expect(results.some(([shortcode]) => shortcode.includes("grin"))).toBe(true)
      })

      it("finds emoji by English keywords", () => {
        const results = controller.searchEmojisWithI18n("happy")
        expect(results.length).toBeGreaterThan(0)
      })

      it("finds emoji by translated terms", () => {
        const results = controller.searchEmojisWithI18n("feliz")
        // Should find 😀 because "feliz" is in its translated searchTerms
        expect(results.some(([, emoji]) => emoji === "😀")).toBe(true)
      })

      it("finds emoji by translated label", () => {
        const results = controller.searchEmojisWithI18n("coração")
        expect(results.some(([, emoji]) => emoji === "❤️")).toBe(true)
      })

      it("returns empty array when no matches", () => {
        const results = controller.searchEmojisWithI18n("xyznonexistent123")
        expect(results.length).toBe(0)
      })

      it("supports multi-word search", () => {
        const results = controller.searchEmojisWithI18n("rosto sorridente")
        expect(results.some(([, emoji]) => emoji === "😀")).toBe(true)
      })

      it("works when i18n index is not loaded", () => {
        controller.i18nSearchIndex = null
        // Should still find by English terms
        const results = controller.searchEmojisWithI18n("smile")
        expect(results.length).toBeGreaterThan(0)
      })
    })

    describe("onInput() with i18n", () => {
      beforeEach(() => {
        controller.i18nSearchIndex = new Map([
          ["😀", { label: "rosto sorridente", tags: ["feliz"], searchTerms: "rosto sorridente feliz" }]
        ])
        controller.activeTab = "emoji"
      })

      it("uses i18n search for emoji tab", () => {
        const searchSpy = vi.spyOn(controller, "searchEmojisWithI18n")
        controller.inputTarget.value = "feliz"
        controller.onInput()

        expect(searchSpy).toHaveBeenCalledWith("feliz")
      })

      it("does not use i18n search for emoticons tab", () => {
        controller.activeTab = "emoticons"
        controller.filteredItems = [...controller.allEmoticons]
        const searchSpy = vi.spyOn(controller, "searchEmojisWithI18n")

        controller.inputTarget.value = "happy"
        controller.onInput()

        expect(searchSpy).not.toHaveBeenCalled()
      })
    })
  })
})
