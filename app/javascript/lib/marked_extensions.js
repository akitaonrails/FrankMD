// Marked extensions for custom markdown syntax
// Adds support for: superscript, subscript, highlight, and emoji shortcodes

// Import emoji data from the picker controller
// We need to extract this to avoid circular dependencies
import { getEmojiMap } from "lib/emoji_data"

// Superscript extension: ^text^ -> <sup>text</sup>
export const superscriptExtension = {
  name: "superscript",
  level: "inline",
  start(src) {
    return src.indexOf("^")
  },
  tokenizer(src) {
    // Match ^text^ but not ^^
    const match = src.match(/^\^([^\^]+)\^/)
    if (match) {
      return {
        type: "superscript",
        raw: match[0],
        text: match[1]
      }
    }
  },
  renderer(token) {
    return `<sup>${escapeHtml(token.text)}</sup>`
  }
}

// Subscript extension: ~text~ -> <sub>text</sub>
// Note: GFM uses ~~ for strikethrough, so we need single ~
export const subscriptExtension = {
  name: "subscript",
  level: "inline",
  start(src) {
    return src.indexOf("~")
  },
  tokenizer(src) {
    // Match ~text~ but not ~~ (strikethrough)
    const match = src.match(/^~([^~]+)~(?!~)/)
    if (match) {
      return {
        type: "subscript",
        raw: match[0],
        text: match[1]
      }
    }
  },
  renderer(token) {
    return `<sub>${escapeHtml(token.text)}</sub>`
  }
}

// Highlight extension: ==text== -> <mark>text</mark>
export const highlightExtension = {
  name: "highlight",
  level: "inline",
  start(src) {
    return src.indexOf("==")
  },
  tokenizer(src) {
    const match = src.match(/^==([^=]+)==/)
    if (match) {
      return {
        type: "highlight",
        raw: match[0],
        text: match[1]
      }
    }
  },
  renderer(token) {
    return `<mark>${escapeHtml(token.text)}</mark>`
  }
}

// Emoji extension: :shortcode: -> emoji character
export const emojiExtension = {
  name: "emoji",
  level: "inline",
  start(src) {
    return src.indexOf(":")
  },
  tokenizer(src) {
    // Match :shortcode: pattern
    const match = src.match(/^:([a-z0-9_+-]+):/)
    if (match) {
      const shortcode = match[1]
      const emojiMap = getEmojiMap()
      const emoji = emojiMap[shortcode]
      if (emoji) {
        return {
          type: "emoji",
          raw: match[0],
          emoji: emoji
        }
      }
    }
  },
  renderer(token) {
    return token.emoji
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Wikilink extension: [[Note Name]], [[Note Name|Display Text]], [[folder/Note Name]]
export const wikilinkExtension = {
  name: "wikilink",
  level: "inline",
  start(src) {
    return src.indexOf("[[")
  },
  tokenizer(src) {
    const match = src.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
    if (match) {
      const target = match[1].trim()
      const displayText = match[2] ? match[2].trim() : null
      return {
        type: "wikilink",
        raw: match[0],
        target: target,
        displayText: displayText
      }
    }
  },
  renderer(token) {
    // Use custom display text, or fall back to the basename of the target
    const display = token.displayText || token.target.split("/").pop()
    const escapedTarget = escapeHtml(token.target)
    const escapedDisplay = escapeHtml(display)
    return `<a class="wikilink" data-wikilink-path="${escapedTarget}" data-action="click->app#openWikilink">${escapedDisplay}</a>`
  }
}

// Export all extensions as an array for easy use with marked.use()
export const allExtensions = [
  superscriptExtension,
  subscriptExtension,
  highlightExtension,
  emojiExtension,
  wikilinkExtension
]
