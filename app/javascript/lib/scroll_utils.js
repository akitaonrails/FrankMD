// Scroll utility functions - Pure functions for scroll calculations
// Extracted from app_controller.js for testability

/**
 * Calculate scroll ratio (0 to 1) for syncing scroll positions
 * @param {number} scrollTop - Current scroll position
 * @param {number} scrollHeight - Total scrollable height
 * @param {number} clientHeight - Visible height
 * @returns {number} - Scroll ratio (0 to 1)
 */
export function calculateScrollRatio(scrollTop, scrollHeight, clientHeight) {
  const maxScroll = scrollHeight - clientHeight
  if (maxScroll <= 0) return 0
  return Math.max(0, Math.min(1, scrollTop / maxScroll))
}

/**
 * Calculate scroll position for a specific line
 * @param {number} lineNumber - Target line number (1-based)
 * @param {number} lineHeight - Height of each line in pixels
 * @param {number} viewportHeight - Visible area height
 * @param {number} offsetRatio - Where to position line in viewport (0.35 = 35% from top)
 * @returns {number} - Scroll position in pixels
 */
export function calculateScrollForLine(lineNumber, lineHeight, viewportHeight, offsetRatio = 0.35) {
  const targetScroll = (lineNumber - 1) * lineHeight - viewportHeight * offsetRatio
  return Math.max(0, targetScroll)
}

/**
 * Calculate which line is at a given scroll position
 * @param {number} scrollTop - Current scroll position
 * @param {number} clientHeight - Visible height
 * @param {number} scrollHeight - Total scrollable height
 * @param {number} totalLines - Total number of lines
 * @returns {number} - Estimated line number at center of viewport
 */
export function calculateLineFromScroll(scrollTop, clientHeight, scrollHeight, totalLines) {
  if (totalLines <= 0) return 1

  // Estimate line height
  const lineHeight = scrollHeight / totalLines

  // Calculate center of visible area
  const centerY = scrollTop + (clientHeight / 2)

  // Calculate line at center
  const centerLine = Math.round(centerY / lineHeight)

  return Math.max(1, Math.min(totalLines, centerLine))
}

/**
 * Calculate scroll position to sync two scrollable areas by ratio
 * @param {number} sourceRatio - Scroll ratio from source (0 to 1)
 * @param {number} targetScrollHeight - Total scrollable height of target
 * @param {number} targetClientHeight - Visible height of target
 * @returns {number} - Scroll position for target
 */
export function calculateSyncedScrollPosition(sourceRatio, targetScrollHeight, targetClientHeight) {
  const targetMaxScroll = targetScrollHeight - targetClientHeight
  if (targetMaxScroll <= 0) return 0
  return Math.max(0, sourceRatio * targetMaxScroll)
}

/**
 * Calculate scroll position to center a line in the viewport
 * @param {number} lineNumber - Line to center (1-based)
 * @param {number} totalLines - Total lines in document
 * @param {number} scrollHeight - Total scrollable height
 * @param {number} clientHeight - Visible height
 * @returns {number} - Scroll position in pixels
 */
export function calculateScrollToCenterLine(lineNumber, totalLines, scrollHeight, clientHeight) {
  if (totalLines <= 0) return 0

  // Calculate line ratio (0 to 1)
  const lineRatio = (lineNumber - 1) / Math.max(1, totalLines - 1)

  // Calculate target scroll position
  const maxScroll = scrollHeight - clientHeight
  if (maxScroll <= 0) return 0

  return Math.max(0, lineRatio * maxScroll)
}

/**
 * Calculate an element's top position relative to a scroll container's content.
 * Takes pre-computed rects so the result is invariant to where the container
 * sits on the page (offsetTop is only reliable when ancestors are positioned).
 * @param {DOMRect} elRect - getBoundingClientRect() of the target element
 * @param {DOMRect} containerRect - getBoundingClientRect() of the scroll container
 * @param {number} containerScrollTop - The container's current scrollTop
 * @returns {number} - Element top in container-content coordinates
 */
export function scrollTopForElement(elRect, containerRect, containerScrollTop) {
  return elRect.top - containerRect.top + containerScrollTop
}

/**
 * Find the source line for a scroll position from pre-computed entries.
 * @param {Array<{line: number, top: number}>} entries - Entries with container-relative tops
 * @param {number} scrollTop - Current container scroll position
 * @returns {number|null} - Line of the last entry at/above the viewport top, first entry's line above it, or null
 */
export function lineAtScroll(entries, scrollTop) {
  if (!entries || entries.length === 0) return null

  let closest = null
  let closestTop = -Infinity

  for (const entry of entries) {
    if (entry.top <= scrollTop && entry.top > closestTop) {
      closestTop = entry.top
      closest = entry
    }
  }

  if (closest) return closest.line

  return entries[0].line
}
