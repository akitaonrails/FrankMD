// Slash-command completion for CodeMirror's Markdown editor.

import { syntaxTree } from "@codemirror/language"

let isEnabledProvider = () => false

const HEADING_COMMANDS = [1, 2, 3].map((level) => ({
  name: `heading-${level}`,
  level,
  labelKey: `editor.slash_commands.heading_${level}`,
  fallbackLabel: `Heading ${level}`
}))

const BLOCK_COMMANDS = [
  { name: "bulleted-list", kind: "bulletedList", labelKey: "editor.slash_commands.bulleted_list", fallbackLabel: "Bulleted list", filterText: "bullet bulleted unordered list" },
  { name: "numbered-list", kind: "numberedList", labelKey: "editor.slash_commands.numbered_list", fallbackLabel: "Numbered list", filterText: "numbered ordered list" },
  { name: "to-do-list", kind: "todoList", labelKey: "editor.slash_commands.to_do_list", fallbackLabel: "To-do list", filterText: "to-do todo task checklist" },
  { name: "quote", kind: "quote", labelKey: "editor.slash_commands.quote", fallbackLabel: "Quote", filterText: "quote blockquote" },
  { name: "code-block", kind: "codeBlock", labelKey: "editor.slash_commands.code_block", fallbackLabel: "Code block", filterText: "code block fenced" },
  { name: "divider", kind: "divider", labelKey: "editor.slash_commands.divider", fallbackLabel: "Divider", filterText: "divider horizontal rule hr" }
]

const CODE_NODE_NAMES = new Set(["FencedCode", "CodeText", "InlineCode"])
const EDITABLE_BLOCK_NAMES = new Set([
  "Paragraph", "ATXHeading1", "ATXHeading2", "ATXHeading3",
  "ATXHeading4", "ATXHeading5", "ATXHeading6"
])

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

function getBlockContext(block) {
  const context = { listItem: null, listMark: null, listKind: null, blockquote: null }
  for (let node = block?.parent; node; node = node.parent) {
    if (node.name === "ListItem" && !context.listItem) {
      context.listItem = node
      context.listMark = node.getChild("ListMark")
    }
    if (node.name === "BulletList" || node.name === "OrderedList") context.listKind = node.name
    if (node.name === "Blockquote") context.blockquote = node
  }
  return context
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
  } else if (after.startsWith("\n") && /[ \t]+$/.test(before)) {
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

function removeSlashQuery(original, slashOffset, queryEndOffset) {
  if (slashOffset < 0 || queryEndOffset < slashOffset || queryEndOffset > original.length) return null

  let before = original.slice(0, slashOffset)
  let after = original.slice(queryEndOffset)
  if (/[ \t]$/.test(before) && /^[ \t]/.test(after)) {
    after = after.slice(1)
  } else if (before.length === 0 && /^[ \t]/.test(after)) {
    after = after.slice(1)
  } else if (!after.trim() && /[ \t]+$/.test(before)) {
    before = before.replace(/[ \t]+$/, "")
  } else if (after.startsWith("\n") && /[ \t]+$/.test(before)) {
    before = before.replace(/[ \t]+$/, "")
  }

  return { text: before + after, cursorOffset: before.length }
}

function stripHeadingMarker(text, cursorOffset) {
  const leadingWhitespace = text.match(/^[ \t]*/)?.[0] || ""
  let body = text.slice(leadingWhitespace.length)
  let bodyCursor = Math.max(0, cursorOffset - leadingWhitespace.length)
  const marker = body.match(/^#{1,6}(?:[ \t]+|$)/)
  if (marker) {
    body = body.slice(marker[0].length)
    bodyCursor = Math.max(0, bodyCursor - marker[0].length)
  }
  return { leadingWhitespace, text: body, cursorOffset: Math.min(bodyCursor, body.length) }
}

function prefixLines(text, firstPrefix, continuationPrefix = firstPrefix) {
  return firstPrefix + text.replace(/\n/g, `\n${continuationPrefix}`)
}

function offsetWithLinePrefixes(text, cursorOffset, firstPrefix, continuationPrefix = firstPrefix) {
  const lineBreaksBeforeCursor = (text.slice(0, cursorOffset).match(/\n/g) || []).length
  return firstPrefix.length + cursorOffset + (lineBreaksBeforeCursor * continuationPrefix.length)
}

function fencedCode(text) {
  const longestBacktickRun = Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length))
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1))
  return { fence, text: `${fence}\n${text}\n${fence}` }
}

function replaceWithBlockCommand(view, kind, queryFrom, queryTo) {
  const state = view.state
  const slashFrom = queryFrom - 1
  const block = getEditableBlock(state, slashFrom)
  if (!block) return

  const original = state.sliceDoc(block.from, block.to)
  const cleaned = removeSlashQuery(original, slashFrom - block.from, queryTo - block.from)
  if (!cleaned) return

  const context = getBlockContext(block)
  const normalized = stripHeadingMarker(cleaned.text, cleaned.cursorOffset)
  const leadingWhitespace = normalized.leadingWhitespace
  const body = normalized.text
  const cursorOffset = normalized.cursorOffset
  const content = leadingWhitespace + body
  const contentCursorOffset = leadingWhitespace.length + cursorOffset
  const changes = []
  let replacement = content
  let replacementCursor = contentCursorOffset
  let cursorAbsolute

  if (kind === "bulletedList" || kind === "numberedList" || kind === "todoList") {
    const requestedListKind = kind === "numberedList" ? "OrderedList" : "BulletList"
    const listPrefix = kind === "numberedList" ? "1. " : kind === "todoList" ? "- [ ] " : "- "

    if (context.listItem && context.listMark) {
      // Reuse the current list item so selecting the same command never stacks
      // another marker. Switch the list mark only when the requested kind differs.
      if (kind !== "todoList" && context.listKind !== requestedListKind) {
        changes.push({ from: context.listMark.from, to: context.listMark.to, insert: kind === "numberedList" ? "1." : "-" })
      }
      const hasTaskMarker = /^[ \t]*\[[ xX]\](?:[ \t]+|$)/.test(replacement)
      if (kind === "todoList" && !hasTaskMarker) {
        replacement = `${leadingWhitespace}[ ] ${body}`
        replacementCursor += 4
      }
    } else {
      const hasTaskMarker = /^[ \t]*\[[ xX]\](?:[ \t]+|$)/.test(replacement)
      const prefix = kind === "todoList" && hasTaskMarker ? "- " : listPrefix
      const continuationIndent = " ".repeat(prefix.length)
      replacement = `${leadingWhitespace}${prefixLines(body, prefix, continuationIndent)}`
      replacementCursor = leadingWhitespace.length + offsetWithLinePrefixes(body, cursorOffset, prefix, continuationIndent)
    }
  } else if (kind === "quote") {
    if (!context.blockquote) {
      replacement = `${leadingWhitespace}${prefixLines(body, "> ")}`
      replacementCursor = leadingWhitespace.length + offsetWithLinePrefixes(body, cursorOffset, "> ")
    }
  } else if (kind === "codeBlock") {
    const { fence, text: fencedText } = fencedCode(content)
    let continuationPrefix = ""
    if (context.blockquote) {
      continuationPrefix = "> "
    } else if (context.listItem && context.listMark) {
      continuationPrefix = " ".repeat(Math.max(1, block.from - context.listMark.from))
    }
    replacement = prefixLines(fencedText, "", continuationPrefix)
    replacementCursor = `${fence}\n`.length + contentCursorOffset
    replacementCursor += (content.slice(0, contentCursorOffset).match(/\n/g) || []).length * continuationPrefix.length
  } else if (kind === "divider") {
    replacement = cleaned.text
    replacementCursor = cleaned.cursorOffset
  }

  changes.push({ from: block.from, to: block.to, insert: replacement })

  let separatorInsertion = null
  if (kind === "divider") {
    const afterBlock = context.listItem?.to ?? context.blockquote?.to ?? block.to
    separatorInsertion = { from: afterBlock, to: afterBlock, insert: "\n\n---" }
    changes.push(separatorInsertion)
  }

  cursorAbsolute = block.from + replacementCursor
  for (const change of changes) {
    if (change.from < block.from) cursorAbsolute += change.insert.length - (change.to - change.from)
  }

  view.dispatch({
    changes,
    selection: { anchor: cursorAbsolute },
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
    const headingOptions = HEADING_COMMANDS.map((command) => {
      const label = localizedLabel(command.labelKey, command.fallbackLabel)
      return {
        label,
        type: "keyword",
        filterText: `${label} heading ${command.level} heading${command.level} h${command.level}`,
        apply: (view, _completion, from, to) => replaceWithHeading(view, command.level, from, to)
      }
    })
    const blockOptions = BLOCK_COMMANDS.map((command) => {
      const label = localizedLabel(command.labelKey, command.fallbackLabel)
      return {
        label,
        type: "keyword",
        filterText: `${label} ${command.filterText}`,
        apply: (view, _completion, from, to) => replaceWithBlockCommand(view, command.kind, from, to)
      }
    })

    return {
      from: queryFrom,
      options: [...headingOptions, ...blockOptions],
      validFor: /^[\w -]*$/
    }
  }
}
