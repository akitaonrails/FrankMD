/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { destroy, get } from "@rails/request.js"
import { appConfirm } from "lib/app_prompt"
import LibraryController from "../../../app/javascript/controllers/library_controller.js"

vi.mock("@rails/request.js", () => ({ destroy: vi.fn(), get: vi.fn() }))
vi.mock("lib/app_prompt", () => ({ appConfirm: vi.fn().mockResolvedValue(true) }))

const photo = {
  name: "photo one.png",
  path: "images/photo one.png",
  size: 2048,
  mtime: "2026-09-27T12:00:00Z",
  preview_url: "/notes/images/photo%20one.png",
  type: "image"
}

const clip = {
  name: "clip.mp4",
  path: "videos/clip.mp4",
  size: 4096,
  mtime: "2026-09-26T12:00:00Z",
  preview_url: "/notes/videos/clip.mp4",
  type: "video"
}

let intersectionObservers

class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.observed = new Set()
    intersectionObservers.push(this)
  }

  observe(target) {
    this.observed.add(target)
  }

  disconnect() {
    this.observed.clear()
  }

  trigger(target, isIntersecting = true) {
    this.callback([{ target, isIntersecting }])
  }
}

function mediaResponse(images = [photo], videos = [clip]) {
  return { ok: true, json: Promise.resolve({ images, videos }) }
}

describe("LibraryController", () => {
  let application
  let controller
  let element

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.useRealTimers()
    intersectionObservers = []
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)
    window.t = (key, options = {}) => {
      if (key === "library.usage_dialog_title") return "Notes associated"
      if (key === "library.usage_used") return `Used in ${options.count} notes`
      return key.replace(/%\{(\w+)\}/g, (_match, name) => options[name] ?? `%{${name}}`)
    }
    get.mockResolvedValue(mediaResponse())
    destroy.mockResolvedValue({ ok: true })
    appConfirm.mockResolvedValue(true)

    document.body.innerHTML = `
      <div data-controller="library">
        <button data-library-target="imagesTab" data-action="click->library#showImages"></button>
        <button data-library-target="videosTab" data-action="click->library#showVideos"></button>
        <span data-library-target="count"></span>
        <p class="hidden" data-library-target="error"></p>
        <p class="hidden" data-library-target="loading"></p>
        <p class="hidden" data-library-target="status"></p>
        <input data-library-target="search" data-action="input->library#render">
        <select data-library-target="sort" data-action="change->library#render">
          <option value="newest" selected>Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
        </select>
        <div data-library-target="grid"></div>
        <div class="hidden" data-library-target="usageDialog" data-action="click->library#closeUsageDialogOnBackdrop keydown.esc->library#closeUsageDialog">
          <h2 data-library-target="usageDialogTitle"></h2>
          <ul data-library-target="usageNotes"></ul>
          <button data-library-target="usageDialogClose" data-action="click->library#closeUsageDialog"></button>
        </div>
        <div class="hidden" data-library-target="previewDialog" data-action="click->library#closePreviewOnBackdrop">
          <h2 data-library-target="previewName"></h2>
          <div>
            <p data-library-target="previewUsage"></p>
            <p data-library-target="previewMetadata"></p>
          </div>
          <div data-library-target="previewMedia"></div>
          <button data-action="click->library#deletePreviewItem"></button>
          <button data-action="click->library#copyPreviewPath"></button>
          <button data-action="click->library#insertPreviewItem"></button>
          <button data-action="click->library#closePreview"></button>
        </div>
      </div>
    `
    element = document.querySelector('[data-controller="library"]')
    application = Application.start()
    application.register("library", LibraryController)
    await vi.waitFor(() => {
      controller = application.getControllerForElementAndIdentifier(element, "library")
      expect(controller?.gridTarget.innerHTML).toContain("photo one.png")
    })
  })

  afterEach(() => {
    application?.stop()
    document.body.replaceChildren()
    delete window.t
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("fetches the Library endpoint and renders image and video cards", () => {
    expect(get).toHaveBeenCalledWith("/library", { responseKind: "json" })
    expect(controller.gridTarget.querySelectorAll(".library-card")).toHaveLength(1)
    expect(controller.gridTarget.querySelector("img").getAttribute("src")).toBe("/notes/images/photo%20one.png")
    expect(controller.gridTarget.textContent).toContain("2 KB")
    expect(Array.from(controller.gridTarget.querySelectorAll(".library-card [data-action]"), (button) => button.dataset.action))
      .toEqual(["click->library#openPreview", "click->library#deleteItem", "click->library#insertItem"])

    controller.videosTabTarget.click()

    expect(controller.videosTabTarget.getAttribute("aria-pressed")).toBe("true")
    expect(controller.gridTarget.textContent).toContain("clip.mp4")
    expect(controller.gridTarget.querySelector("video").getAttribute("src")).toBe("/notes/videos/clip.mp4")
    expect(controller.gridTarget.textContent).toContain("4 KB")
    expect(controller.gridTarget.querySelectorAll(".library-card-preview")).toHaveLength(1)
  })

  it("defers usage lookup until a visible card intersects and shares one request across scrolling", async () => {
    const unusedPhoto = { ...photo, name: "unused.png", path: "images/unused.png" }
    get.mockResolvedValueOnce(mediaResponse([photo, unusedPhoto], [clip]))
    await controller.load()

    const cards = controller.gridTarget.querySelectorAll(".library-card")
    expect(cards).toHaveLength(2)
    expect(controller.usageObserver.options.root).toBe(element)
    expect(get.mock.calls.filter(([path]) => path === "/library/usage")).toHaveLength(0)

    let resolveUsage
    get.mockReturnValueOnce(new Promise((resolve) => { resolveUsage = resolve }))
    controller.usageObserver.trigger(cards[0])
    expect(cards[0].querySelector("[data-library-usage-label]").dataset.usageState).toBe("checking")

    controller.usageObserver.trigger(cards[0], false)
    controller.usageObserver.trigger(cards[1])
    expect(get).toHaveBeenLastCalledWith("/library/usage", { responseKind: "json" })
    expect(get.mock.calls.filter(([path]) => path === "/library/usage")).toHaveLength(1)

    resolveUsage({ ok: true, json: Promise.resolve({
      usage_counts: { [photo.path]: 2 },
      usage_notes: { [photo.path]: ["first.md", "second.md"] }
    }) })
    await vi.waitFor(() => {
      expect(cards[1].querySelector("[data-library-usage-label]").dataset.usageState).toBe("unused")
    })
    expect(cards[1].querySelector("[data-library-usage-label]").textContent).toBe("Used in 0 notes")
    expect(cards[1].querySelector("[data-library-usage-label] button")).toBeNull()

    controller.showVideos()
    const videoCard = controller.gridTarget.querySelector(".library-card")
    controller.usageObserver.trigger(videoCard)
    expect(videoCard.querySelector("[data-library-usage-label]").dataset.usageState).toBe("unused")
    expect(get.mock.calls.filter(([path]) => path === "/library/usage")).toHaveLength(1)
  })

  it("shows used, unused, and unknown usage labels only after cards intersect", async () => {
    const unusedPhoto = { ...photo, name: "unused.png", path: "images/unused.png" }
    get.mockResolvedValueOnce(mediaResponse([photo, unusedPhoto], []))
    await controller.load()
    const [usedCard, unusedCard] = controller.gridTarget.querySelectorAll(".library-card")
    get.mockResolvedValueOnce({
      ok: true,
      json: Promise.resolve({
        usage_counts: { [photo.path]: 3 },
        usage_notes: { [photo.path]: ["first.md", "second.md", "third.md"] }
      })
    })

    controller.usageObserver.trigger(usedCard)
    await vi.waitFor(() => expect(usedCard.querySelector("[data-library-usage-label]").dataset.usageState).toBe("used"))
    expect(usedCard.querySelector("[data-library-usage-label]").textContent).toBe("Used in 3 notes")
    expect(unusedCard.querySelector("[data-library-usage-label]").dataset.usageState).toBe("checking")

    controller.usageObserver.trigger(unusedCard)
    expect(unusedCard.querySelector("[data-library-usage-label]").dataset.usageState).toBe("unused")

    controller.resetUsageForLibraryOpen()
    get.mockResolvedValueOnce({ ok: false, json: Promise.resolve({}) })
    controller.usageObserver.trigger(usedCard)
    await vi.waitFor(() => expect(usedCard.querySelector("[data-library-usage-label]").dataset.usageState).toBe("unknown"))
    expect(usedCard.querySelector("[data-library-usage-label]").textContent).toBe("library.usage_unknown")
  })

  it("refreshes the cached usage map when Library is reopened", async () => {
    get.mockResolvedValueOnce({ ok: true, json: Promise.resolve({
      usage_counts: { [photo.path]: 1 },
      usage_notes: { [photo.path]: ["note.md"] }
    }) })
    const card = controller.gridTarget.querySelector(".library-card")
    controller.usageObserver.trigger(card)
    await vi.waitFor(() => expect(card.querySelector("[data-library-usage-label]").dataset.usageState).toBe("used"))

    controller.resetUsageForLibraryOpen()
    expect(card.querySelector("[data-library-usage-label]").dataset.usageState).toBe("checking")
    get.mockResolvedValueOnce({ ok: true, json: Promise.resolve({ usage_counts: {}, usage_notes: {} }) })
    controller.usageObserver.trigger(card)
    await vi.waitFor(() => expect(card.querySelector("[data-library-usage-label]").dataset.usageState).toBe("unused"))
    expect(get.mock.calls.filter(([path]) => path === "/library/usage")).toHaveLength(2)
  })

  it("opens usage paths in a dialog and dispatches the selected note", async () => {
    get.mockResolvedValueOnce({ ok: true, json: Promise.resolve({
      usage_counts: { [photo.path]: 2 },
      usage_notes: { [photo.path]: ["notes/first note.md", "../outside.md", "notes/second.md"] }
    }) })
    const card = controller.gridTarget.querySelector(".library-card")
    controller.usageObserver.trigger(card)
    await vi.waitFor(() => expect(card.querySelector("[data-library-usage-label]").dataset.usageState).toBe("used"))

    const usageButton = card.querySelector("[data-library-usage-label] button")
    expect(usageButton.textContent).toBe("Used in 2 notes")
    usageButton.click()

    expect(controller.usageDialogTarget.classList.contains("hidden")).toBe(false)
    expect(controller.usageDialogTitleTarget.textContent).toBe("Notes associated")
    expect(controller.usageDialogTitleTarget.textContent).not.toContain(photo.name)
    const noteButtons = controller.usageNotesTarget.querySelectorAll("button[data-note-path]")
    expect(Array.from(noteButtons, (button) => button.dataset.notePath)).toEqual(["notes/first note.md", "notes/second.md"])
    expect(controller.usageNotesTarget.querySelector("img")).toBeNull()

    const openNote = vi.fn()
    element.addEventListener("library:open-note", openNote)
    await vi.waitFor(() => {
      noteButtons[0].click()
      expect(openNote).toHaveBeenCalledOnce()
    })
    expect(openNote.mock.calls[0][0].detail).toEqual({ path: "notes/first note.md" })
    expect(controller.usageDialogTarget.classList.contains("hidden")).toBe(true)
  })

  it("opens image and video previews with metadata and clickable usage counts", async () => {
    get.mockResolvedValueOnce({
      ok: true,
      json: Promise.resolve({
        usage_counts: { [photo.path]: 2 },
        usage_notes: { [photo.path]: ["notes/photo.md", "notes/second.md"] }
      })
    })
    controller.gridTarget.querySelector(".library-card-preview").click()

    expect(controller.previewDialogTarget.classList.contains("hidden")).toBe(false)
    expect(controller.previewNameTarget.textContent).toBe(photo.name)
    expect(controller.previewMetadataTarget.textContent).toContain("2 KB")
    expect(controller.previewMediaTarget.querySelector("img").getAttribute("src")).toBe("/notes/images/photo%20one.png")
    await vi.waitFor(() => expect(controller.previewUsageTarget.dataset.usageState).toBe("used"))
    const usageButton = controller.previewUsageTarget.querySelector("button")
    expect(usageButton.textContent).toBe("Used in 2 notes")
    expect(usageButton.dataset.path).toBe(photo.path)
    expect(controller.previewUsageTarget.compareDocumentPosition(controller.previewMetadataTarget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    usageButton.click()
    expect(controller.usageDialogTarget.classList.contains("hidden")).toBe(false)
    controller.closeUsageDialog()

    controller.closePreview()
    controller.showVideos()
    const videoCard = controller.gridTarget.querySelector(".library-card-preview")
    expect(videoCard.dataset.path).toBe(clip.path)
    controller.openPreview({ currentTarget: videoCard })
    expect(controller.previewMediaTarget.querySelector("video").getAttribute("src")).toBe("/notes/videos/clip.mp4")
    expect(controller.previewUsageTarget.textContent).toBe("Used in 0 notes")
    expect(controller.previewUsageTarget.querySelector("button")).toBeNull()
  })

  it("shows loading, empty, and failure states", async () => {
    let resolveRequest
    get.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve }))
    const pendingLoad = controller.load()
    expect(controller.loadingTarget.classList.contains("hidden")).toBe(false)
    resolveRequest(mediaResponse([], []))
    await pendingLoad
    expect(controller.loadingTarget.classList.contains("hidden")).toBe(true)
    expect(controller.gridTarget.textContent).toBe("library.empty")

    get.mockRejectedValueOnce(new Error("offline"))
    await controller.load()
    expect(controller.errorTarget.textContent).toBe("offline")
    expect(controller.errorTarget.classList.contains("hidden")).toBe(false)
  })

  it("discards malformed media paths before rendering", async () => {
    get.mockResolvedValueOnce(mediaResponse([
      { ...photo, path: "images/../secret.png" },
      { ...photo, path: "https://example.test/photo.png" }
    ], [clip]))
    await controller.load()

    expect(controller.items.map((item) => item.path)).toEqual([clip.path])
    expect(controller.gridTarget.textContent).toBe("library.empty")
  })

  it("searches and sorts media in each collection", async () => {
    const older = { ...photo, name: "zebra.png", path: "images/zebra.png", mtime: "2026-09-20T12:00:00Z" }
    get.mockResolvedValueOnce(mediaResponse([older, photo], [clip]))
    await controller.load()

    controller.searchTarget.value = "zebra"
    controller.render()
    expect(controller.gridTarget.textContent).toContain("zebra.png")
    expect(controller.gridTarget.textContent).not.toContain("photo one.png")

    controller.searchTarget.value = ""
    controller.sortTarget.value = "name"
    controller.render()
    expect(Array.from(controller.gridTarget.querySelectorAll(".library-card-details > p:first-child"), (node) => node.textContent))
      .toEqual(["photo one.png", "zebra.png"])

    controller.showVideos()
    controller.searchTarget.value = "clip"
    controller.render()
    expect(controller.gridTarget.textContent).toContain("clip.mp4")
  })

  it("copies the stored relative media path and reports clipboard failures", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    const previewButton = controller.gridTarget.querySelector(".library-card-preview")
    controller.openPreview({ currentTarget: previewButton })
    const copyButton = controller.previewDialogTarget.querySelector('[data-action="click->library#copyPreviewPath"]')

    copyButton.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("images/photo one.png"))
    expect(controller.statusTarget.textContent).toBe("library.copied")

    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"))
    copyButton.click()
    await vi.waitFor(() => expect(controller.errorTarget.textContent).toBe("clipboard unavailable"))
  })

  it("confirms deletion, removes the item on success, and reports API errors", async () => {
    controller.gridTarget.querySelector('[data-action="click->library#deleteItem"]').click()
    await vi.waitFor(() => expect(destroy).toHaveBeenCalledWith("/library/file/images/photo%20one.png", { responseKind: "json" }))
    expect(appConfirm).toHaveBeenCalledWith("library.delete_confirm", {
      acceptLabel: "library.delete",
      destructive: true
    })
    await vi.waitFor(() => expect(controller.gridTarget.textContent).toBe("library.empty"))

    get.mockResolvedValueOnce(mediaResponse())
    await controller.load()
    destroy.mockResolvedValueOnce({ ok: false, json: Promise.resolve({ error: "permission denied" }) })
    controller.gridTarget.querySelector('[data-action="click->library#deleteItem"]').click()
    await vi.waitFor(() => expect(controller.errorTarget.textContent).toBe("permission denied"))
  })

  it("does not issue a deletion request when confirmation is cancelled", async () => {
    appConfirm.mockResolvedValueOnce(false)
    controller.gridTarget.querySelector('[data-action="click->library#deleteItem"]').click()

    await vi.waitFor(() => expect(appConfirm).toHaveBeenCalled())
    expect(destroy).not.toHaveBeenCalled()
  })

  it("closes the preview after the app confirms a successful insertion request", () => {
    controller.openPreview({ currentTarget: controller.gridTarget.querySelector(".library-card-preview") })
    const handleInsert = (event) => { event.detail.status = "inserted" }
    element.addEventListener("library:insert-media", handleInsert)

    controller.insertPreviewItem()

    expect(controller.previewDialogTarget.classList.contains("hidden")).toBe(true)
    element.removeEventListener("library:insert-media", handleInsert)
  })
})
