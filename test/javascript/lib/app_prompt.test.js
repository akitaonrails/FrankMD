/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appAlert, appConfirm } from "../../../app/javascript/lib/app_prompt.js"

describe("app prompts", () => {
  beforeEach(() => {
    window.t = vi.fn((key) => ({
      "common.alert": "Notice",
      "common.confirm": "Confirm",
      "common.ok": "OK",
      "common.cancel": "Cancel",
      "common.delete": "Delete"
    })[key] || key)
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.open = true
    })
  })

  afterEach(() => {
    document.body.replaceChildren()
    delete window.t
    vi.restoreAllMocks()
  })

  it("shows a localized, app-styled alert and resolves when acknowledged", async () => {
    const result = appAlert("Something went wrong")
    const dialog = document.querySelector("dialog")

    expect(dialog.getAttribute("role")).toBe("alertdialog")
    expect(dialog.className).toContain("bg-[var(--theme-bg-secondary)]")
    expect(dialog.textContent).toContain("Notice")
    expect(dialog.textContent).toContain("Something went wrong")
    expect(dialog.querySelector("button").textContent).toBe("OK")

    dialog.querySelector("button").click()

    await expect(result).resolves.toBeUndefined()
    expect(document.querySelector("dialog")).toBeNull()
  })

  it("uses localized destructive actions for confirmations", async () => {
    const result = appConfirm("Delete this file?", {
      acceptLabel: window.t("common.delete"),
      destructive: true
    })
    const dialog = document.querySelector("dialog")
    const buttons = dialog.querySelectorAll("button")

    expect([...buttons].map((button) => button.textContent)).toEqual(["Cancel", "Delete"])
    expect(buttons[1].className).toContain("bg-[var(--theme-error)]")

    buttons[1].click()

    await expect(result).resolves.toBe(true)
  })

  it("resolves false when a confirmation is cancelled", async () => {
    const result = appConfirm("Continue?")
    const dialog = document.querySelector("dialog")
    const cancel = new Event("cancel", { cancelable: true })

    dialog.dispatchEvent(cancel)

    await expect(result).resolves.toBe(false)
    expect(cancel.defaultPrevented).toBe(true)
  })

  it("queues prompts so only one is modal at a time", async () => {
    const firstResult = appAlert("First")
    const secondResult = appAlert("Second")

    expect(document.querySelectorAll("dialog")).toHaveLength(1)
    document.querySelector("dialog button").click()
    await expect(firstResult).resolves.toBeUndefined()

    await Promise.resolve()
    expect(document.querySelectorAll("dialog")).toHaveLength(1)
    expect(document.querySelector("dialog").textContent).toContain("Second")
    document.querySelector("dialog button").click()
    await expect(secondResult).resolves.toBeUndefined()
  })
})
