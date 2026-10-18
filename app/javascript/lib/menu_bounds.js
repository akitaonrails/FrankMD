// Menu viewport bounds — shared helper for dropdown menus (issue #141).
//
// Keeps menus anchored to their trigger while guaranteeing they never
// extend past the viewport: the menu scrolls internally instead of growing
// the document. Pure and DOM-light so it is unit-testable with jsdom.

const VIEWPORT_PADDING = 8

/**
 * Compute the inline max-height a menu should receive so it fits between
 * its current top edge and the bottom of the viewport (minus padding).
 *
 * @param {DOMRect} rect - menu bounding rect (from getBoundingClientRect)
 * @param {number} viewportHeight - usable viewport height
 * @param {number} [padding] - distance to keep from the viewport edge
 * @returns {string} CSS max-height value in px (minimum 96px so the menu
 *   stays usable even when opened very close to the bottom)
 */
export function menuMaxHeight(rect, viewportHeight, padding = VIEWPORT_PADDING) {
  const available = viewportHeight - rect.top - padding
  return `${Math.max(96, Math.floor(available))}px`
}

/**
 * Apply viewport-bounded max-height to a menu element that is about to be
 * shown. Call while the menu is visible (after removing the hidden class)
 * so getBoundingClientRect returns real geometry.
 *
 * @param {HTMLElement} menu - menu container element
 * @param {number} [viewportHeight] - override for tests (defaults to innerHeight)
 */
export function clampMenuToViewport(menu, viewportHeight = window.innerHeight, viewportWidth = window.innerWidth) {
  if (!menu) return
  // Measure from the CSS anchor each time, including after a resize or pin change.
  menu.style.transform = ""
  const rect = menu.getBoundingClientRect()
  menu.style.maxHeight = menuMaxHeight(rect, viewportHeight)
  if (Number.isFinite(rect.left) && Number.isFinite(rect.right)) {
    const shift = rect.left < VIEWPORT_PADDING ? VIEWPORT_PADDING - rect.left :
      rect.right > viewportWidth - VIEWPORT_PADDING ? viewportWidth - VIEWPORT_PADDING - rect.right : 0
    if (shift) menu.style.transform = `translateX(${Math.round(shift)}px)`
  }
}

/**
 * Toggle helper for trigger + menu pairs: shows or hides the menu and, when
 * showing, applies the viewport clamp before the paint so no overflow
 * flash occurs.
 *
 * @param {HTMLElement} menu - menu container element
 * @param {boolean} [forceHidden] - when true only hides
 * @returns {boolean} whether the menu is now visible
 */
export function toggleMenu(menu, forceHidden = false) {
  if (!menu) return false
  const willShow = !forceHidden && menu.classList.contains("hidden")
  menu.classList.toggle("hidden", !willShow)
  if (willShow) clampMenuToViewport(menu)
  return willShow
}
