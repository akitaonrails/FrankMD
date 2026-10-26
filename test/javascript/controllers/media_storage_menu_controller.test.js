/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import MediaStorageController from "../../../app/javascript/controllers/media_storage_controller.js"
import MediaStorageMenuController from "../../../app/javascript/controllers/media_storage_menu_controller.js"

describe("Settings media storage menu", () => {
  let application, storage, menu, trigger, options

  beforeEach(async () => {
    window.t = key => key
    document.body.innerHTML = `<div data-controller="media-storage" data-media-storage-s3-available-value="true">
      <select data-media-storage-target="select"><option value="local">Local</option><option value="s3">S3</option></select>
      <div data-controller="media-storage-menu" data-media-storage-menu-unavailable-message-value="This provider is not configured." data-media-storage-menu-media-storage-outlet='[data-controller~="media-storage"]'
           data-action="media-storage:changed@window->media-storage-menu#sync">
        <button data-media-storage-menu-target="button" data-action="click->media-storage-menu#toggle" aria-expanded="false"><span data-media-storage-menu-target="current"></span></button>
        <div class="hidden" data-media-storage-menu-target="menu">
          ${["local", "s3"].map(provider => `<button value="${provider}" data-media-storage-menu-target="option" data-action="click->media-storage-menu#select"><span>${provider === "local" ? "Local" : "S3"}</span><svg class="checkmark"></svg></button>`).join("")}
        </div>
        <p data-media-storage-target="error"></p>
      </div>
      <button id="outside">Outside</button>
    </div>`
    application = Application.start()
    application.register("media-storage", MediaStorageController)
    application.register("media-storage-menu", MediaStorageMenuController)
    await new Promise(resolve => setTimeout(resolve, 0))
    storage = application.getControllerForElementAndIdentifier(document.querySelector('[data-controller="media-storage"]'), "media-storage")
    menu = application.getControllerForElementAndIdentifier(document.querySelector('[data-controller="media-storage-menu"]'), "media-storage-menu")
    trigger = menu.buttonTarget
    trigger.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 100, right: 260 })
    options = menu.optionTargets
  })

  afterEach(() => {
    application.stop()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it("shares acknowledged selection and disables all controls while saving", async () => {
    let finish
    global.fetch = vi.fn(() => new Promise(resolve => { finish = resolve }))
    trigger.click()
    const save = menu.select({ currentTarget: options[1] })
    expect(trigger.disabled).toBe(true)
    expect(options.every(option => option.disabled)).toBe(true)
    expect(menu.currentTarget.textContent).toBe("Local")
    finish({ ok: true, json: async () => ({ settings: { media_storage_provider: "s3" }, features: { s3_upload: true } }) })
    await save
    expect(trigger.disabled).toBe(false)
    expect(menu.currentTarget.textContent).toBe("S3")
    expect(options[1].getAttribute("aria-checked")).toBe("true")
    expect(document.querySelector("select").value).toBe("s3")
  })

  it("keeps the acknowledged label and reports a failed save", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    await menu.select({ currentTarget: options[1] })
    expect(menu.currentTarget.textContent).toBe("Local")
    expect(trigger.disabled).toBe(false)
    expect(storage.errorTargets[0].textContent).toBe("media_storage.save_failed")
  })

  it("shows saved S3 when credentials disappear and prevents selecting it", () => {
    storage.apply({ settings: { media_storage_provider: "s3" }, features: { s3_upload: false } })
    expect(menu.currentTarget.textContent).toBe("S3")
    expect(options[1].disabled).toBe(true)
    expect(options[1].title).toBe("This provider is not configured.")
    storage.s3AvailableValue = true
    storage.syncControls()
    expect(options[1].title).toBe("")
    expect(options[0].disabled).toBe(false)
  })

  it("moves keyboard focus, dismisses with Escape, and closes on outside click", () => {
    trigger.click()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement).toBe(options[0])
    options[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    expect(document.activeElement).toBe(options[1])
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    options[1].dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(trigger)
    expect(menu.menuTarget.classList.contains("hidden")).toBe(true)
    trigger.click()
    document.getElementById("outside").click()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })
})
