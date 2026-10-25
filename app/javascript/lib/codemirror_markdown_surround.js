import { EditorSelection } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { isolateHistory } from "@codemirror/commands"

const markers = new Set(["*", "_", "`", "~", "^", "="])

function delimiters(marker, content) {
  if (marker !== "`") return [marker, marker]
  const runs = content.match(/`+/g) || []
  const delimiter = "`".repeat(Math.max(0, ...runs.map(run => run.length)) + 1)
  const padding = content.startsWith("`") || content.endsWith("`") ||
    (content.startsWith(" ") && content.endsWith(" ") && content.trim()) ? " " : ""
  return [delimiter + padding, padding + delimiter]
}

export const markdownSurround = EditorView.inputHandler.of((view, from, to, text, insert) => {
  const { state } = view
  const main = state.selection.main
  if (!markers.has(text) || state.readOnly || !state.facet(EditorView.editable) ||
      view.compositionStarted || view.composing ||
      state.selection.ranges.every(range => range.empty) ||
      from < main.from || to > main.to) return false

  const typed = insert()
  if (!typed.isUserEvent("input.type")) return false

  const changes = state.changeByRange(range => {
    if (range.empty) {
      return { changes: { from: range.from, insert: text }, range: EditorSelection.cursor(range.from + text.length) }
    }
    const content = state.sliceDoc(range.from, range.to)
    const [prefix, suffix] = delimiters(text, content)
    return {
      changes: [{ from: range.from, insert: prefix }, { from: range.to, insert: suffix }],
      range: EditorSelection.range(range.anchor + prefix.length, range.head + prefix.length)
    }
  })
  view.dispatch(changes, {
    userEvent: "input.type",
    annotations: isolateHistory.of("full"),
    scrollIntoView: true
  })
  return true
})
