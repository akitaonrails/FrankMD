/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import FolderImagesController from "../../../app/javascript/controllers/image_sources/folder_images_controller.js"

describe("FolderImagesController#browse", () => {
  let application, controller, element

  beforeEach(async () => {
    window.t = vi.fn((key) => ({
      "dialogs.image_picker.folder_access_failed": "Localized folder browse error",
      "dialogs.image_picker.folder_read_failed": "Localized folder read error"
    })[key] || key)

    document.body.innerHTML = `
      <dialog open>
        <div data-controller="folder-images">
          <p class="hidden" role="alert" data-folder-images-target="error"></p>
          <div data-folder-images-target="browsePrompt"></div>
          <div data-folder-images-target="container"></div>
          <div data-folder-images-target="grid"></div>
        </div>
      </dialog>
    `

    element = document.querySelector('[data-controller="folder-images"]')
    application = Application.start()
    application.register("folder-images", FolderImagesController)
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller = application.getControllerForElementAndIdentifier(element, "folder-images")
  })

  afterEach(() => {
    application.stop()
    delete window.showDirectoryPicker
    delete window.t
    vi.restoreAllMocks()
  })

  it("shows a localized folder access error inline without closing the picker", async () => {
    window.showDirectoryPicker = vi.fn().mockRejectedValue(new Error("Permission denied"))

    await controller.browse()

    expect(controller.errorTarget.textContent).toBe("Localized folder browse error")
    expect(controller.errorTarget.classList.contains("hidden")).toBe(false)
    expect(document.querySelector("dialog").open).toBe(true)
    expect(window.t).toHaveBeenCalledWith("dialogs.image_picker.folder_access_failed", {})
  })

  it("shows a localized folder read error inline", async () => {
    window.showDirectoryPicker = vi.fn().mockResolvedValue({
      async *values() {
        throw new Error("Permission denied")
      }
    })
    vi.spyOn(console, "error").mockImplementation(() => {})

    await controller.browse()

    expect(controller.errorTarget.textContent).toBe("Localized folder read error")
    expect(controller.errorTarget.classList.contains("hidden")).toBe(false)
    expect(document.querySelector("dialog").open).toBe(true)
    expect(window.t).toHaveBeenCalledWith("dialogs.image_picker.folder_read_failed", {})
  })
})
