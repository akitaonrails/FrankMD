/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { EditorState } from "@codemirror/state"
import { autocompletion } from "@codemirror/autocomplete"
import { EditorView } from "@codemirror/view"
import { createEditorTheme, createSyntaxHighlighting, createTheme } from "../../../app/javascript/lib/codemirror_theme.js"

describe("codemirror_theme", () => {
  describe("createEditorTheme()", () => {
    it("returns an extension", () => {
      const theme = createEditorTheme()
      expect(theme).toBeDefined()
    })

    it("accepts font options", () => {
      const theme = createEditorTheme({
        fontFamily: "'Monaco', monospace",
        fontSize: "16px",
        lineHeight: "1.8"
      })
      expect(theme).toBeDefined()
    })

    it("uses default values when no options provided", () => {
      const theme = createEditorTheme({})
      expect(theme).toBeDefined()
    })

    it("lets autocomplete results grow to 16em before scrolling", () => {
      const view = new EditorView({
        state: EditorState.create({
          extensions: [createEditorTheme(), autocompletion()]
        }),
        parent: document.body
      })
      const tooltip = document.createElement("div")
      tooltip.className = "cm-tooltip cm-tooltip-autocomplete"
      const options = document.createElement("ul")
      tooltip.appendChild(options)
      view.dom.appendChild(tooltip)

      expect(getComputedStyle(options).height).toBe("auto")
      expect(getComputedStyle(options).maxHeight).toBe("16em")

      view.destroy()
    })
  })

  describe("createSyntaxHighlighting()", () => {
    it("returns a syntax highlighting extension", () => {
      const highlighting = createSyntaxHighlighting()
      expect(highlighting).toBeDefined()
    })
  })

  describe("createTheme()", () => {
    it("returns an array of extensions", () => {
      const theme = createTheme()
      expect(Array.isArray(theme)).toBe(true)
      expect(theme.length).toBeGreaterThan(0)
    })

    it("includes both editor theme and syntax highlighting", () => {
      const theme = createTheme()
      expect(theme.length).toBe(2)
    })

    it("accepts and passes options to editor theme", () => {
      const theme = createTheme({
        fontFamily: "'Fira Code', monospace",
        fontSize: "18px",
        lineHeight: "2.0"
      })
      expect(theme).toBeDefined()
      expect(theme.length).toBe(2)
    })
  })
})
