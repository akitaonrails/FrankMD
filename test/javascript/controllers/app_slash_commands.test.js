/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import AppController from "../../../app/javascript/controllers/app_controller"

function makeApp(initialText = "before /image after") {
  let text = initialText
  const selection = { from: 1, to: 1 }
  const codemirror = {
    getValue: vi.fn(() => text),
    getSelection: vi.fn(() => selection),
    getCursorPosition: vi.fn(() => ({ offset: selection.to })),
    replaceRange: vi.fn((replacement, from, to) => {
      text = text.slice(0, from) + replacement + text.slice(to)
    }),
    insertAt: vi.fn((from, value) => {
      text = text.slice(0, from) + value + text.slice(from)
    }),
    setSelection: vi.fn(),
    focus: vi.fn()
  }
  const app = Object.create(AppController.prototype)
  Object.assign(app, {
    currentFileType: "markdown",
    getCodemirrorController: () => codemirror,
    getAutosaveController: () => null,
    updatePreview: vi.fn(),
    onEditorChange: vi.fn(),
    hasTextareaTarget: true,
    hasImagePickerOutlet: true,
    hasVideoDialogOutlet: true,
    imagePickerOutlet: { open: vi.fn() },
    videoDialogOutlet: { open: vi.fn() },
    emojiPickerOutlets: [{ open: vi.fn() }]
  })
  return { app, codemirror, getText: () => text }
}

describe("AppController slash command actions", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it.each(["table", "image", "video", "emoji"])("opens the existing %s flow with a saved query range", (action) => {
    const { app } = makeApp("before /image after")
    const event = {
      detail: { action, from: 7, to: 13, query: "/image" }
    }
    if (action === "table") {
      document.body.innerHTML = '<div data-controller="table-editor"></div>'
    }

    app.openSlashCommandAction(event)

    expect(app.pendingSlashInsertionRange).toEqual(event.detail)
    if (action === "image") expect(app.imagePickerOutlet.open).toHaveBeenCalledOnce()
    if (action === "video") expect(app.videoDialogOutlet.open).toHaveBeenCalledOnce()
    if (action === "emoji") expect(app.emojiPickerOutlets[0].open).toHaveBeenCalledOnce()
  })

  it("replaces the saved query when the image picker inserts successfully", () => {
    const { app, codemirror } = makeApp("before /image after")
    app.pendingSlashInsertionRange = { action: "image", from: 7, to: 13, query: "/image" }

    app.onImageSelected({ detail: { markdown: "![photo](photo.png)" } })

    expect(codemirror.replaceRange).toHaveBeenCalledWith("\n![photo](photo.png)\n", 6, 14)
    expect(app.pendingSlashInsertionRange).toBeNull()
  })

  it("replaces the saved query when the table editor inserts a new table", () => {
    const { app, codemirror } = makeApp("before /table after")
    app.pendingSlashInsertionRange = { action: "table", from: 7, to: 13, query: "/table" }

    app.handleTableInsert({
      detail: { markdown: "| A |\n|---|\n| 1 |", editMode: false, startPos: 0, endPos: 0 }
    })

    expect(codemirror.replaceRange).toHaveBeenCalledWith("\n\n| A |\n|---|\n| 1 |\n\n", 6, 14)
    expect(app.pendingSlashInsertionRange).toBeNull()
  })

  it("replaces the saved query with inline emoji text", () => {
    const { app, codemirror } = makeApp("before /emoji after")
    app.pendingSlashInsertionRange = { action: "emoji", from: 7, to: 13, query: "/emoji" }

    app.onEmojiSelected({ detail: { text: ":smile:" } })

    expect(codemirror.replaceRange).toHaveBeenCalledWith(":smile:", 7, 13)
    expect(app.pendingSlashInsertionRange).toBeNull()
  })

  it("replaces the saved query when the video dialog returns an embed", () => {
    const { app, codemirror } = makeApp("before /video after")
    app.pendingSlashInsertionRange = { action: "video", from: 7, to: 13, query: "/video" }

    app.insertVideoEmbed({ detail: { embedCode: "<video></video>" } })

    expect(codemirror.replaceRange).toHaveBeenCalledWith("\n\n<video></video>\n\n", 6, 14)
    expect(app.pendingSlashInsertionRange).toBeNull()
  })

  it("keeps an existing table edit range when handling a table action", () => {
    const { app, codemirror } = makeApp("| A | B |\n|---|---|\n| /table | value |")
    app.pendingSlashInsertionRange = { action: "table", from: 22, to: 28, query: "/table" }

    app.handleTableInsert({
      detail: { markdown: "| A | B |\n|---|---|\n| x | y |", editMode: true, startPos: 0, endPos: 39 }
    })

    expect(codemirror.replaceRange).toHaveBeenCalledWith("| A | B |\n|---|---|\n| x | y |", 0, 39)
    expect(app.pendingSlashInsertionRange).toBeNull()
  })

  it("removes a table slash query only from the editor draft, leaving the note unchanged until insertion", () => {
    const text = "| A | B |\n|---|---|\n| /table | value |"
    const { app, getText } = makeApp(text)
    const pendingFrom = text.indexOf("/table")
    app.pendingSlashInsertionRange = {
      action: "table",
      from: pendingFrom,
      to: pendingFrom + "/table".length,
      query: "/table"
    }
    const opened = vi.fn()
    window.addEventListener("frankmd:open-table-editor", opened)

    app.openTableEditor({ slashInsertion: true })

    expect(opened.mock.calls[0][0].detail.existingTable).toBe("| A | B |\n|---|---|\n| | value |")
    expect(getText()).toBe(text)
    app.onSlashCommandDialogClose({ currentTarget: { dataset: { slashCommandAction: "table" } } })
    expect(app.pendingSlashInsertionRange).toBeNull()
    expect(getText()).toBe(text)
    window.removeEventListener("frankmd:open-table-editor", opened)
  })

  it("clears the pending range on dialog close so later toolbar insertions use the current selection", () => {
    const { app, codemirror } = makeApp("before /image after")
    app.pendingSlashInsertionRange = { action: "image", from: 7, to: 13, query: "/image" }
    app.onSlashCommandDialogClose({ currentTarget: { dataset: { slashCommandAction: "image" } } })

    app.onImageSelected({ detail: { markdown: "![toolbar](toolbar.png)" } })

    expect(app.pendingSlashInsertionRange).toBeNull()
    expect(codemirror.replaceRange).toHaveBeenCalledWith("\n![toolbar](toolbar.png)\n", 1, 1)
  })

  it("drops a stale query range if the document changed while the dialog was open", () => {
    const { app, codemirror } = makeApp("changed /query text")
    app.pendingSlashInsertionRange = { action: "image", from: 7, to: 13, query: "/image" }

    app.onImageSelected({ detail: { markdown: "![photo](photo.png)" } })

    expect(codemirror.replaceRange).not.toHaveBeenCalled()
    expect(app.pendingSlashInsertionRange).toBeNull()
  })
})
