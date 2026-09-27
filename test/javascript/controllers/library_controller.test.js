/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { get } from "@rails/request.js"
import LibraryController from "../../../app/javascript/controllers/library_controller.js"

vi.mock("@rails/request.js", () => ({ get: vi.fn() }))

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
    window.t = (key, options = {}) => key.replace(/%\{(\w+)\}/g, (_match, name) => options[name] ?? `%{${name}}`)
    get.mockResolvedValue(mediaResponse())

    document.body.innerHTML = `
      <div data-controller="library">
        <button data-library-target="imagesTab" data-action="click->library#showImages"></button>
        <button data-library-target="videosTab" data-action="click->library#showVideos"></button>
        <span data-library-target="count"></span>
        <p class="hidden" data-library-target="error"></p>
        <p class="hidden" data-library-target="loading"></p>
        <div data-library-target="grid"></div>
        <div class="hidden" data-library-target="previewDialog" data-action="click->library#closePreviewOnBackdrop">
          <h2 data-library-target="previewName"></h2>
          <p data-library-target="previewMetadata"></p>
          <div data-library-target="previewMedia"></div>
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
    vi.restoreAllMocks()
  })

  it("fetches the read-only Library endpoint and renders image and video cards", () => {
    expect(get).toHaveBeenCalledWith("/library", { responseKind: "json" })
    expect(controller.gridTarget.querySelectorAll(".library-card")).toHaveLength(1)
    expect(controller.gridTarget.querySelector("img").getAttribute("src")).toBe("/notes/images/photo%20one.png")
    expect(controller.gridTarget.textContent).toContain("2 KB")

    controller.videosTabTarget.click()

    expect(controller.videosTabTarget.getAttribute("aria-pressed")).toBe("true")
    expect(controller.gridTarget.textContent).toContain("clip.mp4")
    expect(controller.gridTarget.querySelector("video").getAttribute("src")).toBe("/notes/videos/clip.mp4")
    expect(controller.gridTarget.textContent).toContain("4 KB")
    expect(controller.gridTarget.querySelectorAll("button")).toHaveLength(1)
  })

  it("opens image and video previews with filename and metadata", () => {
    controller.gridTarget.querySelector(".library-card-preview").click()

    expect(controller.previewDialogTarget.classList.contains("hidden")).toBe(false)
    expect(controller.previewNameTarget.textContent).toBe(photo.name)
    expect(controller.previewMetadataTarget.textContent).toContain("2 KB")
    expect(controller.previewMediaTarget.querySelector("img").getAttribute("src")).toBe("/notes/images/photo%20one.png")

    controller.closePreview()
    controller.showVideos()
    const videoCard = controller.gridTarget.querySelector(".library-card-preview")
    expect(videoCard.dataset.path).toBe(clip.path)
    controller.openPreview({ currentTarget: videoCard })
    expect(controller.previewMediaTarget.querySelector("video").getAttribute("src")).toBe("/notes/videos/clip.mp4")
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
})
