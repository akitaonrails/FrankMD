// Wikilink autocomplete extension for CodeMirror 6
// Triggers when user types "[[" and shows a list of notes to link to

import { autocompletion } from "@codemirror/autocomplete"

// Store reference to file list provider function
let getFilesFn = null

/**
 * Set the function that provides the list of files for autocomplete.
 * Should return an array of { path, name } objects.
 * @param {Function} fn
 */
export function setWikilinkFileProvider(fn) {
  getFilesFn = fn
}

/**
 * Wikilink completion source for CodeMirror autocompletion.
 * Activates when user types "[[" and filters notes by what's typed after.
 */
function wikilinkCompletions(context) {
  // Look back from cursor to find "[["
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)

  // Find the last "[[" that isn't closed
  const openIndex = textBefore.lastIndexOf("[[")
  if (openIndex === -1) return null

  // Check it's not already closed
  const afterOpen = textBefore.slice(openIndex + 2)
  if (afterOpen.includes("]]")) return null

  // The query is whatever the user typed after "[["
  const query = afterOpen.toLowerCase()
  const from = line.from + openIndex + 2

  // Get files from the provider
  if (!getFilesFn) return null
  const files = getFilesFn()
  if (!files || files.length === 0) return null

  // Filter and score files
  const options = files
    .filter(f => f.path && f.path.endsWith(".md"))
    .map(f => {
      const name = f.name || f.path.replace(/\.md$/, "").split("/").pop()
      const path = f.path.replace(/\.md$/, "")
      const lowerName = name.toLowerCase()
      const lowerPath = path.toLowerCase()

      // Simple fuzzy: check if query chars appear in order
      let score = 0
      if (!query) {
        score = 1
      } else if (lowerName.startsWith(query)) {
        score = 3
      } else if (lowerName.includes(query)) {
        score = 2
      } else if (lowerPath.includes(query)) {
        score = 1
      } else {
        return null
      }

      return {
        label: name,
        detail: path.includes("/") ? path : undefined,
        apply: (view, completion, from, to) => {
          // Insert the note name and close with "]]"
          const insertText = path + "]]"
          view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + insertText.length }
          })
        },
        boost: score
      }
    })
    .filter(Boolean)

  if (options.length === 0) return null

  return {
    from,
    options,
    filter: false // We already filtered
  }
}

/**
 * Create the wikilink autocomplete extension.
 * Call setWikilinkFileProvider() to supply the file list.
 * @returns {Extension}
 */
export function createWikilinkAutocomplete() {
  return autocompletion({
    override: [wikilinkCompletions],
    activateOnTyping: true,
    maxRenderedOptions: 20
  })
}
