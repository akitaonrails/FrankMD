/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { EditorState, EditorSelection } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { history, undo, redo } from "@codemirror/commands"
import { markdownSurround } from "../../../app/javascript/lib/codemirror_markdown_surround"

let view

function editor(doc = "sample", ranges = [EditorSelection.range(0, doc.length)], extra = []) {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, selection: EditorSelection.create(ranges), extensions: [
      EditorState.allowMultipleSelections.of(true), history(), markdownSurround, ...extra
    ] })
  })
  return view
}

function type(text, userEvent = "input.type") {
  const { from, to } = view.state.selection.main
  return view.state.facet(EditorView.inputHandler)[0](view, from, to, text, () =>
    view.state.update({ changes: { from, to, insert: text }, userEvent }))
}

function selected() {
  return view.state.selection.ranges.map(range => view.state.sliceDoc(range.from, range.to))
}

afterEach(() => { view?.destroy(); view = null; vi.restoreAllMocks() })

describe("typed Markdown surround", () => {
  it.each(["*", "_", "`", "~", "^", "="])("wraps using %s and leaves the inner text selected", marker => {
    editor()
    expect(type(marker)).toBe(true)
    expect(view.state.doc.toString()).toBe(`${marker}sample${marker}`)
    expect(selected()).toEqual(["sample"])
  })

  it("adds repeated markers and undoes each surround atomically", () => {
    editor()
    type("*")
    type("*")
    expect(view.state.doc.toString()).toBe("**sample**")
    expect(selected()).toEqual(["sample"])
    undo(view)
    expect(view.state.doc.toString()).toBe("*sample*")
    undo(view)
    expect(view.state.doc.toString()).toBe("sample")
    redo(view)
    expect(view.state.doc.toString()).toBe("*sample*")
  })

  it("preserves backward, secondary, and empty ranges with Unicode", () => {
    editor("猫 🐈 abc z", [EditorSelection.range(4, 0), EditorSelection.range(5, 8), EditorSelection.cursor(10)])
    type("_")
    expect(view.state.doc.toString()).toBe("_猫 🐈_ _abc_ z_")
    expect(selected()).toEqual(["猫 🐈", "abc", ""])
    expect(view.state.selection.main.anchor).toBeGreaterThan(view.state.selection.main.head)
  })

  it("uses longer backtick delimiters and padding for embedded code markers", () => {
    editor("`sample`")
    type("`")
    expect(view.state.doc.toString()).toBe("`` `sample` ``")
    expect(selected()).toEqual(["`sample`"])
  })

  it("preserves multiline text without adding block-conversion newlines", () => {
    editor("first\nsecond")
    type("*")
    expect(view.state.doc.toString()).toBe("*first\nsecond*")
    expect(selected()).toEqual(["first\nsecond"])
  })

  it("leaves empty-cursor typing and unrelated punctuation to CodeMirror", () => {
    editor("sample", [EditorSelection.cursor(3)])
    expect(type("*")).toBe(false)
    view.dispatch({ selection: { anchor: 0, head: 6 } })
    for (const character of ["#", ">", "-", "+", "[", "(", "plain"]) expect(type(character)).toBe(false)
    expect(view.state.doc.toString()).toBe("sample")
  })

  it("does not intercept paste or composition", () => {
    editor()
    expect(type("*", "input.paste")).toBe(false)
    vi.spyOn(view, "compositionStarted", "get").mockReturnValue(true)
    expect(type("*")).toBe(false)
    expect(view.state.doc.toString()).toBe("sample")
  })

  it("does not modify read-only text", () => {
    editor("sample", undefined, [EditorState.readOnly.of(true)])
    expect(type("*")).toBe(false)
    expect(view.state.doc.toString()).toBe("sample")
  })
})
