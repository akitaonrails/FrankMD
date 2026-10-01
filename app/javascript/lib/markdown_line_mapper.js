// Markdown Line Mapper
// Adds data-source-line attributes to rendered markdown elements for scroll sync
// This enables accurate editor-to-preview scroll synchronization regardless of
// images, videos, or other elements that render with different heights

import { marked } from "marked"
import { sanitizeHtml } from "lib/html_sanitizer"
import { lineAtScroll } from "lib/scroll_utils"

// Collect the absolute markdown positions of every list item inside a list
// token, depth-first in document order (an item precedes its own nested items,
// matching the <li> order marked emits). Positions are ascending.
function collectListItemPositions(listToken, listStartPos, markdown, positions) {
  let searchFrom = listStartPos

  for (const item of listToken.items || []) {
    const itemRaw = item.raw || ""
    const itemStart = markdown.indexOf(itemRaw, searchFrom)
    if (itemStart < 0) continue

    positions.push(itemStart)

    // Nested lists live inside the item's own raw text
    for (const sub of item.tokens || []) {
      if (sub.type === "list") {
        const subStart = markdown.indexOf(sub.raw || "", itemStart)
        if (subStart >= 0) collectListItemPositions(sub, subStart, markdown, positions)
      }
    }

    searchFrom = itemStart + itemRaw.length
  }
}

// Convert ascending absolute positions to 1-based source lines (+ frontmatter
// offset) with a single forward scan over the markdown.
function positionsToLines(positions, markdown, lineOffset) {
  const lines = []
  let line = 0
  let scannedTo = 0

  for (const position of positions) {
    line += (markdown.slice(scannedTo, position).match(/\n/g) || []).length
    scannedTo = position
    lines.push(line + lineOffset + 1)
  }

  return lines
}

/**
 * Parse markdown and return HTML with source line annotations
 * Uses standard marked.parse() then post-processes to add line attributes
 * @param {string} markdown - The markdown content
 * @param {number} lineOffset - Line offset (e.g., for stripped frontmatter)
 * @returns {string} - Sanitized HTML with data-source-line attributes on block
 *                    elements and on list items (task toggle, scroll sync)
 */
export function parseWithLineNumbers(markdown, lineOffset = 0) {
  if (!markdown) return ""

  // First, get tokens to know line positions
  const tokens = marked.lexer(markdown)

  // Calculate line numbers for each token
  const tokenLines = []
  const itemPositions = []
  let currentLine = 0
  let currentPos = 0

  for (const token of tokens) {
    if (token.type === "space") continue // Skip whitespace-only tokens

    const tokenText = token.raw || ""
    const tokenStart = markdown.indexOf(tokenText, currentPos)

    if (tokenStart >= 0) {
      // Count newlines from currentPos to tokenStart
      const textBefore = markdown.slice(currentPos, tokenStart)
      currentLine += (textBefore.match(/\n/g) || []).length

      tokenLines.push({
        type: token.type,
        line: currentLine + lineOffset + 1 // 1-based line numbers
      })

      // Per-item lines for lists (clickable task checkboxes, #203)
      if (token.type === "list") {
        collectListItemPositions(token, tokenStart, markdown, itemPositions)
      }

      // Move position past this token
      currentPos = tokenStart + tokenText.length
      currentLine += (tokenText.match(/\n/g) || []).length
    }
  }

  // Parse with standard marked
  const html = marked.parse(markdown)

  // Post-process: add data-source-line to block elements
  // This is a simple approach that adds line numbers sequentially to block elements
  const blockTags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "blockquote", "pre", "hr", "table", "div"]
  const blockRegex = new RegExp(`<(${blockTags.join("|")})(\\s|>)`, "gi")

  let tokenIndex = 0
  let result = html.replace(blockRegex, (match, tag, after) => {
    if (tokenIndex < tokenLines.length) {
      const line = tokenLines[tokenIndex].line
      tokenIndex++
      return `<${tag} data-source-line="${line}"${after}`
    }
    return match
  })

  // Post-process: annotate list items with their own source lines, in the same
  // document order the positions were collected. <li inside code blocks is
  // escaped, and the lookahead prevents matching tags like <link>.
  const itemLines = positionsToLines(itemPositions, markdown, lineOffset)
  if (itemLines.length > 0) {
    let itemIndex = 0
    result = result.replace(/<li(\s|>)/g, (match, after) => {
      if (itemIndex >= itemLines.length) return match
      const line = itemLines[itemIndex++]
      return `<li data-source-line="${line}"${after}`
    })
  }

  // Sanitize last: the block-tag regex above assigns line numbers sequentially
  // over marked's raw output, and DOMPurify re-parses the HTML — restructuring
  // invalid nesting into extra elements would consume line slots and shift the
  // mapping. Injecting first keeps the annotation identical to before.
  return sanitizeHtml(result)
}

/**
 * Find the preview element closest to a given source line
 * @param {HTMLElement} container - The preview container element
 * @param {number} targetLine - The source line number to find
 * @returns {HTMLElement|null} - The closest element, or null if none found
 */
export function findElementByLine(container, targetLine) {
  const elements = container.querySelectorAll("[data-source-line]")
  if (elements.length === 0) return null

  let closest = null
  let closestDistance = Infinity

  for (const el of elements) {
    const line = parseInt(el.dataset.sourceLine, 10)
    const distance = Math.abs(line - targetLine)

    if (distance < closestDistance) {
      closestDistance = distance
      closest = el
    }

    // If we found an exact match or passed the target, stop
    if (line >= targetLine) break
  }

  return closest
}

/**
 * Find the source line for a given scroll position in the preview
 * @param {HTMLElement} container - The preview container element
 * @param {number} scrollTop - Current scroll position
 * @returns {number|null} - The estimated source line, or null if not determinable
 */
export function findLineAtScroll(container, scrollTop) {
  const elements = container.querySelectorAll("[data-source-line]")
  if (elements.length === 0) return null

  // Compute container-relative tops via rects: element.offsetTop is only
  // container-relative when the offsetParent chain lines up, which breaks
  // when the container's ancestors are not CSS-positioned.
  const containerRect = container.getBoundingClientRect()
  const entries = []
  for (const el of elements) {
    const rect = el.getBoundingClientRect()
    entries.push({
      line: parseInt(el.dataset.sourceLine, 10),
      top: rect.top - containerRect.top + container.scrollTop
    })
  }

  return lineAtScroll(entries, scrollTop)
}
