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

function applyCommand(text, label, cursor = text.length) {
  const { state, result } = complete(text, cursor)
  const command = result?.options.find(option => option.label === label)
  if (!command) throw new Error(`Command not found: ${label}`)

  let currentState = state
  let dispatchCount = 0
  const view = {
    get state() { return currentState },
    dispatch(transaction) {
      dispatchCount += 1
      currentState = currentState.update(transaction).state
    }
  }
  command.apply(view, command, result.from, cursor)
  return { state: view.state, dispatchCount }
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

    expect(result?.options.slice(0, 3).map(option => option.label)).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3"
    ])
    expect(result?.from).toBe("An existing paragraph /".length)
    expect(result?.options[0].filterText).toContain("h1")
    expect(result?.validFor.test("heading 1")).toBe(true)
  })

  it("offers the native Markdown block commands", () => {
    const { result } = complete("Text /")

    expect(result?.options.map(option => option.label)).toEqual([
      "Heading 1", "Heading 2", "Heading 3", "Bulleted list", "Numbered list",
      "To-do list", "Quote", "Code block", "Divider"
    ])
  })

  it.each([
    ["Bulleted list", "- Before after"],
    ["Numbered list", "1. Before after"],
    ["To-do list", "- [ ] Before after"],
    ["Quote", "> Before after"],
    ["Code block", "```\nBefore after\n```"],
    ["Divider", "Before after\n\n---"]
  ])("applies %s to the paragraph and commits one editor transaction", (label, expected) => {
    const text = "Before /command after"
    const cursor = text.indexOf(" after")
    const { state, dispatchCount } = applyCommand(text, label, cursor)

    expect(state.doc.toString()).toBe(expected)
    expect(dispatchCount).toBe(1)
  })

  it.each([
    ["Bulleted list", "first /list\nsecond", "- first\n  second"],
    ["Numbered list", "first /list\nsecond", "1. first\n   second"],
    ["To-do list", "first /list\nsecond", "- [ ] first\n      second"],
    ["Quote", "first /quote\nsecond", "> first\n> second"],
    ["Code block", "first /code\nsecond", "```\nfirst\nsecond\n```"]
  ])("preserves soft line breaks when applying %s", (label, text, expected) => {
    const cursor = text.indexOf("\n")
    const { state } = applyCommand(text, label, cursor)

    expect(state.doc.toString()).toBe(expected)
  })

  it("keeps wikilinks intact when creating a to-do item", () => {
    const { state } = applyCommand("[[linked note]] /todo", "To-do list")

    expect(state.doc.toString()).toBe("- [ ] [[linked note]]")
  })

  it("does not stack an existing list marker and can change its kind", () => {
    const sameKind = applyCommand("- Existing /bullet", "Bulleted list")
    const switchedKind = applyCommand("1. Existing /bullet", "Bulleted list")

    expect(sameKind.state.doc.toString()).toBe("- Existing")
    expect(switchedKind.state.doc.toString()).toBe("- Existing")
  })

  it("preserves an existing checked task marker", () => {
    const { state } = applyCommand("- [x] Done /todo", "To-do list")

    expect(state.doc.toString()).toBe("- [x] Done")
  })

  it("does not duplicate an existing blockquote marker", () => {
    const { state } = applyCommand("> Existing /quote", "Quote")

    expect(state.doc.toString()).toBe("> Existing")
  })

  it("chooses a longer fence when the paragraph contains a backtick run", () => {
    const { state } = applyCommand("Example ```token``` /code", "Code block")

    expect(state.doc.toString()).toBe("````\nExample ```token```\n````")
    expect(state.selection.main.head).toBe("````\nExample ```token```".length)
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
