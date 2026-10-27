/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import FloatingDropdown from "../../../app/javascript/lib/floating_dropdown.js"

describe("floating dropdown", () => {
  let dropdown, button, menu, options

  beforeEach(() => {
    document.body.innerHTML = `<dialog open><button id="trigger">Theme</button>
      <div id="menu" class="hidden"><button>Light</button><button disabled>Unavailable</button>
        <button aria-checked="true">Dark</button><button>Nord</button></div></dialog><button id="outside">Outside</button>`
    button = document.getElementById("trigger")
    menu = document.getElementById("menu")
    options = menu.querySelectorAll("button")
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 })
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 })
    Object.defineProperty(menu, "scrollHeight", { configurable: true, value: 700 })
    button.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 200, right: 360 })
    menu.getBoundingClientRect = () => ({ top: 144, bottom: 464, width: 192, height: 320 })
    dropdown = new FloatingDropdown(menu, button)
  })

  afterEach(() => {
    dropdown.disconnect()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  function key(element, value) {
    const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event
  }

  it("opens at the selected option and navigates past disabled options", () => {
    expect(button.getAttribute("popovertarget")).toBe(menu.id)
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    button.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    dropdown.open()
    expect(document.activeElement).toBe(options[2])
    expect(button.getAttribute("aria-expanded")).toBe("true")
    key(options[2], "ArrowUp")
    expect(document.activeElement).toBe(options[0])
    key(options[0], "End")
    expect(document.activeElement).toBe(options[3])
    key(options[3], "Home")
    expect(document.activeElement).toBe(options[0])
    const escape = key(options[0], "Escape")
    expect(escape.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(button)
    expect(menu.classList.contains("hidden")).toBe(true)
    expect(document.querySelector("dialog").open).toBe(true)
  })

  it("bounds height and flips above a trigger near the viewport bottom", () => {
    button.getBoundingClientRect = () => ({ top: 550, bottom: 590, left: 350, right: 410 })
    dropdown.open()
    expect(menu.style.top).toBe("226px")
    expect(menu.style.left).toBe("200px")
    expect(menu.style.maxHeight).toBe("320px")
    expect(menu.style.maxWidth).toBe("384px")
  })

  it("fits a short viewport without forcing a minimum height", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 180 })
    button.getBoundingClientRect = () => ({ top: 70, bottom: 110, left: 8, right: 168 })
    menu.getBoundingClientRect = () => ({ top: 114, bottom: 172, width: 192, height: 58 })
    dropdown.open()
    expect(menu.style.maxHeight).toBe("58px")
    expect(menu.style.top).toBe("114px")
    expect(menu.style.left).toBe("8px")
  })

  it("dismisses when resizing puts the trigger outside the viewport", () => {
    dropdown.open()
    button.getBoundingClientRect = () => ({ top: 700, bottom: 740, left: 200, right: 360 })
    window.dispatchEvent(new Event("resize"))
    expect(dropdown.opened).toBe(false)
    expect(button.getAttribute("aria-expanded")).toBe("false")
  })

  it("keeps the focused option visible when resizing reduces menu height", () => {
    options[2].getBoundingClientRect = () => ({ top: 430, bottom: 464 })
    dropdown.open()
    expect(menu.scrollTop).toBe(0)
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 280 })
    menu.getBoundingClientRect = () => ({ top: 144, bottom: 272, width: 192, height: 128 })
    window.dispatchEvent(new Event("resize"))
    expect(menu.style.maxHeight).toBe("128px")
    expect(menu.scrollTop).toBe(192)
    expect(document.activeElement).toBe(options[2])
  })

  it("allows menu scrolling and dismisses on container scroll or focus leaving", () => {
    dropdown.open()
    menu.dispatchEvent(new Event("scroll"))
    expect(dropdown.opened).toBe(true)
    document.querySelector("dialog").dispatchEvent(new Event("scroll"))
    expect(dropdown.opened).toBe(true)
    button.getBoundingClientRect = () => ({ top: 60, bottom: 100, left: 200, right: 360 })
    document.querySelector("dialog").dispatchEvent(new Event("scroll"))
    expect(dropdown.opened).toBe(false)
    dropdown.open()
    document.getElementById("outside").focus()
    expect(dropdown.opened).toBe(false)
  })

  it("closes on Tab and restores the trigger before normal tab navigation", () => {
    key(button, "ArrowDown")
    expect(dropdown.opened).toBe(true)
    expect(Array.from(options).filter(option => !option.disabled).every(option => option.tabIndex === -1)).toBe(true)
    const tab = key(document.activeElement, "Tab")
    expect(dropdown.opened).toBe(false)
    expect(document.activeElement).toBe(button)
    expect(tab.defaultPrevented).toBe(false)
  })

  it("synchronizes native popover dismissal and closes when its dialog closes", () => {
    menu.showPopover = vi.fn()
    menu.hidePopover = vi.fn()
    dropdown.open()
    expect(menu.showPopover).toHaveBeenCalled()
    const dismissed = new Event("beforetoggle")
    Object.defineProperty(dismissed, "newState", { value: "closed" })
    menu.dispatchEvent(dismissed)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    dropdown.open()
    document.querySelector("dialog").dispatchEvent(new Event("close"))
    expect(menu.hidePopover).toHaveBeenCalled()
    expect(menu.classList.contains("hidden")).toBe(true)
  })

  it("closes another dropdown and removes listeners on disconnect", () => {
    dropdown.open()
    document.dispatchEvent(new CustomEvent("frankmd:dropdown-open", { detail: document.createElement("div") }))
    expect(dropdown.opened).toBe(false)
    dropdown.disconnect()
    key(button, "ArrowDown")
    expect(dropdown.opened).toBe(false)
  })
})
