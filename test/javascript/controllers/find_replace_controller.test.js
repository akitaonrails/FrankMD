import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { setupJsdomGlobals } from "../helpers/jsdom_globals.js"
import FindReplaceController from "../../../app/javascript/controllers/find_replace_controller.js"

describe("FindReplaceController", () => {
  let application
  let controller
  let element
  let textarea

  beforeEach(() => {
    setupJsdomGlobals()

    window.t = vi.fn((key, options = {}) => {
      if (key === "dialogs.find_replace.match_count") {
        return `${options.current} of ${options.total}`
      }
      if (key === "dialogs.find_replace.no_results") {
        return "No results"
      }
      if (key === "dialogs.find_replace.replaced_count") {
        return `Replaced ${options.count}`
      }
      return key
    })

    document.body.innerHTML = `
      <textarea id="editor"></textarea>
      <div data-controller="find-replace">
        <dialog data-find-replace-target="dialog"></dialog>
        <input data-find-replace-target="findInput" />
        <div data-find-replace-target="replaceSection"></div>
        <input data-find-replace-target="replaceInput" />
        <button data-find-replace-target="tabFind"></button>
        <button data-find-replace-target="tabReplace"></button>
        <span data-find-replace-target="matchCount"></span>
        <div data-find-replace-target="miniBar"></div>
        <span data-find-replace-target="miniCount"></span>
        <span data-find-replace-target="miniModeLabel"></span>
        <button data-find-replace-target="caseSensitiveToggle"></button>
        <button data-find-replace-target="regexToggle"></button>
        <div data-find-replace-target="results" data-action="click->find-replace#selectResult" class="hidden"></div>
      </div>
    `

    HTMLDialogElement.prototype.show = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.open = false
    })

    element = document.querySelector('[data-controller="find-replace"]')
    textarea = document.getElementById("editor")
    application = Application.start()
    application.register("find-replace", FindReplaceController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "find-replace")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  it("initializes state on connect", () => {
    expect(controller.matches).toEqual([])
    expect(controller.currentMatchIndex).toBe(-1)
    expect(controller.activeTab).toBe("find")
  })

  it("opens dialog in replace tab", () => {
    controller.open({ textarea, tab: "replace" })

    expect(controller.dialogTarget.open).toBe(true)
    expect(controller.activeTab).toBe("replace")
    expect(controller.replaceSectionTarget.classList.contains("hidden")).toBe(false)
  })

  it("finds matches and updates count", () => {
    textarea.value = "Hello hello"
    controller.textareaRef = textarea
    controller.findInputTarget.value = "hello"

    controller.findAll()

    expect(controller.matches.length).toBe(2)
    expect(controller.matchCountTarget.textContent).toBe("1 of 2")
  })

  it("dispatches jump on find next", () => {
    textarea.value = "one one"
    controller.textareaRef = textarea
    controller.findInputTarget.value = "one"
    controller.findAll()

    const dispatchSpy = vi.spyOn(controller, "dispatch")
    controller.findNext()

    expect(dispatchSpy).toHaveBeenCalledWith("jump", {
      detail: { start: 0, end: 3 }
    })
  })

  describe("on mobile", () => {
    beforeEach(() => {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(390)
      textarea.value = "one\ntwo one\nthree"
      controller.textareaRef = textarea
      controller.findInputTarget.value = "one"
      controller.findAll()
    })

    it("lists matches with line numbers and context", () => {
      const rows = controller.resultsTarget.querySelectorAll("button[data-index]")

      expect(controller.resultsTarget.classList.contains("hidden")).toBe(false)
      expect(rows).toHaveLength(2)
      expect(rows[1].textContent).toBe("2two one")
      expect(rows[1].querySelector(".bg-\\[var\\(--theme-selection\\)\\]").textContent).toBe("one")
    })

    it("moves through the list without jumping in the editor", () => {
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      controller.findNext()

      expect(dispatchSpy).not.toHaveBeenCalled()
      expect(controller.currentMatchIndex).toBe(1)
      expect(controller.resultsTarget.querySelector("[aria-current]").dataset.index).toBe("1")

      controller.findNext()
      expect(controller.currentMatchIndex).toBe(0)
      controller.findPrevious()
      expect(controller.currentMatchIndex).toBe(1)
    })

    it("jumps to a tapped match and closes", () => {
      controller.open({ textarea })
      const dispatchSpy = vi.spyOn(controller, "dispatch")
      const row = controller.resultsTarget.querySelectorAll("button[data-index]")[1]
      controller.selectResult({ target: row.lastChild })

      expect(dispatchSpy).toHaveBeenCalledWith("jump", { detail: { start: 8, end: 11 } })
      expect(controller.dialogTarget.open).toBe(false)
      expect(controller.resultsTarget.classList.contains("hidden")).toBe(true)
    })

    it("hides the list when nothing matches", () => {
      controller.findInputTarget.value = "missing"
      controller.findAll()

      expect(controller.resultsTarget.classList.contains("hidden")).toBe(true)
      expect(controller.resultsTarget.children).toHaveLength(0)
    })
  })

  it("does not list matches on desktop", () => {
    textarea.value = "one one"
    controller.textareaRef = textarea
    controller.findInputTarget.value = "one"
    controller.findAll()

    expect(controller.resultsTarget.classList.contains("hidden")).toBe(true)
  })

  it("dispatches replace with resolved regex groups", () => {
    textarea.value = "foo-bar"
    controller.textareaRef = textarea
    controller.findInputTarget.value = "(\\w+)-(\\w+)"
    controller.replaceInputTarget.value = "$2-$1"
    controller.useRegexValue = true
    controller.findAll()

    const dispatchSpy = vi.spyOn(controller, "dispatch")
    controller.replaceCurrent()

    expect(dispatchSpy).toHaveBeenCalledWith("replace", {
      detail: { start: 0, end: 7, replacement: "bar-foo" }
    })
  })

  it("dispatches replace-all with updated text", () => {
    textarea.value = "a a"
    controller.textareaRef = textarea
    controller.findInputTarget.value = "a"
    controller.replaceInputTarget.value = "b"
    controller.findAll()

    const dispatchSpy = vi.spyOn(controller, "dispatch")
    controller.replaceAll()

    expect(dispatchSpy).toHaveBeenCalledWith("replace-all", expect.objectContaining({
      detail: expect.objectContaining({ updatedText: "b b" })
    }))
  })

  it("shows visual feedback after replace all", () => {
    textarea.value = "a a a"
    controller.textareaRef = textarea
    controller.findInputTarget.value = "a"
    controller.replaceInputTarget.value = "b"
    controller.findAll()

    expect(controller.matches.length).toBe(3)

    controller.replaceAll()

    expect(controller.matchCountTarget.textContent).toBe("Replaced 3")
    expect(controller.matchCountTarget.classList.contains("text-green-500")).toBe(true)
  })

  it("clears replacement feedback after timeout", async () => {
    vi.useFakeTimers()

    textarea.value = "a a"
    controller.textareaRef = textarea
    controller.findInputTarget.value = "a"
    controller.replaceInputTarget.value = "b"
    controller.findAll()

    controller.replaceAll()

    expect(controller.matchCountTarget.textContent).toBe("Replaced 2")

    vi.advanceTimersByTime(2000)

    expect(controller.matchCountTarget.classList.contains("text-green-500")).toBe(false)

    vi.useRealTimers()
  })
})
