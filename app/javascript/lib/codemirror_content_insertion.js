// CodeMirror Content Insertion - Unified content insertion utilities
// Consolidates the repeated insertion patterns for table, code, image, video, emoji

/**
 * Calculate newline prefix needed before insertion
 * @param {string} textBefore - Text before cursor
 * @returns {string} - Newline prefix ("", "\n", or "\n\n")
 */
function calculateNewlinePrefix(textBefore) {
  if (textBefore.length === 0) return ""
  if (textBefore.endsWith("\n\n")) return ""
  if (textBefore.endsWith("\n")) return "\n"
  return "\n\n"
}

/**
 * Calculate newline suffix needed after insertion
 * @param {string} textAfter - Text after cursor
 * @returns {string} - Newline suffix ("", "\n", or "\n\n")
 */
function calculateNewlineSuffix(textAfter) {
  if (textAfter.length === 0) return ""
  if (textAfter.startsWith("\n\n")) return ""
  if (textAfter.startsWith("\n")) return "\n"
  return "\n\n"
}

/**
 * Insert block content at cursor position with proper newline handling
 * Used for tables, code blocks, images, videos - content that needs blank lines around it
 *
 * @param {Object} controller - CodeMirror controller
 * @param {string} content - Content to insert
 * @param {Object} options - Insertion options
 * @param {boolean} options.editMode - If true, replace existing content at startPos/endPos
 * @param {number} options.startPos - Start position for edit mode
 * @param {number} options.endPos - End position for edit mode
 * @param {number} options.from - Replace-range start for slash-command insertion
 * @param {number} options.to - Replace-range end for slash-command insertion
 * @param {number} options.cursorOffset - Offset from start of inserted content for final cursor position
 * @returns {number} - New cursor position
 */
export function insertBlockContent(controller, content, options = {}) {
  if (!controller || !content) return 0

  const { editMode = false, startPos = 0, endPos = 0, from, to, cursorOffset = null } = options
  const text = controller.getValue()

  if (editMode) {
    // Replace existing content at specified range
    controller.replaceRange(content, startPos, endPos)
    const newCursorPos = cursorOffset !== null
      ? startPos + cursorOffset
      : startPos + content.length
    controller.setSelection(newCursorPos, newCursorPos)
    return newCursorPos
  }

  // Insert at the cursor or replace the pending slash query with proper newlines.
  const hasReplaceRange = Number.isInteger(from) && Number.isInteger(to)
  let cursorPos = hasReplaceRange ? from : controller.getCursorPosition().offset
  let replaceTo = hasReplaceRange ? to : cursorPos
  let before = text.substring(0, cursorPos)
  let after = text.substring(replaceTo)

  if (hasReplaceRange) {
    const trailingWhitespace = before.match(/[ \t]*$/)?.[0] || ""
    const leadingWhitespace = after.match(/^[ \t]*/)?.[0] || ""
    cursorPos -= trailingWhitespace.length
    replaceTo += leadingWhitespace.length
    before = before.slice(0, before.length - trailingWhitespace.length)
    after = after.slice(leadingWhitespace.length)
  }

  const prefix = calculateNewlinePrefix(before)
  const suffix = calculateNewlineSuffix(after)

  const insert = prefix + content + suffix
  if (hasReplaceRange) {
    controller.replaceRange(insert, cursorPos, replaceTo)
  } else {
    controller.insertAt(cursorPos, insert)
  }

  const newCursorPos = cursorOffset !== null
    ? cursorPos + prefix.length + cursorOffset
    : cursorPos + insert.length
  controller.setSelection(newCursorPos, newCursorPos)

  return newCursorPos
}

/**
 * Insert inline content at cursor/selection position
 * Used for emoji, simple text insertions
 *
 * @param {Object} controller - CodeMirror controller
 * @param {string} content - Content to insert
 * @param {Object} options - Insertion options
 * @param {boolean} options.replaceSelection - If true, replace current selection
 * @param {number} options.from - Replace-range start for slash-command insertion
 * @param {number} options.to - Replace-range end for slash-command insertion
 * @returns {number} - New cursor position
 */
export function insertInlineContent(controller, content, options = {}) {
  if (!controller || !content) return 0

  const { replaceSelection = true, from: requestedFrom, to: requestedTo } = options
  const hasReplaceRange = Number.isInteger(requestedFrom) && Number.isInteger(requestedTo)
  const selection = controller.getSelection()
  const from = hasReplaceRange ? requestedFrom : selection.from
  const to = hasReplaceRange ? requestedTo : selection.to

  if (replaceSelection) {
    controller.replaceRange(content, from, to)
  } else {
    controller.insertAt(from, content)
  }

  const newPosition = from + content.length
  controller.setSelection(newPosition, newPosition)

  return newPosition
}

/**
 * Insert image markdown at cursor
 * @param {Object} controller - CodeMirror controller
 * @param {string} markdown - Image markdown (e.g., "![alt](url)")
 * @returns {number} - New cursor position
 */
export function insertImage(controller, markdown, options = {}) {
  if (!controller || !markdown) return 0

  const hasReplaceRange = Number.isInteger(options.from) && Number.isInteger(options.to)
  const selection = controller.getSelection()
  let from = hasReplaceRange ? options.from : selection.from
  let to = hasReplaceRange ? options.to : selection.to
  const text = controller.getValue()
  let before = text.substring(0, from)
  let after = text.substring(to)

  if (hasReplaceRange) {
    const trailingWhitespace = before.match(/[ \t]*$/)?.[0] || ""
    const leadingWhitespace = after.match(/^[ \t]*/)?.[0] || ""
    from -= trailingWhitespace.length
    to += leadingWhitespace.length
    before = before.slice(0, before.length - trailingWhitespace.length)
    after = after.slice(leadingWhitespace.length)
  }

  // Images only need single newlines
  const needsNewlineBefore = before.length > 0 && !before.endsWith("\n")
  const needsNewlineAfter = after.length > 0 && !after.startsWith("\n")

  const insert = (needsNewlineBefore ? "\n" : "") + markdown + (needsNewlineAfter ? "\n" : "")
  controller.replaceRange(insert, from, to)

  const newPosition = from + insert.length
  controller.setSelection(newPosition, newPosition)

  return newPosition
}

/**
 * Insert table markdown at cursor or replace existing table
 * @param {Object} controller - CodeMirror controller
 * @param {string} markdown - Table markdown
 * @param {Object} options - Options for edit mode
 * @returns {number} - New cursor position
 */
export function insertTable(controller, markdown, options = {}) {
  return insertBlockContent(controller, markdown, options)
}

/**
 * Insert code block at cursor or replace existing block
 * @param {Object} controller - CodeMirror controller
 * @param {string} codeBlock - Complete code block with fences
 * @param {string} language - Language for cursor positioning
 * @param {Object} options - Options for edit mode
 * @returns {number} - New cursor position (inside the code block)
 */
export function insertCodeBlock(controller, codeBlock, language = "", options = {}) {
  // Position cursor at first line of content (after ```language\n)
  const cursorOffset = 3 + language.length + 1
  return insertBlockContent(controller, codeBlock, { ...options, cursorOffset })
}

/**
 * Insert video embed at cursor
 * @param {Object} controller - CodeMirror controller
 * @param {string} embedCode - Video embed markdown/HTML
 * @returns {number} - New cursor position
 */
export function insertVideoEmbed(controller, embedCode, options = {}) {
  return insertBlockContent(controller, embedCode, options)
}
