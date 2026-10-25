/**
 * @vitest-environment jsdom
 */
import { Application } from "@hotwired/stimulus"
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest"
import ImageViewerController from "../../../app/javascript/controllers/image_viewer_controller"

describe("image overlay", () => {
  let application, viewer, dialog, trigger, fallback

  beforeEach(async () => {
    document.body.innerHTML = `<button id="trigger">Image</button><div id="fallback" tabindex="-1"></div>
      <dialog data-controller="image-viewer" data-action="close->image-viewer#onClose" data-image-viewer-loading-value="Loading" data-image-viewer-error-value="Unavailable">
        <button data-image-viewer-target="closeButton">Close</button>
        <div data-image-viewer-target="stage"></div><p data-image-viewer-target="status"></p>
      </dialog>`
    dialog = document.querySelector("dialog")
    trigger = document.getElementById("trigger")
    fallback = document.getElementById("fallback")
    dialog.showModal = vi.fn(() => { dialog.open = true })
    dialog.close = vi.fn(() => { dialog.open = false; dialog.dispatchEvent(new Event("close")) })
    application = Application.start()
    application.register("image-viewer", ImageViewerController)
    await vi.waitFor(() => {
      viewer = application.getControllerForElementAndIdentifier(dialog, "image-viewer")
      expect(viewer).toBeTruthy()
    })
  })

  afterEach(() => { application.unload("image-viewer"); application.stop(); vi.restoreAllMocks() })

  function open(src = "/safe.png", alt = "Example") {
    viewer.open({ detail: { src, alt, trigger, fallback } })
  }

  it("loads a fresh image, focuses Close, and restores the trigger", () => {
    open()
    expect(dialog.showModal).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(viewer.closeButtonTarget)
    expect(viewer.statusTarget.textContent).toBe("Loading")
    expect(viewer.image.alt).toBe("Example")
    viewer.image.dispatchEvent(new Event("load"))
    expect(viewer.image.hidden).toBe(false)
    expect(viewer.statusTarget.textContent).toBe("")
    viewer.close()
    expect(document.activeElement).toBe(trigger)
    expect(viewer.stageTarget.children).toHaveLength(0)
  })

  it("falls back to the preview after a rerender removes the trigger", () => {
    open()
    trigger.remove()
    viewer.close()
    expect(document.activeElement).toBe(fallback)
  })

  it("ignores an old resource event when a newer image is opened", () => {
    open("/first.png")
    const first = viewer.image
    open("/next.png")
    first.dispatchEvent(new Event("error"))
    expect(viewer.statusTarget.textContent).toBe("Loading")
    viewer.image.dispatchEvent(new Event("error"))
    expect(viewer.statusTarget.textContent).toBe("Unavailable")
    expect(dialog.open).toBe(true)
  })

  it.each(["javascript:alert(1)", "file:///secret.png", "data:text/html,<script>evil()</script>"])("rejects unsafe image source %s", src => {
    open(src)
    expect(dialog.showModal).not.toHaveBeenCalled()
    expect(viewer.stageTarget.children).toHaveLength(0)
  })

  it("treats untrusted alternative text as text rather than HTML", () => {
    open("https://example.com/image.png", '<img src=x onerror="evil()">')
    expect(viewer.stageTarget.querySelectorAll("img")).toHaveLength(1)
    expect(viewer.image.hasAttribute("onerror")).toBe(false)
    expect(viewer.image.alt).toBe('<img src=x onerror="evil()">')
  })
})
