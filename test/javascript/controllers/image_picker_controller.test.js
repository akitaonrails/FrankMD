/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import ImagePickerController from "../../../app/javascript/controllers/image_picker_controller.js"

describe("ImagePickerController#openWithFile", () => {
  let application, controller, element

  beforeEach(() => {
    window.t = vi.fn((key) => key)
    // connect() loads /images/config; return a minimal config.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ s3_enabled: false, image_extensions: [".png"] })
    })

    document.body.innerHTML = `
      <div data-controller="image-picker">
        <dialog data-image-picker-target="dialog"></dialog>
        <div data-image-picker-target="loading" class="hidden">
          <span data-image-picker-target="loadingText"></span>
        </div>
      </div>
    `

    element = document.querySelector('[data-controller="image-picker"]')
    application = Application.start()
    application.register("image-picker", ImagePickerController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "image-picker")
        // open() calls dialog.showModal(), unimplemented in jsdom — stub it out.
        controller.open = vi.fn().mockResolvedValue()
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  it("opens the picker and delegates the file to the Drop source with loading toggled", async () => {
    const dropCtrl = { loadExternalFile: vi.fn().mockResolvedValue() }
    controller.getSourceController = vi.fn(() => dropCtrl)
    const showLoading = vi.spyOn(controller, "showLoading")
    const hideLoading = vi.spyOn(controller, "hideLoading")

    const file = { name: "pasted.png" }
    await controller.openWithFile(file)

    expect(controller.open).toHaveBeenCalled()
    expect(controller.getSourceController).toHaveBeenCalledWith("drop-images")
    expect(showLoading).toHaveBeenCalledWith("dialogs.image_picker.processing_image_paste")
    expect(dropCtrl.loadExternalFile).toHaveBeenCalledWith(file)
    expect(hideLoading).toHaveBeenCalled()
  })

  it("bails without loading when the Drop source is unavailable", async () => {
    controller.getSourceController = vi.fn(() => null)
    const showLoading = vi.spyOn(controller, "showLoading")

    await controller.openWithFile({ name: "pasted.png" })

    expect(controller.open).toHaveBeenCalled()
    expect(showLoading).not.toHaveBeenCalled()
  })

  it("hides the loading overlay even when ingest throws", async () => {
    const dropCtrl = { loadExternalFile: vi.fn().mockRejectedValue(new Error("boom")) }
    controller.getSourceController = vi.fn(() => dropCtrl)
    const hideLoading = vi.spyOn(controller, "hideLoading")

    await expect(controller.openWithFile({ name: "pasted.png" })).rejects.toThrow("boom")

    expect(hideLoading).toHaveBeenCalled()
  })
})
