import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  insertBlockContent,
  insertInlineContent,
  insertImage,
  insertTable,
  insertCodeBlock,
  insertVideoEmbed
} from "lib/codemirror_content_insertion"

describe("codemirror_content_insertion", () => {
  let mockController

  beforeEach(() => {
    mockController = {
      getValue: vi.fn(),
      getSelection: vi.fn().mockReturnValue({ from: 0, to: 0, text: "" }),
      getCursorPosition: vi.fn().mockReturnValue({ line: 1, column: 1, offset: 0 }),
      replaceRange: vi.fn(),
      insertAt: vi.fn(),
      setSelection: vi.fn()
    }
  })

  describe("insertBlockContent", () => {
    it("returns 0 when controller is null", () => {
      expect(insertBlockContent(null, "content")).toBe(0)
    })

    it("returns 0 when content is empty", () => {
      expect(insertBlockContent(mockController, "")).toBe(0)
    })

    it("inserts content at cursor in empty document", () => {
      mockController.getValue.mockReturnValue("")
      mockController.getCursorPosition.mockReturnValue({ offset: 0 })

      insertBlockContent(mockController, "table content")

      expect(mockController.insertAt).toHaveBeenCalledWith(0, "table content")
      expect(mockController.setSelection).toHaveBeenCalled()
    })

    it("adds double newline prefix when text before does not end with newlines", () => {
      mockController.getValue.mockReturnValue("some text")
      mockController.getCursorPosition.mockReturnValue({ offset: 9 })

      insertBlockContent(mockController, "table")

      expect(mockController.insertAt).toHaveBeenCalledWith(9, "\n\ntable")
    })

    it("adds single newline prefix when text before ends with one newline", () => {
      mockController.getValue.mockReturnValue("some text\n")
      mockController.getCursorPosition.mockReturnValue({ offset: 10 })

      insertBlockContent(mockController, "table")

      expect(mockController.insertAt).toHaveBeenCalledWith(10, "\ntable")
    })

    it("adds no newline prefix when text before ends with double newlines", () => {
      mockController.getValue.mockReturnValue("some text\n\n")
      mockController.getCursorPosition.mockReturnValue({ offset: 11 })

      insertBlockContent(mockController, "table")

      expect(mockController.insertAt).toHaveBeenCalledWith(11, "table")
    })

    it("adds double newline suffix when text after does not start with newlines", () => {
      mockController.getValue.mockReturnValue("beforeafter")
      mockController.getCursorPosition.mockReturnValue({ offset: 6 })

      insertBlockContent(mockController, "table")

      expect(mockController.insertAt).toHaveBeenCalledWith(6, "\n\ntable\n\n")
    })

    it("adds single newline suffix when text after starts with one newline", () => {
      mockController.getValue.mockReturnValue("before\nafter")
      mockController.getCursorPosition.mockReturnValue({ offset: 6 })

      insertBlockContent(mockController, "table")

      expect(mockController.insertAt).toHaveBeenCalledWith(6, "\n\ntable\n")
    })

    it("adds no newline suffix when text after starts with double newlines", () => {
      mockController.getValue.mockReturnValue("before\n\nafter")
      mockController.getCursorPosition.mockReturnValue({ offset: 6 })

      insertBlockContent(mockController, "table")

      expect(mockController.insertAt).toHaveBeenCalledWith(6, "\n\ntable")
    })

    it("replaces a slash query and preserves block spacing around it", () => {
      mockController.getValue.mockReturnValue("before /table after")

      insertBlockContent(mockController, "table", { from: 7, to: 13 })

      expect(mockController.replaceRange).toHaveBeenCalledWith("\n\ntable\n\n", 6, 14)
      expect(mockController.insertAt).not.toHaveBeenCalled()
    })

    it("uses replaceRange in edit mode", () => {
      insertBlockContent(mockController, "new table", {
        editMode: true,
        startPos: 10,
        endPos: 50
      })

      expect(mockController.replaceRange).toHaveBeenCalledWith("new table", 10, 50)
      expect(mockController.insertAt).not.toHaveBeenCalled()
    })

    it("positions cursor at end in edit mode", () => {
      insertBlockContent(mockController, "new table", {
        editMode: true,
        startPos: 10,
        endPos: 50
      })

      expect(mockController.setSelection).toHaveBeenCalledWith(19, 19) // 10 + 9 = 19
    })

    it("respects cursorOffset in edit mode", () => {
      insertBlockContent(mockController, "```js\ncode\n```", {
        editMode: true,
        startPos: 10,
        endPos: 50,
        cursorOffset: 6 // After ```js\n
      })

      expect(mockController.setSelection).toHaveBeenCalledWith(16, 16) // 10 + 6 = 16
    })

    it("respects cursorOffset in insert mode", () => {
      mockController.getValue.mockReturnValue("")
      mockController.getCursorPosition.mockReturnValue({ offset: 0 })

      insertBlockContent(mockController, "```js\ncode\n```", {
        cursorOffset: 6
      })

      expect(mockController.setSelection).toHaveBeenCalledWith(6, 6)
    })
  })

  describe("insertInlineContent", () => {
    it("returns 0 when controller is null", () => {
      expect(insertInlineContent(null, "😀")).toBe(0)
    })

    it("returns 0 when content is empty", () => {
      expect(insertInlineContent(mockController, "")).toBe(0)
    })

    it("replaces selection by default", () => {
      mockController.getSelection.mockReturnValue({ from: 5, to: 10, text: "hello" })

      insertInlineContent(mockController, "😀")

      expect(mockController.replaceRange).toHaveBeenCalledWith("😀", 5, 10)
    })

    it("inserts at position when replaceSelection is false", () => {
      mockController.getSelection.mockReturnValue({ from: 5, to: 10, text: "hello" })

      insertInlineContent(mockController, "😀", { replaceSelection: false })

      expect(mockController.insertAt).toHaveBeenCalledWith(5, "😀")
    })

    it("positions cursor after inserted content", () => {
      mockController.getSelection.mockReturnValue({ from: 5, to: 10, text: "hello" })

      insertInlineContent(mockController, "emoji")

      expect(mockController.setSelection).toHaveBeenCalledWith(10, 10) // 5 + 5 = 10
    })

    it("replaces a specific slash query range", () => {
      insertInlineContent(mockController, ":smile:", { from: 5, to: 11 })

      expect(mockController.replaceRange).toHaveBeenCalledWith(":smile:", 5, 11)
      expect(mockController.setSelection).toHaveBeenCalledWith(12, 12)
    })
  })

  describe("insertImage", () => {
    it("returns 0 when controller is null", () => {
      expect(insertImage(null, "![alt](url)")).toBe(0)
    })

    it("returns 0 when markdown is empty", () => {
      expect(insertImage(mockController, "")).toBe(0)
    })

    it("inserts image markdown without extra newlines at start of document", () => {
      mockController.getValue.mockReturnValue("")
      mockController.getSelection.mockReturnValue({ from: 0, to: 0 })

      insertImage(mockController, "![alt](url)")

      expect(mockController.replaceRange).toHaveBeenCalledWith("![alt](url)", 0, 0)
    })

    it("adds newline before when text before does not end with newline", () => {
      mockController.getValue.mockReturnValue("some text")
      mockController.getSelection.mockReturnValue({ from: 9, to: 9 })

      insertImage(mockController, "![alt](url)")

      expect(mockController.replaceRange).toHaveBeenCalledWith("\n![alt](url)", 9, 9)
    })

    it("adds newline after when text after does not start with newline", () => {
      mockController.getValue.mockReturnValue("beforeafter")
      mockController.getSelection.mockReturnValue({ from: 6, to: 6 })

      insertImage(mockController, "![alt](url)")

      expect(mockController.replaceRange).toHaveBeenCalledWith("\n![alt](url)\n", 6, 6)
    })

    it("replaces selection when text is selected", () => {
      mockController.getValue.mockReturnValue("before[selected]after")
      mockController.getSelection.mockReturnValue({ from: 6, to: 16 })

      insertImage(mockController, "![alt](url)")

      expect(mockController.replaceRange).toHaveBeenCalledWith("\n![alt](url)\n", 6, 16)
    })

    it("replaces a specific slash query range", () => {
      mockController.getValue.mockReturnValue("before /image after")

      insertImage(mockController, "![alt](url)", { from: 7, to: 13 })

      expect(mockController.replaceRange).toHaveBeenCalledWith("\n![alt](url)\n", 6, 14)
    })
  })

  describe("insertTable", () => {
    it("delegates to insertBlockContent", () => {
      mockController.getValue.mockReturnValue("")
      mockController.getCursorPosition.mockReturnValue({ offset: 0 })

      const tableMarkdown = "| A | B |\n|---|---|\n| 1 | 2 |"
      insertTable(mockController, tableMarkdown)

      expect(mockController.insertAt).toHaveBeenCalledWith(0, tableMarkdown)
    })

    it("replaces a slash query with a video block at the saved range", () => {
      mockController.getValue.mockReturnValue("before /video after")

      insertVideoEmbed(mockController, "<video></video>", { from: 7, to: 13 })

      expect(mockController.replaceRange).toHaveBeenCalledWith("\n\n<video></video>\n\n", 6, 14)
    })

    it("passes edit mode options through", () => {
      const tableMarkdown = "| A | B |"
      insertTable(mockController, tableMarkdown, {
        editMode: true,
        startPos: 5,
        endPos: 20
      })

      expect(mockController.replaceRange).toHaveBeenCalledWith(tableMarkdown, 5, 20)
    })
  })

  describe("insertCodeBlock", () => {
    it("inserts code block with correct cursor offset", () => {
      mockController.getValue.mockReturnValue("")
      mockController.getCursorPosition.mockReturnValue({ offset: 0 })

      const codeBlock = "```javascript\nconsole.log('hello')\n```"
      insertCodeBlock(mockController, codeBlock, "javascript")

      expect(mockController.insertAt).toHaveBeenCalledWith(0, codeBlock)
      // cursorOffset = 3 (```) + 10 (javascript) + 1 (\n) = 14
      expect(mockController.setSelection).toHaveBeenCalledWith(14, 14)
    })

    it("handles empty language", () => {
      mockController.getValue.mockReturnValue("")
      mockController.getCursorPosition.mockReturnValue({ offset: 0 })

      const codeBlock = "```\ncode\n```"
      insertCodeBlock(mockController, codeBlock, "")

      // cursorOffset = 3 (```) + 0 (empty) + 1 (\n) = 4
      expect(mockController.setSelection).toHaveBeenCalledWith(4, 4)
    })

    it("works in edit mode", () => {
      const codeBlock = "```python\nprint('hi')\n```"
      insertCodeBlock(mockController, codeBlock, "python", {
        editMode: true,
        startPos: 10,
        endPos: 50
      })

      expect(mockController.replaceRange).toHaveBeenCalledWith(codeBlock, 10, 50)
      // cursorOffset = 3 + 6 (python) + 1 = 10, final = 10 + 10 = 20
      expect(mockController.setSelection).toHaveBeenCalledWith(20, 20)
    })
  })

  describe("insertVideoEmbed", () => {
    it("delegates to insertBlockContent", () => {
      mockController.getValue.mockReturnValue("text")
      mockController.getCursorPosition.mockReturnValue({ offset: 4 })

      const embed = "{{< youtube abc123 >}}"
      insertVideoEmbed(mockController, embed)

      expect(mockController.insertAt).toHaveBeenCalledWith(4, "\n\n{{< youtube abc123 >}}")
    })
  })
})
