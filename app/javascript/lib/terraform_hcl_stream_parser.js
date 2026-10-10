const KEYWORDS = new Set([
  "check",
  "connection",
  "data",
  "dynamic",
  "else",
  "for",
  "if",
  "import",
  "in",
  "locals",
  "module",
  "output",
  "provider",
  "provisioner",
  "removed",
  "resource",
  "terraform",
  "variable"
])

function consumeQuotedString(stream) {
  stream.next()
  let escaped = false

  while (!stream.eol()) {
    const character = stream.next()
    if (escaped) {
      escaped = false
    } else if (character === "\\") {
      escaped = true
    } else if (character === '"') {
      break
    }
  }

  return "string"
}

function consumeBlockComment(stream, state) {
  const close = stream.string.indexOf("*/", stream.pos)
  if (close === -1) {
    stream.skipToEnd()
    state.blockComment = true
  } else {
    stream.pos = close + 2
    state.blockComment = false
  }

  return "comment"
}

export const terraformHcl = {
  startState() {
    return { blockComment: false, heredocMarker: null, afterDot: false }
  },

  copyState(state) {
    return { ...state }
  },

  blankLine(state) {
    state.afterDot = false
  },

  token(stream, state) {
    if (state.heredocMarker) {
      if (stream.string.trim() === state.heredocMarker) state.heredocMarker = null
      stream.skipToEnd()
      return "string"
    }

    if (state.blockComment) return consumeBlockComment(stream, state)
    if (stream.eatSpace()) return null

    if (stream.match(/^#.*$/) || stream.match(/^\/\/.*$/)) return "comment"
    if (stream.match("/*")) return consumeBlockComment(stream, state)

    const heredoc = stream.match(/^<<-?([A-Za-z_][\w-]*)/)
    if (heredoc) {
      state.heredocMarker = heredoc[1]
      return "string"
    }

    if (stream.peek() === '"') return consumeQuotedString(stream)

    if (stream.match(/^(?:true|false|null)\b/)) return "atom"
    if (stream.match(/^(?:0[xX][\da-fA-F][\da-fA-F_]*|0[bB][01][01_]*|0[oO][0-7][0-7_]*|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)/)) {
      return "number"
    }

    const identifier = stream.match(/^[A-Za-z_][\w-]*/)
    if (identifier) {
      const name = identifier[0]
      const followsCall = stream.match(/^\s*\(/, false)
      const followsAssignment = stream.match(/^\s*=/, false)
      const style = state.afterDot
        ? "property"
        : KEYWORDS.has(name)
          ? "keyword"
          : followsCall
            ? "variableName.function"
            : followsAssignment
              ? "property"
              : "variable"

      state.afterDot = false
      return style
    }

    if (stream.match(".")) {
      state.afterDot = true
      return "operator"
    }

    if (stream.match(/^(?:\.\.\.|==|!=|<=|>=|&&|\|\||=>|[=<>!&|+\-*\/%?:])/)) {
      state.afterDot = false
      return "operator"
    }

    if (stream.match(/^[{}[\](),]/)) {
      state.afterDot = false
      return "punctuation"
    }

    state.afterDot = false
    stream.next()
    return null
  }
}
