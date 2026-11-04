/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dismissDialog, installMobileBackdropDismiss, isBackdropClick } from "lib/dialog_backdrop"

function makeDialog() {
  const dialog = document.createElement("dialog")
  dialog.innerHTML = "<button>Inside</button>"
  dialog.setAttribute("open", "")
  dialog.close = vi.fn(() => dialog.removeAttribute("open"))
  dialog.getBoundingClientRect = () => ({ left: 50, right: 250, top: 100, bottom: 300 })
  document.body.append(dialog)
  return dialog
}

const click = (target, clientX, clientY) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY }))

describe("isBackdropClick", () => {
  let dialog
  beforeEach(() => { dialog = makeDialog() })
  afterEach(() => { document.body.innerHTML = "" })

  it("is true for a click on the dialog element outside its box", () => {
    expect(isBackdropClick(dialog, { target: dialog, clientX: 10, clientY: 10 })).toBe(true)
  })

  it("is false inside the dialog box, even on its padding", () => {
    expect(isBackdropClick(dialog, { target: dialog, clientX: 100, clientY: 150 })).toBe(false)
  })

  it("is false for clicks on dialog content or non-dialogs", () => {
    const button = dialog.querySelector("button")
    expect(isBackdropClick(dialog, { target: button, clientX: 10, clientY: 10 })).toBe(false)
    expect(isBackdropClick(document.body, { target: document.body, clientX: 10, clientY: 10 })).toBe(false)
  })

  it("is false for a closed dialog", () => {
    dialog.removeAttribute("open")
    expect(isBackdropClick(dialog, { target: dialog, clientX: 10, clientY: 10 })).toBe(false)
  })
})

describe("dismissDialog", () => {
  afterEach(() => { document.body.innerHTML = "" })

  it("dispatches cancel then closes", () => {
    const dialog = makeDialog()
    const onCancel = vi.fn()
    dialog.addEventListener("cancel", onCancel)
    dismissDialog(dialog)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(dialog.close).toHaveBeenCalledOnce()
  })

  it("keeps the dialog open when cancel is prevented", () => {
    const dialog = makeDialog()
    dialog.addEventListener("cancel", event => event.preventDefault())
    dismissDialog(dialog)
    expect(dialog.close).not.toHaveBeenCalled()
  })

  it("does not close twice when a cancel handler already closed it", () => {
    const dialog = makeDialog()
    dialog.addEventListener("cancel", () => dialog.removeAttribute("open"))
    dismissDialog(dialog)
    expect(dialog.close).not.toHaveBeenCalled()
  })
})

describe("installMobileBackdropDismiss", () => {
  let uninstall, dialog
  const originalWidth = window.innerWidth
  const setWidth = width => Object.defineProperty(window, "innerWidth", { configurable: true, value: width })

  beforeEach(() => {
    dialog = makeDialog()
    uninstall = installMobileBackdropDismiss()
  })
  afterEach(() => {
    uninstall()
    setWidth(originalWidth)
    document.body.innerHTML = ""
  })

  it("closes on a mobile backdrop tap", () => {
    setWidth(390)
    click(dialog, 10, 10)
    expect(dialog.close).toHaveBeenCalledOnce()
  })

  it("ignores taps inside the dialog", () => {
    setWidth(390)
    click(dialog.querySelector("button"), 100, 150)
    expect(dialog.close).not.toHaveBeenCalled()
  })

  it("leaves desktop behavior unchanged", () => {
    setWidth(1024)
    click(dialog, 10, 10)
    expect(dialog.close).not.toHaveBeenCalled()
  })

  it("stops listening once uninstalled", () => {
    setWidth(390)
    uninstall()
    click(dialog, 10, 10)
    expect(dialog.close).not.toHaveBeenCalled()
    uninstall = () => {}
  })
})
