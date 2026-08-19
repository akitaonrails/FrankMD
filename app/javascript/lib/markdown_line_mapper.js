// Markdown Line Mapper
// Adds data-source-line attributes to rendered markdown elements for scroll sync
// This enables accurate editor-to-preview scroll synchronization regardless of
// images, videos, or other elements that render with different heights

import { marked } from "marked"
import { sanitizeHtml } from "lib/html_sanitizer"
import { lineAtScroll } from "lib/scroll_utils"

/**
 * Parse markdown and return HTML with source line annotations
 * Uses standard marked.parse() then post-processes to add line attributes
 * @param {string} markdown - The markdown content
 * @param {number} lineOffset - Line offset (e.g., for stripped frontmatter)
 * @returns {string} - Sanitized HTML with data-source-line attributes on block elements
 */
export function parseWithLineNumbers(markdown, lineOffset = 0) {
  if (!markdown) return ""

  // First, get tokens to know line positions
  const tokens = marked.lexer(markdown)

  // Calculate line numbers for each token
  const tokenLines = []
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

      // Move position past this token
      currentPos = tokenStart + tokenText.length
      currentLine += (tokenText.match(/\n/g) || []).length
    }
  }

  // Parse with standard marked
  const html = marked.parse(markdown)

  // Post-process: add data-source-line to block elements
  // This is a simple approach that adds line numbers sequentially to block elements
  const blockTags = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "blockquote", "pre", "hr", "table"]
  const blockRegex = new RegExp(`<(${blockTags.join("|")})(\\s|>)`, "gi")

  let tokenIndex = 0
  const result = html.replace(blockRegex, (match, tag, after) => {
    if (tokenIndex < tokenLines.length) {
      const line = tokenLines[tokenIndex].line
      tokenIndex++
      return `<${tag} data-source-line="${line}"${after}`
    }
    return match
  })

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
