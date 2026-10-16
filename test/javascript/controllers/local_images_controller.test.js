/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("lib/app_prompt", () => ({ appConfirm: vi.fn().mockResolvedValue(true) }))
import { Application } from "@hotwired/stimulus"
import LocalImagesController from "../../../app/javascript/controllers/image_sources/local_images_controller.js"
import { appConfirm } from "lib/app_prompt"

describe("local Library picker", () => {
  let application, controller

  beforeEach(async () => {
    window.t = key => key
    appConfirm.mockResolvedValue(true)
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    document.body.innerHTML = `<div data-controller="local-images">
      <p class="hidden" data-local-images-target="error"></p>
      <select data-local-images-target="collection"><option value="managed">Notes</option><option value="server">Server</option></select>
      <select data-local-images-target="perPage"><option value="10">10</option><option value="25">25</option></select>
      <input data-local-images-target="search">
      <div data-local-images-target="results" data-total="20">
        <div data-local-images-target="grid"><div class="image-grid-item">
          <button data-path="images/photo.png" data-name="photo.png" data-url="images/photo.png" data-collection="managed"></button>
        </div></div>
      </div>
    </div>`
    application = Application.start()
    application.register("local-images", LocalImagesController)
    await new Promise(resolve => setTimeout(resolve, 0))
    controller = application.getControllerForElementAndIdentifier(document.querySelector("[data-controller]"), "local-images")
  })

  afterEach(() => {
    application.unload("local-images")
    application.stop()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it("loads managed images by default as a server-rendered Turbo Stream", async () => {
    controller.collectionTarget.focus()
    await controller.activate()
    expect(document.activeElement).toBe(controller.collectionTarget)
    expect(global.fetch).toHaveBeenCalledWith("/library/picker?collection=managed&search=&limit=10&offset=0", expect.objectContaining({
      method: "GET", headers: { Accept: "text/vnd.turbo-stream.html, text/html, application/xhtml+xml" }
    }))
  })

  it("changes collections and page size without keeping a stale selected image", async () => {
    controller.selectedImage = { path: "images/old.png" }
    controller.offset = 10
    controller.collectionTarget.value = "server"
    controller.perPageTarget.value = "25"
    controller.searchTarget.value = "photo"
    await controller.onCollectionChange()
    expect(controller.selectedImage).toBeNull()
    expect(global.fetch.mock.calls[0][0]).toBe("/library/picker?collection=server&search=photo&limit=25&offset=0")
    await controller.nextPage()
    expect(global.fetch.mock.lastCall[0]).toContain("offset=25")
  })

  it("returns the existing managed or server reference without uploading a copy", async () => {
    const button = controller.gridTarget.querySelector("button")
    controller.select({ currentTarget: button })
    expect(await controller.getImageUrl()).toBe("images/photo.png")
    controller.selectedImage = { path: "photo.png", url: "/images/preview/photo.png", collection: "server" }
    expect(await controller.getImageUrl()).toBe("/images/preview/photo.png")
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("saves an optional server image copy through the provider-neutral endpoint", async () => {
    controller.selectedImage = { path: "photo.png", url: "/images/preview/photo.png", collection: "server" }
    vi.spyOn(controller, "s3Option", "get").mockReturnValue({ isChecked: true, resizeRatio: "", keyValue: "folder/photo.png" })
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ url: "images/copy.png" }) })
    expect(await controller.getImageUrl()).toBe("images/copy.png")
    expect(global.fetch).toHaveBeenCalledWith("/images/import", expect.objectContaining({
      body: JSON.stringify({ path: "photo.png", resize: "", s3_key: "folder/photo.png" })
    }))
  })

  it.each([ ["managed", "library"], ["server", "images"] ])("deletes %s files through the correct service", async (collection, endpoint) => {
    await controller.deleteImage({ stopPropagation: vi.fn(), currentTarget: { dataset: { path: "images/photo.png", name: "photo.png", collection } } })
    expect(appConfirm).toHaveBeenCalledWith("dialogs.image_picker.delete_confirm", { acceptLabel: "common.delete", destructive: true })
    expect(global.fetch.mock.calls[0][0]).toBe(`/${endpoint}/file/images/photo.png`)
    expect(global.fetch.mock.calls[0][1].method).toBe("DELETE")
  })

  it("does not delete when confirmation is cancelled", async () => {
    appConfirm.mockResolvedValue(false)
    await controller.deleteImage({ stopPropagation: vi.fn(), currentTarget: { dataset: { path: "photo.png" } } })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("keeps deletion and load failures inline", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "delete failed" }) })
    await controller.deleteImage({ stopPropagation: vi.fn(), currentTarget: { dataset: { path: "photo.png" } } })
    expect(controller.errorTarget.textContent).toBe("delete failed")
    global.fetch.mockRejectedValueOnce(new Error("offline"))
    await controller.loadImages()
    expect(controller.errorTarget.textContent).toBe("offline")
    await controller.loadImages()
    expect(controller.errorTarget.textContent).toBe("")
  })

  it("disables an unavailable server collection while keeping note images usable", () => {
    controller.configure(false)
    expect(controller.collectionTarget.querySelector('[value="server"]').disabled).toBe(true)
    expect(controller.collection).toBe("managed")
  })
})
