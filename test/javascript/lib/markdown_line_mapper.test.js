/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  parseWithLineNumbers,
  findElementByLine,
  findLineAtScroll
} from "../../../app/javascript/lib/markdown_line_mapper"

// Build a container with annotated elements at the given content-relative tops,
// mocking getBoundingClientRect so rects bake in an arbitrary page offset.
// This simulates a preview pane whose ancestors are not CSS-positioned
// (offsetParent === body) while the container sits far down the page.
function buildContainer(topsByLine, pageOffset) {
  const container = document.createElement("div")

  // Track scrollTop so the mocked element rects mirror real browser behavior:
  // the container's border box stays at pageOffset, while its content (and thus
  // the elements inside) moves up by scrollTop.
  let scrollTop = 0
  Object.defineProperty(container, "scrollTop", {
    get: () => scrollTop,
    set: (v) => { scrollTop = v },
    configurable: true
  })

  const baseRect = (top) => ({
    top, bottom: top + 20, height: 20, left: 0, right: 400, width: 400
  })
  container.getBoundingClientRect = () => baseRect(pageOffset)

  for (const [line, top] of Object.entries(topsByLine)) {
    const el = document.createElement("p")
    el.dataset.sourceLine = line
    el.getBoundingClientRect = () => baseRect(pageOffset + top - scrollTop)
    container.appendChild(el)
  }

  document.body.appendChild(container)
  return container
}

describe("parseWithLineNumbers", () => {
  it("annotates block elements with 1-based source lines", () => {
    const html = parseWithLineNumbers("# First\n\n# Second\n\n")
    expect(html).toContain('data-source-line="1"')
    expect(html).toContain('data-source-line="3"')
  })

  it("applies the frontmatter line offset to annotations", () => {
    // Frontmatter of 4 lines: body starts at source line 5
    const html = parseWithLineNumbers("# First\n\n# Second\n\n", 4)
    expect(html).toContain('data-source-line="5"')
    expect(html).toContain('data-source-line="7"')
  })

  it("returns empty string for empty input", () => {
    expect(parseWithLineNumbers("")).toBe("")
  })
})

describe("findElementByLine", () => {
  let container

  beforeEach(() => {
    container = buildContainer({ 1: 0, 5: 100, 10: 200 }, 0)
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("finds the closest annotated element for a line", () => {
    expect(findElementByLine(container, 5).dataset.sourceLine).toBe("5")
    expect(findElementByLine(container, 7).dataset.sourceLine).toBe("5")
    expect(findElementByLine(container, 1).dataset.sourceLine).toBe("1")
  })

  it("returns null when there are no annotations", () => {
    const plain = document.createElement("div")
    plain.innerHTML = "<p>no annotations</p>"
    expect(findElementByLine(plain, 1)).toBeNull()
  })
})

describe("findLineAtScroll", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("returns the line of the element at/above the scroll position", () => {
    const container = buildContainer({ 1: 0, 5: 100, 10: 200 }, 0)

    expect(findLineAtScroll(container, 150)).toBe(5)
    expect(findLineAtScroll(container, 0)).toBe(1)
    expect(findLineAtScroll(container, 999)).toBe(10)
  })

  it("is invariant to non-zero container page offset (preview -> editor direction)", () => {
    // Same content geometry, but the container sits 100000px down the page.
    // The old offsetTop-based implementation compared body-relative offsets
    // against container scrollTop and returned the wrong line here.
    const nearTop = buildContainer({ 1: 0, 5: 100, 10: 200 }, 0)
    const farDown = buildContainer({ 1: 0, 5: 100, 10: 200 }, 100000)

    expect(findLineAtScroll(farDown, 150)).toBe(findLineAtScroll(nearTop, 150))
    expect(findLineAtScroll(farDown, 150)).toBe(5)
  })

  it("accounts for the container's current scrollTop in rect math", () => {
    const container = buildContainer({ 1: 0, 5: 100, 10: 200 }, 100000)
    container.scrollTop = 100

    // Scrolled 100px into the content: element line 5 is now at the viewport top
    expect(findLineAtScroll(container, container.scrollTop)).toBe(5)
  })

  it("returns first element's line when scrolled above all elements", () => {
    const container = buildContainer({ 3: 50, 8: 150 }, 0)
    expect(findLineAtScroll(container, 10)).toBe(3)
  })

  it("returns null when there are no annotated elements", () => {
    const plain = document.createElement("div")
    plain.innerHTML = "<p>no annotations</p>"
    expect(findLineAtScroll(plain, 100)).toBeNull()
  })
})
