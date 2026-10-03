/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import {
  createTypewriterExtension,
  toggleTypewriter,
  isTypewriterEnabled,
  getTypewriterSyncData,
  refreshTypewriterLayout,
  setTypewriterMode,
  typewriterState
} from "../../../app/javascript/lib/codemirror_typewriter.js"

describe("codemirror_typewriter", () => {
  let view, container

  beforeEach(() => {
    container = document.createElement("div")
    container.style.height = "300px"
    document.body.appendChild(container)
  })

  afterEach(() => {
    if (view) {
      view.destroy()
      view = null
    }
    container.remove()
  })

  function createEditor(enabled = false, content = "Hello World") {
    const state = EditorState.create({
      doc: content,
      extensions: createTypewriterExtension(enabled)
    })
    view = new EditorView({ state, parent: container })
    return view
  }

  describe("createTypewriterExtension()", () => {
    it("returns an array of extensions", () => {
      const extensions = createTypewriterExtension()
      expect(Array.isArray(extensions)).toBe(true)
      expect(extensions.length).toBeGreaterThan(0)
    })

    it("initializes with enabled=false by default", () => {
      createEditor(false)
      expect(isTypewriterEnabled(view)).toBe(false)
    })

    it("initializes with enabled=true when specified", () => {
      createEditor(true)
      expect(isTypewriterEnabled(view)).toBe(true)
    })
  })

  describe("toggleTypewriter()", () => {
    it("enables typewriter mode", () => {
      createEditor(false)
      expect(isTypewriterEnabled(view)).toBe(false)

      toggleTypewriter(view, true)

      expect(isTypewriterEnabled(view)).toBe(true)
    })

    it("disables typewriter mode", () => {
      createEditor(true)
      expect(isTypewriterEnabled(view)).toBe(true)

      toggleTypewriter(view, false)

      expect(isTypewriterEnabled(view)).toBe(false)
    })

    it("adds typewriter-mode class when enabled", async () => {
      createEditor(false)
      toggleTypewriter(view, true)

      // Wait for async class updates
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(view.dom.classList.contains("typewriter-mode")).toBe(true)
    })

    it("removes typewriter-mode class when disabled", async () => {
      createEditor(true)

      // Wait for initial class
      await new Promise(resolve => setTimeout(resolve, 10))

      toggleTypewriter(view, false)

      // Wait for class removal
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(view.dom.classList.contains("typewriter-mode")).toBe(false)
    })
  })

  describe("isTypewriterEnabled()", () => {
    it("returns false when disabled", () => {
      createEditor(false)
      expect(isTypewriterEnabled(view)).toBe(false)
    })

    it("returns true when enabled", () => {
      createEditor(true)
      expect(isTypewriterEnabled(view)).toBe(true)
    })
  })

  describe("getTypewriterSyncData()", () => {
    it("returns currentLine and totalLines", () => {
      createEditor(false, "Line 1\nLine 2\nLine 3")
      const data = getTypewriterSyncData(view)

      expect(data).toHaveProperty("currentLine")
      expect(data).toHaveProperty("totalLines")
      expect(data.totalLines).toBe(3)
    })

    it("returns correct current line based on cursor", () => {
      createEditor(false, "Line 1\nLine 2\nLine 3")

      // Move cursor to line 2
      view.dispatch({
        selection: { anchor: 10 } // Middle of Line 2
      })

      const data = getTypewriterSyncData(view)
      expect(data.currentLine).toBe(2)
    })
  })

  describe("setTypewriterMode effect", () => {
    it("is defined", () => {
      expect(setTypewriterMode).toBeDefined()
      expect(typeof setTypewriterMode.of).toBe("function")
    })

    it("can be used in dispatch", () => {
      createEditor(false)

      view.dispatch({
        effects: setTypewriterMode.of(true)
      })

      expect(isTypewriterEnabled(view)).toBe(true)
    })
  })

  describe("typewriterState field", () => {
    it("is defined", () => {
      expect(typewriterState).toBeDefined()
    })

    it("can be read from state", () => {
      createEditor(true)
      const enabled = view.state.field(typewriterState)
      expect(enabled).toBe(true)
    })
  })

  describe("scroll behavior", () => {
    it("adds padding when enabled", async () => {
      createEditor(true)

      // Wait for padding to be applied
      await new Promise(resolve => setTimeout(resolve, 20))

      const paddingBottom = view.scrollDOM.style.paddingBottom
      expect(paddingBottom).toBeTruthy()
      // Padding should be some value in pixels
      expect(paddingBottom.includes("px")).toBe(true)
    })

    it("removes padding when disabled", async () => {
      createEditor(true)

      // Wait for initial padding
      await new Promise(resolve => setTimeout(resolve, 20))

      toggleTypewriter(view, false)

      // Wait for padding removal
      await new Promise(resolve => setTimeout(resolve, 20))

      const paddingBottom = view.scrollDOM.style.paddingBottom
      expect(paddingBottom === "" || paddingBottom === "0px" || !paddingBottom).toBe(true)
    })

    it("recalculates padding and recenters after a hidden editor becomes visible", () => {
      createEditor(false, "Line 1\nLine 2")
      const scroller = view.scrollDOM
      Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 0 })
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 0 })

      toggleTypewriter(view, true)
      expect(scroller.style.paddingBottom).toBe("0px")

      Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 })
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1000 })
      view.dom.getBoundingClientRect = () => ({ top: 0 })
      view.coordsAtPos = () => ({ top: 600 })
      refreshTypewriterLayout(view)

      expect(scroller.style.paddingBottom).toBe("200px")
      expect(scroller.scrollTop).toBe(400)
    })
  })
})
