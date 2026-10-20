/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import HelpController from "../../../app/javascript/controllers/help_controller.js"

describe("HelpController", () => {
  let application, controller, element

  beforeEach(() => {
    document.body.innerHTML = `
      <div data-controller="help">
        <dialog data-help-target="helpDialog"></dialog>
      </div>
    `

    // Mock showModal and close for dialog
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.open = false
    })

    element = document.querySelector('[data-controller="help"]')
    application = Application.start()
    application.register("help", HelpController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(element, "help")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  describe("openHelp()", () => {
    it("shows the help dialog", () => {
      controller.openHelp()

      expect(controller.helpDialogTarget.showModal).toHaveBeenCalled()
    })
  })

  describe("closeHelp()", () => {
    it("closes the help dialog", () => {
      controller.openHelp()
      controller.closeHelp()

      expect(controller.helpDialogTarget.close).toHaveBeenCalled()
    })
  })

  describe("onKeydown()", () => {
    it("closes help dialog on Escape", () => {
      controller.openHelp()
      const event = { key: "Escape" }

      controller.onKeydown(event)

      expect(controller.helpDialogTarget.close).toHaveBeenCalled()
    })

    it("does nothing for other keys", () => {
      controller.openHelp()
      const closeSpy = vi.spyOn(controller.helpDialogTarget, "close")
      closeSpy.mockClear()

      const event = { key: "Enter" }
      controller.onKeydown(event)

      expect(closeSpy).not.toHaveBeenCalled()
    })
  })

  describe("setupDialogClickOutside()", () => {
    it("closes dialog when clicking on backdrop", () => {
      controller.openHelp()

      // Simulate click on the dialog element itself (backdrop)
      const clickEvent = new MouseEvent("click", { bubbles: true })
      Object.defineProperty(clickEvent, "target", { value: controller.helpDialogTarget })
      controller.helpDialogTarget.dispatchEvent(clickEvent)

      expect(controller.helpDialogTarget.close).toHaveBeenCalled()
    })
  })
})
