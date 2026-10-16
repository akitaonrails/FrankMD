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
      <dialog data-media-storage-target="warningDialog"></dialog>
    </div>`
    application = Application.start()
    application.register("media-storage", MediaStorageController)
    await new Promise(resolve => setTimeout(resolve, 0))
    controller = application.getControllerForElementAndIdentifier(document.querySelector("[data-controller]"), "media-storage")
    selects = [...document.querySelectorAll("select")]
    controller.warningDialogTarget.showModal = vi.fn(() => { controller.warningDialogTarget.open = true })
    controller.warningDialogTarget.close = vi.fn(() => { controller.warningDialogTarget.open = false })
  })

  afterEach(() => {
    application.stop()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.useRealTimers()
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

  it("retains saved S3 when the server cannot persist recovery", async () => {
    global.fetch = vi.fn().mockResolvedValue(response("s3", false))
    await controller.refresh()
    expect(selects.every(select => select.value === "s3" && select.querySelector('[value="s3"]').disabled)).toBe(true)
    expect(controller.s3OnlyTargets[0].classList.contains("hidden")).toBe(false)
    expect(controller.warningDialogTarget.showModal).not.toHaveBeenCalled()
    global.fetch.mockResolvedValue(response("local", true))
    await controller.refresh()
    expect(selects.every(select => select.value === "local")).toBe(true)
  })

  it("synchronizes Local and shows one brief warning after acknowledged recovery", async () => {
    vi.useFakeTimers()
    controller.providerValue = "s3"
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...settings("local", false), media_storage_fallback: true }) })
    await controller.refresh()
    expect(selects.every(select => select.value === "local")).toBe(true)
    expect(selects[0].querySelector('[value="s3"]').disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.warningDialogTarget.showModal).toHaveBeenCalledOnce()
    controller.apply({ ...settings("local", false), media_storage_fallback: true })
    expect(controller.warningDialogTarget.showModal).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(6000)
    expect(controller.warningDialogTarget.open).toBe(false)
    global.fetch.mockResolvedValue(response("local", false))
    await controller.refresh()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.warningDialogTarget.showModal).toHaveBeenCalledOnce()
  })

  it("shows recovery reported by the initial page and supports early dismissal", async () => {
    vi.useFakeTimers()
    controller.fallbackValue = true
    controller.connect()
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.warningDialogTarget.open).toBe(true)
    controller.dismissWarning()
    expect(controller.warningDialogTarget.open).toBe(false)
    await vi.advanceTimersByTimeAsync(6000)
    expect(controller.warningDialogTarget.close).toHaveBeenCalledOnce()
  })

  it("keeps a recovery warning consumed by Settings' first configuration request", async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue(response("local", false))
    await controller.refresh(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.warningDialogTarget.open).toBe(true)
  })

  it("does not warn for an explicit switch to Local or a failed refresh", async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue(response("local"))
    await controller.setProvider("local")
    global.fetch.mockResolvedValue({ ok: false })
    await controller.refresh(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.warningDialogTarget.showModal).not.toHaveBeenCalled()
  })

  it("reports network failures without changing the acknowledged provider", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"))
    await controller.changeProvider({ currentTarget: { value: "s3" } })
    expect(controller.providerValue).toBe("local")
    expect(controller.errorTargets[0].textContent).toBe("offline")
  })
})
