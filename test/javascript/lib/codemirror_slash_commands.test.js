/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CompletionContext } from "@codemirror/autocomplete"
import { EditorState } from "@codemirror/state"
import { markdown } from "@codemirror/lang-markdown"
import {
  createSlashCommandCompletionSource,
  setSlashCommandsEnabledProvider
} from "../../../app/javascript/lib/codemirror_slash_commands.js"

const source = createSlashCommandCompletionSource()

function complete(text, cursor = text.length, view = undefined) {
  const state = EditorState.create({
    doc: text,
    extensions: [markdown()]
  })
  const result = source(new CompletionContext(state, cursor, false, view))
  return { state, result }
}

describe("CodeMirror slash commands", () => {
  beforeEach(() => {
    setSlashCommandsEnabledProvider(() => true)
  })

  afterEach(() => {
    setSlashCommandsEnabledProvider(() => false)
  })

  it("offers localized heading commands from a slash typed inside a paragraph", () => {
    const { result } = complete("An existing paragraph /he")

    expect(result?.options.map(option => option.label)).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3"
    ])
    expect(result?.from).toBe("An existing paragraph /".length)
    expect(result?.options[0].filterText).toContain("h1")
    expect(result?.validFor.test("heading 1")).toBe(true)
  })

  it.each([
    [1, "# "],
    [2, "## "],
    [3, "### "]
  ])("applies Heading %i in place and preserves text around the query", (level, marker) => {
    const text = "Before /head after"
    const cursor = text.indexOf(" after")
    const { state, result } = complete(text, cursor)
    let currentState = state
    const view = {
      get state() { return currentState },
      dispatch(transaction) {
        currentState = currentState.update(transaction).state
      }
    }

    const command = result.options.find(option => option.label === `Heading ${level}`)
    command.apply(view, command, result.from, cursor)

    expect(view.state.doc.toString()).toBe(`${marker}Before after`)
    expect(view.state.selection.main.head).toBe(`${marker}Before `.length)
  })

  it("keeps a soft-line-break paragraph in one heading", () => {
    const text = "First line /h1\nsecond line"
    const cursor = text.indexOf("\n")
    const { state, result } = complete(text, cursor)
    let currentState = state
    const view = {
      get state() { return currentState },
      dispatch(transaction) {
        currentState = currentState.update(transaction).state
      }
    }
    const command = result.options.find(option => option.label === "Heading 1")

    command.apply(view, command, result.from, cursor)

    expect(view.state.doc.toString()).toBe("# First line second line")
  })

  it("can change the level of an existing ATX heading", () => {
    const text = "## Existing /h2"
    const { state, result } = complete(text)
    let currentState = state
    const view = {
      get state() { return currentState },
      dispatch(transaction) {
        currentState = currentState.update(transaction).state
      }
    }
    const command = result.options.find(option => option.label === "Heading 3")

    command.apply(view, command, result.from, text.length)

    expect(view.state.doc.toString()).toBe("### Existing")
  })

  it.each([
    ["inline code", "`example /heading`", "example /heading".length + 1],
    ["fenced code", "```md\n/heading\n```", "```md\n/heading".length]
  ])("does not trigger inside %s", (_label, text, cursor) => {
    expect(complete(text, cursor).result).toBeNull()
  })

  it("does not trigger while the active file is not Markdown", () => {
    setSlashCommandsEnabledProvider(() => false)

    expect(complete("Text /heading").result).toBeNull()
  })

  it("does not trigger in Vim Normal mode but does in Insert mode", () => {
    const normalView = { cm: { state: { vim: { insertMode: false } } } }
    const insertView = { cm: { state: { vim: { insertMode: true } } } }

    expect(complete("Text /heading", undefined, normalView).result).toBeNull()
    expect(complete("Text /heading", undefined, insertView).result).not.toBeNull()
  })

  it("leaves the slash query in the document until a command is selected", () => {
    const text = "Text /heading"
    const { state, result } = complete(text)

    expect(result).not.toBeNull()
    expect(state.doc.toString()).toBe(text)
  })

  it("does not treat a slash inside a path as a command", () => {
    expect(complete("docs/heading").result).toBeNull()
  })
})
