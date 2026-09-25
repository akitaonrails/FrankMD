// Mock for marked library used in preview_controller
export const marked = {
  use: () => {},

  parse: (content) => {
    if (!content) return ""

    // Simple mock that converts basic markdown to HTML for testing
    return content
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^(?!<h[1-6]>)(.+)$/gm, "<p>$1</p>")
      .replace(/<p><\/p>/g, "")
  },

  // Mock lexer that returns simple token array for line mapping
  lexer: (content) => {
    if (!content) return []

    // Split by blank lines to create simple paragraph tokens
    const blocks = content.split(/\n\n+/)
    return blocks.map(block => ({
      type: "paragraph",
      raw: block + "\n\n",
      text: block
    }))
  },

  // Mock Renderer class
  Renderer: class {
    constructor() {}
  }
}

export default marked
