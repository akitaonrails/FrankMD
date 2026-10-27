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

function recentFiles() {
  return `<ul id="home-recent-files">${Array.from({ length: 7 }, (_, index) => `
    <li ${index >= 5 ? 'hidden data-home-target="extraFile"' : ""}>
      <a href="/notes/note-${index}.md">Note ${index}</a>
    </li>`).join("")}</ul>
    <button data-home-target="showMore" data-action="home#showMore" aria-controls="home-recent-files" aria-expanded="false">Show more</button>
    <button data-home-target="showLess" data-action="home#showLess" aria-controls="home-recent-files" aria-expanded="true" hidden>Show less</button>`
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

  it("reveals the remaining notes and moves focus to the first revealed link", async () => {
    global.fetch.mockResolvedValue(response({ html: recentFiles() }))
    await home.refresh({ force: true })
    expect(home.filesTarget.querySelectorAll("li:not([hidden])")).toHaveLength(5)

    const button = home.showMoreTarget
    const less = home.showLessTarget
    less.scrollIntoView = vi.fn()
    button.focus()
    button.click()

    expect(home.filesTarget.querySelectorAll("li:not([hidden])")).toHaveLength(7)
    expect(button.hidden).toBe(true)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement.textContent).toBe("Note 5")
    expect(less.hidden).toBe(false)
    expect(less.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "end" })

    await home.refresh({ force: true })
    expect(home.filesTarget.querySelectorAll("li:not([hidden])")).toHaveLength(7)
    expect(home.showMoreTarget.hidden).toBe(true)
    expect(home.showLessTarget.hidden).toBe(false)

    home.showLessTarget.click()
    expect(home.filesTarget.querySelectorAll("li:not([hidden])")).toHaveLength(5)
    expect(home.showLessTarget.hidden).toBe(true)
    expect(document.activeElement).toBe(home.showMoreTarget)
    await home.refresh({ force: true })
    expect(home.filesTarget.querySelectorAll("li:not([hidden])")).toHaveLength(5)
    expect(home.showMoreTarget.hidden).toBe(false)
  })

  it("respects reduced motion when scrolling to the expanded list", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
    try {
      global.fetch.mockResolvedValue(response({ html: recentFiles() }))
      await home.refresh({ force: true })
      home.showLessTarget.scrollIntoView = vi.fn()
      home.showMoreTarget.click()
      expect(home.showLessTarget.scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "end" })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
