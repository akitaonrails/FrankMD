/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import MediaStorageController from "../../../app/javascript/controllers/media_storage_controller.js"

describe("shared media storage", () => {
  let application, controller, selects
  const settings = (provider, available = true) => ({
    settings: { media_storage_provider: provider }, features: { s3_upload: available }
  })
  const response = (provider, available = true) => ({ ok: true, json: async () => settings(provider, available) })

  beforeEach(async () => {
    window.t = key => key
    document.body.innerHTML = `<div data-controller="media-storage" data-media-storage-s3-available-value="true">
      ${[1, 2, 3].map(() => `<select data-media-storage-target="select"><option value="local">Local</option><option value="s3">S3</option></select><p data-media-storage-target="error"></p>`).join("")}
      <div data-media-storage-target="s3Only"></div>
    </div>`
    application = Application.start()
    application.register("media-storage", MediaStorageController)
    await new Promise(resolve => setTimeout(resolve, 0))
    controller = application.getControllerForElementAndIdentifier(document.querySelector("[data-controller]"), "media-storage")
    selects = [...document.querySelectorAll("select")]
  })

  afterEach(() => {
    application.stop()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it("saves immediately, blocks consumers, and updates every selector after acknowledgement", async () => {
    let finish
    global.fetch = vi.fn(() => new Promise(resolve => { finish = resolve }))
    selects[0].value = "s3"
    const save = controller.changeProvider({ currentTarget: selects[0] })
    const consumer = vi.fn()
    const upload = controller.ready().then(consumer)
    expect(global.fetch).toHaveBeenCalledWith("/config", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ media_storage_provider: "s3" })
    }))
    expect(selects.every(select => select.disabled)).toBe(true)
    expect(consumer).not.toHaveBeenCalled()
    finish(response("s3"))
    await Promise.all([save, upload])
    expect(consumer).toHaveBeenCalledOnce()
    expect(selects.every(select => select.value === "s3" && !select.disabled)).toBe(true)
  })

  it("restores previous controls and rejects waiting uploads on failed persistence", async () => {
    let finish
    global.fetch = vi.fn(() => new Promise(resolve => { finish = resolve }))
    selects[1].value = "s3"
    const save = controller.changeProvider({ currentTarget: selects[1] })
    const waiting = expect(controller.ready()).rejects.toThrow("media_storage.save_failed")
    finish({ ok: false })
    expect(await save).toBe(false)
    await waiting
    expect(selects.every(select => select.value === "local" && !select.disabled)).toBe(true)
    expect(controller.errorTargets.every(target => target.textContent === "media_storage.save_failed")).toBe(true)
  })

  it("refreshes a saved S3 selection even when credentials have disappeared", async () => {
    global.fetch = vi.fn().mockResolvedValue(response("s3", false))
    await controller.refresh()
    expect(selects.every(select => select.value === "s3" && select.querySelector('[value="s3"]').disabled)).toBe(true)
    expect(controller.s3OnlyTargets[0].classList.contains("hidden")).toBe(false)
    global.fetch.mockResolvedValue(response("local", true))
    await controller.refresh()
    expect(selects.every(select => select.value === "local")).toBe(true)
  })

  it("reports network failures without changing the acknowledged provider", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"))
    await controller.changeProvider({ currentTarget: { value: "s3" } })
    expect(controller.providerValue).toBe("local")
    expect(controller.errorTargets[0].textContent).toBe("offline")
  })
})
