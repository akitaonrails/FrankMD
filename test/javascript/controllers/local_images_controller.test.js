/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("lib/app_prompt", () => ({ appConfirm: vi.fn().mockResolvedValue(true) }))
vi.mock("lib/image_sources/local_images", () => ({ LocalImageSource: vi.fn() }))
import { Application } from "@hotwired/stimulus"
import LocalImagesController from "../../../app/javascript/controllers/image_sources/local_images_controller.js"
import { appConfirm } from "lib/app_prompt"
import { LocalImageSource } from "lib/image_sources/local_images"

describe("LocalImagesController", () => {
  let application, controller, source

  beforeEach(() => {
    vi.clearAllMocks()
    window.t = vi.fn((key) => key)
    source = { deleteImage: vi.fn().mockRejectedValue(new Error("delete failed")) }
    LocalImageSource.mockImplementation(() => source)
    appConfirm.mockResolvedValue(true)

    document.body.innerHTML = `
      <div data-controller="local-images">
        <p class="hidden" data-local-images-target="error"></p>
        <div data-local-images-target="grid"></div>
      </div>
    `
    application = Application.start()
    application.register("local-images", LocalImagesController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(
          document.querySelector('[data-controller="local-images"]'),
          "local-images"
        )
        controller.source = source
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    document.body.replaceChildren()
    delete window.t
    vi.restoreAllMocks()
  })

  it("confirms deletion with a destructive localized action and keeps failures inline", async () => {
    await controller.deleteImage({
      stopPropagation: vi.fn(),
      currentTarget: { dataset: { path: "photo.png", name: "photo.png" } }
    })

    expect(appConfirm).toHaveBeenCalledWith("dialogs.image_picker.delete_confirm", {
      acceptLabel: "common.delete",
      destructive: true
    })
    expect(controller.errorTarget.textContent).toBe("delete failed")
    expect(controller.errorTarget.classList.contains("hidden")).toBe(false)
  })

  it("does not delete when confirmation is cancelled", async () => {
    appConfirm.mockResolvedValue(false)

    await controller.deleteImage({
      stopPropagation: vi.fn(),
      currentTarget: { dataset: { path: "photo.png", name: "photo.png" } }
    })

    expect(source.deleteImage).not.toHaveBeenCalled()
  })

  it("shows useful load errors inline and clears them after a successful load", async () => {
    source.load = vi.fn()
      .mockResolvedValueOnce({ error: "Images directory is unavailable" })
      .mockResolvedValueOnce({ images: [], total: 0 })
    source.renderGrid = vi.fn()

    await controller.loadImages()

    expect(controller.errorTarget.textContent).toBe("Images directory is unavailable")
    expect(controller.errorTarget.classList.contains("hidden")).toBe(false)

    await controller.loadImages()

    expect(controller.errorTarget.textContent).toBe("")
    expect(controller.errorTarget.classList.contains("hidden")).toBe(true)
  })
})
