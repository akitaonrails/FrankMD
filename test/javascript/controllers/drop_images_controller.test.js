/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import DropImagesController from "../../../app/javascript/controllers/image_sources/drop_images_controller.js"

describe("DropImagesController", () => {
  let application, controller, element

  beforeEach(() => {
    window.t = vi.fn((key) => key)
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-url")
    global.URL.revokeObjectURL = vi.fn()
    global.Image = class {
      constructor() {
        setTimeout(() => {
          this.naturalWidth = 100
          this.naturalHeight = 100
          if (this.onload) this.onload()
        }, 0)
      }
    }

    document.body.innerHTML = `
      <div data-controller="drop-images">
        <div data-drop-images-target="dropzone"></div>
        <input data-drop-images-target="fileInput" type="file" />
        <div data-drop-images-target="feedback" class="hidden"></div>
        <div data-drop-images-target="container" class="hidden">
          <div data-drop-images-target="grid"></div>
          <div data-drop-images-target="status"></div>
        </div>
      </div>
    `

    element = document.querySelector('[data-controller="drop-images"]')
    application = Application.start()
    application.register("drop-images", DropImagesController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "drop-images")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  function file(name) {
    return { name, lastModified: 1, size: 10 }
  }

  describe("ingestFiles()", () => {
    it("clears a prior selection and notifies the parent on a second ingest", async () => {
      await controller.ingestFiles([ file("a.png") ])
      // Simulate the user having selected the first image.
      controller.selectedImage = { name: "a.png", file: file("a.png") }

      const dispatchSpy = vi.spyOn(controller, "dispatch")
      await controller.ingestFiles([ file("b.png") ])

      expect(controller.selectedImage).toBeNull()
      expect(dispatchSpy).toHaveBeenCalledWith(
        "deselected",
        expect.objectContaining({ detail: { type: "drop" } })
      )
    })

    it("does not dispatch deselected when there was no prior selection", async () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      await controller.ingestFiles([ file("a.png") ])
      expect(dispatchSpy).not.toHaveBeenCalledWith("deselected", expect.anything())
    })
  })

  describe("drag highlight", () => {
    const ACCENT = "border-[var(--theme-accent)]"

    it("highlights on dragover and clears on drop", async () => {
      controller.onDragover({ preventDefault: vi.fn() })
      expect(controller.dropzoneTarget.classList.contains(ACCENT)).toBe(true)

      await controller.onDrop({ preventDefault: vi.fn(), dataTransfer: { files: [] } })
      expect(controller.dropzoneTarget.classList.contains(ACCENT)).toBe(false)
    })

    it("keeps the highlight when dragleave moves onto a child (no flicker)", () => {
      controller.onDragover({ preventDefault: vi.fn() })
      const child = document.createElement("span")
      controller.dropzoneTarget.appendChild(child)

      controller.onDragleave({ preventDefault: vi.fn(), relatedTarget: child })
      expect(controller.dropzoneTarget.classList.contains(ACCENT)).toBe(true)
    })

    it("clears the highlight when the pointer truly leaves", () => {
      controller.onDragover({ preventDefault: vi.fn() })
      controller.onDragleave({ preventDefault: vi.fn(), relatedTarget: document.body })
      expect(controller.dropzoneTarget.classList.contains(ACCENT)).toBe(false)
    })
  })

  describe("onDropzoneKeydown()", () => {
    it("opens the picker on Enter and Space, ignores others", () => {
      const spy = vi.spyOn(controller, "openPicker").mockImplementation(() => {})

      controller.onDropzoneKeydown({ key: "Enter", preventDefault: vi.fn() })
      controller.onDropzoneKeydown({ key: " ", preventDefault: vi.fn() })
      expect(spy).toHaveBeenCalledTimes(2)

      controller.onDropzoneKeydown({ key: "x", preventDefault: vi.fn() })
      expect(spy).toHaveBeenCalledTimes(2)
    })
  })
})
