/**
 * @vitest-environment jsdom
 */
import { Application, Controller } from "@hotwired/stimulus"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import HomeController from "../../../app/javascript/controllers/home_controller"

vi.mock("lib/app_prompt", () => ({ appConfirm: vi.fn().mockResolvedValue(true) }))

function response({ ok = true, status = 200, html = "<p>Recent files</p>" } = {}) {
  return { ok, status, text: async () => html }
}

describe("shared Home", () => {
  let application, home, app

  beforeEach(async () => {
    document.body.innerHTML = `
      <div data-controller="app"></div>
      <section data-controller="home" data-home-app-outlet='[data-controller="app"]' data-clear-confirmation="Clear everywhere?" data-error-message="History unavailable">
        <div data-home-target="files">Existing history</div>
        <p data-home-target="status"></p>
      </section>`
    application = Application.start()
    application.register("app", class extends Controller {
      loadFile = vi.fn()
    })
    application.register("home", HomeController)
    global.fetch = vi.fn().mockResolvedValue(response())
    await vi.waitFor(() => {
      home = application.getControllerForElementAndIdentifier(document.querySelector("section"), "home")
      app = application.getControllerForElementAndIdentifier(document.querySelector("[data-controller=app]"), "app")
      expect(home?.hasAppOutlet).toBe(true)
    })
  })

  afterEach(() => {
    application.unload("home", "app")
    application.stop()
    vi.restoreAllMocks()
  })

  it("records successful opens in order before refreshing server-rendered history", async () => {
    const first = home.record("docs/one.md")
    const second = home.record("two.md")
    await home.refresh({ force: true })
    await Promise.all([first, second])
    expect(global.fetch.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ["/recent_files", "POST"], ["/recent_files", "POST"], ["/recent_files", "GET"]
    ])
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ path: "docs/one.md" })
    expect(home.filesTarget.innerHTML).toBe("<p>Recent files</p>")
  })

  it("does not erase the displayed list on a network failure and accepts later opens", async () => {
    global.fetch.mockRejectedValueOnce(new Error("offline"))
    await home.refresh({ force: true })
    expect(home.filesTarget.textContent).toBe("Existing history")
    expect(home.statusTarget.textContent).toBe("History unavailable")
    await home.record("next.md")
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it("ignores an older response after a newer refresh", async () => {
    let resolveOld
    global.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const old = home.refresh({ force: true })
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf("function"))
    await home.refresh({ force: true })
    resolveOld(response({ html: "Old response" }))
    await old
    expect(home.filesTarget.innerHTML).toBe("<p>Recent files</p>")
  })

  it("opens through guarded app navigation and preserves modified links", () => {
    const event = { button: 0, currentTarget: { dataset: { path: "note.md" } }, preventDefault: vi.fn() }
    home.open(event)
    expect(app.loadFile).toHaveBeenCalledWith("note.md")
    home.open({ ...event, metaKey: true })
    expect(app.loadFile).toHaveBeenCalledTimes(1)
  })

  it("clears shared history through the server", async () => {
    await home.clear()
    expect(global.fetch.mock.calls[0][1].method).toBe("DELETE")
    expect(global.fetch.mock.calls[1][1].method).toBe("GET")
  })
})
