// Slash-command completion for CodeMirror's Markdown editor.

import { syntaxTree } from "@codemirror/language"

let isEnabledProvider = () => false

const HEADING_COMMANDS = [1, 2, 3].map((level) => ({
  name: `heading-${level}`,
  level,
  labelKey: `editor.slash_commands.heading_${level}`,
  fallbackLabel: `Heading ${level}`
}))

const CODE_NODE_NAMES = new Set(["FencedCode", "CodeText", "InlineCode"])
const EDITABLE_BLOCK_NAMES = new Set(["Paragraph", "ATXHeading1", "ATXHeading2", "ATXHeading3"])

/**
 * Register a live file-type check for slash commands. The editor is reused
 * across Markdown notes and the .fed config file, so this must be evaluated
 * when a completion is requested instead of when CodeMirror is constructed.
 * @param {() => boolean} provider
 */
export function setSlashCommandsEnabledProvider(provider) {
  isEnabledProvider = typeof provider === "function" ? provider : () => false
}

function localizedLabel(key, fallback) {
  if (typeof window !== "undefined" && typeof window.t === "function") {
    return window.t(key)
  }
  return fallback
}

function getEditableBlock(state, position) {
  for (let node = syntaxTree(state).resolveInner(position, -1); node; node = node.parent) {
    if (CODE_NODE_NAMES.has(node.name)) return null
    if (EDITABLE_BLOCK_NAMES.has(node.name)) return node
  }
  return null
}

function isVimNormalMode(context) {
  const vimState = context.view?.cm?.state?.vim
  return Boolean(vimState && vimState.insertMode === false)
}

function replaceWithHeading(view, level, queryFrom, queryTo) {
  const state = view.state
  const slashFrom = queryFrom - 1
  const block = getEditableBlock(state, slashFrom)
  if (!block) return

  const original = state.sliceDoc(block.from, block.to)
  const slashOffset = slashFrom - block.from
  const queryEndOffset = queryTo - block.from
  if (slashOffset < 0 || queryEndOffset < slashOffset || queryEndOffset > original.length) return

  // Remove just the slash and its query, retaining text on either side. When
  // spaces surrounded the query, keep a single separator at the join.
  let before = original.slice(0, slashOffset)
  let after = original.slice(queryEndOffset)
  if (/[ \t]$/.test(before) && /^[ \t]/.test(after)) {
    after = after.slice(1)
  } else if (before.length === 0 && /^[ \t]/.test(after)) {
    after = after.slice(1)
  } else if (!after.trim() && /[ \t]+$/.test(before)) {
    before = before.replace(/[ \t]+$/, "")
  }

  const cleanText = before + after
  const leadingWhitespace = cleanText.match(/^[ \t]*/)?.[0] || ""
  let body = cleanText.slice(leadingWhitespace.length)
  let cursorInBody = Math.max(0, before.length - leadingWhitespace.length)

  // Reapplying a heading command changes its level instead of nesting another
  // ATX marker in the heading text.
  const existingMarker = body.match(/^#{1,6}(?:[ \t]+|$)/)
  if (existingMarker) {
    body = body.slice(existingMarker[0].length)
    cursorInBody = Math.max(0, cursorInBody - existingMarker[0].length)
  }

  // A Markdown paragraph may span soft line breaks. A heading is a single
  // Markdown line, so join those breaks with spaces to keep the whole block
  // in the new heading.
  const normalizeSoftBreaks = (text) => text.replace(/[ \t]*\n[ \t]*/g, " ")
  cursorInBody = normalizeSoftBreaks(body.slice(0, cursorInBody)).length
  body = normalizeSoftBreaks(body)

  const marker = `${"#".repeat(level)} `
  const replacement = `${leadingWhitespace}${marker}${body}`
  const cursor = block.from + leadingWhitespace.length + marker.length + Math.min(cursorInBody, body.length)

  view.dispatch({
    changes: { from: block.from, to: block.to, insert: replacement },
    selection: { anchor: cursor },
    userEvent: "input.complete"
  })
}

/**
 * Create a completion source for slash commands. The query begins after the
 * slash so CodeMirror can filter labels naturally, while accepting an option
 * removes both the slash and its query from the current Markdown block.
 *
 * @returns {import("@codemirror/autocomplete").CompletionSource}
 */
export function createSlashCommandCompletionSource() {
  return (context) => {
    if (!isEnabledProvider() || isVimNormalMode(context)) return null

    const line = context.state.doc.lineAt(context.pos)
    const textBefore = line.text.slice(0, context.pos - line.from)
    // Start at the beginning of the line or after a boundary. Requiring a
    // boundary avoids opening the menu for paths such as "docs/a.md".
    const match = textBefore.match(/(?:^|[\s([{])\/([\w -]*)$/)
    if (!match) return null

    const slashFrom = line.from + match.index + match[0].length - match[1].length - 1
    if (!getEditableBlock(context.state, slashFrom)) return null

    const queryFrom = slashFrom + 1
    const options = HEADING_COMMANDS.map((command) => {
      const label = localizedLabel(command.labelKey, command.fallbackLabel)
      return {
        label,
        type: "keyword",
        filterText: `${label} heading ${command.level} heading${command.level} h${command.level}`,
        apply: (view, _completion, from, to) => replaceWithHeading(view, command.level, from, to)
      }
    })

    return {
      from: queryFrom,
      options,
      validFor: /^[\w -]*$/
    }
  }
}
