// Text utility functions - Pure functions for text manipulation
// Extracted for testability

/**
 * Escape HTML special characters, including quotes for safe attribute interpolation
 * @param {string} text - Text to escape
 * @returns {string} - HTML-safe text
 */
export function escapeHtml(text) {
  if (!text) return ""
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Whether a URL may be used as an image source.
 * @param {string} url - URL to validate
 * @returns {boolean} - True for allowed image URL schemes
 */
export function isSafeImageUrl(url) {
  if (typeof url !== "string" || /[\s\u0000-\u001F\u007F]/.test(url)) return false

  return /^(https?:|data:image\/|blob:)/i.test(url) ||
    (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\"))
}

/**
 * Escape HTML using string replacement (works without DOM)
 * @param {string} text - Text to escape
 * @returns {string} - HTML-safe text
 */
export function escapeHtmlString(text) {
  if (!text) return ""
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * Calculate fuzzy match score for file finder
 * Higher score = better match
 * @param {string} str - String to search in
 * @param {string} query - Search query
 * @returns {number} - Match score (0 = no match)
 */
export function fuzzyScore(str, query) {
  let score = 0
  let strIndex = 0
  let prevMatchIndex = -1
  let consecutiveBonus = 0

  for (let i = 0; i < query.length; i++) {
    const char = query[i]
    const foundIndex = str.indexOf(char, strIndex)

    if (foundIndex === -1) {
      return 0 // Character not found, no match
    }

    // Base score for finding the character
    score += 1

    // Bonus for consecutive matches
    if (foundIndex === prevMatchIndex + 1) {
      consecutiveBonus += 2
      score += consecutiveBonus
    } else {
      consecutiveBonus = 0
    }

    // Bonus for matching at start or after separator
    if (foundIndex === 0 || str[foundIndex - 1] === "/" || str[foundIndex - 1] === "-" || str[foundIndex - 1] === "_") {
      score += 3
    }

    prevMatchIndex = foundIndex
    strIndex = foundIndex + 1
  }

  // Bonus for shorter names (more precise match)
  score += Math.max(0, 10 - (str.length - query.length))

  return score
}

/**
 * Calculate Levenshtein (edit) distance between two strings
 * Used for fuzzy language matching in code blocks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
export function levenshteinDistance(a, b) {
  const matrix = []
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}
