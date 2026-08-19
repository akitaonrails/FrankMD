/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest"
import { menuMaxHeight, clampMenuToViewport, toggleMenu } from "lib/menu_bounds"

function makeMenu(classes = "frankmd-menu hidden") {
  const menu = document.createElement("div")
  menu.className = classes
  menu.innerHTML = "<div style='height: 2000px'></div>"
  document.body.appendChild(menu)
  return menu
}

describe("menuMaxHeight", () => {
  it("bounds the menu to the remaining viewport below its top edge", () => {
    const rect = { top: 400 }
    expect(menuMaxHeight(rect, 900)).toBe(`${900 - 400 - 8}px`)
  })

  it("keeps a usable minimum when opened near the bottom", () => {
    const rect = { top: 890 }
    expect(menuMaxHeight(rect, 900)).toBe("96px")
  })

  it("honors a custom padding", () => {
    const rect = { top: 100 }
    expect(menuMaxHeight(rect, 900, 20)).toBe("780px")
  })
})

describe("clampMenuToViewport", () => {
  beforeEach(() => { document.body.innerHTML = "" })

  it("sets an inline max-height sized to the viewport", () => {
    const menu = makeMenu("frankmd-menu")
    menu.getBoundingClientRect = () => ({ top: 300, height: 40 })
    clampMenuToViewport(menu, 900)
    expect(menu.style.maxHeight).toBe("592px")
  })

  it("ignores missing menu elements", () => {
    expect(() => clampMenuToViewport(null, 900)).not.toThrow()
  })
})

describe("toggleMenu", () => {
  beforeEach(() => { document.body.innerHTML = "" })

  it("shows a hidden menu and applies the viewport clamp", () => {
    window.innerHeight = 900
    const menu = makeMenu()
    menu.getBoundingClientRect = () => ({ top: 500, height: 40 })
    const visible = toggleMenu(menu)
    expect(visible).toBe(true)
    expect(menu.classList.contains("hidden")).toBe(false)
    expect(menu.style.maxHeight).toBe(`${900 - 500 - 8}px`)
  })

  it("hides a visible menu", () => {
    const menu = makeMenu("frankmd-menu")
    const visible = toggleMenu(menu, true)
    expect(visible).toBe(false)
    expect(menu.classList.contains("hidden")).toBe(true)
  })
})
