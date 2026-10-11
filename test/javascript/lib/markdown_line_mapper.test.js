/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  parseWithLineNumbers,
  findElementByLine,
  findLineAtScroll
} from "../../../app/javascript/lib/markdown_line_mapper"
import { highlightCodeBlocks } from "../../../app/javascript/lib/code_block_highlighter"
import { marked } from "marked"

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

  it("highlights supported fenced code without losing its source line", async () => {
    const markdown = "```typescript\nconst x: number = 1;\n```"
    const lexer = vi.spyOn(marked, "lexer").mockReturnValue([
      { type: "code", raw: markdown }
    ])
    const parse = vi.spyOn(marked, "parse").mockReturnValue(
      '<pre><code class="language-typescript">const x: number = 1;\n</code></pre>\n'
    )

    try {
      const html = await highlightCodeBlocks(parseWithLineNumbers(markdown))

      expect(html).toMatch(/<pre[^>]*data-source-line="1"[^>]*>/)
      expect(html).toContain('<span class="tok-keyword">const</span>')
      expect(html).toContain('<span class="tok-number">1</span>')
      expect(html).toContain('class="language-typescript"')
    } finally {
      lexer.mockRestore()
      parse.mockRestore()
    }
  })

  it("annotates display math blocks so following preview lines stay aligned", () => {
    const markdown = "Before\n\n$$\nx + y\n$$\n\nAfter"
    const lexer = vi.spyOn(marked, "lexer").mockReturnValue([
      { type: "paragraph", raw: "Before\n\n" },
      { type: "mathBlock", raw: "$$\nx + y\n$$\n\n" },
      { type: "paragraph", raw: "After" }
    ])
    const parse = vi.spyOn(marked, "parse").mockReturnValue(
      '<p>Before</p>\n<div class="math-block">x + y</div>\n<p>After</p>'
    )

    try {
      const html = parseWithLineNumbers(markdown)

      expect(html).toMatch(/<div[^>]*data-source-line="3"[^>]*class="math-block"/)
      expect(html).toMatch(/<p[^>]*data-source-line="7">After<\/p>/)
    } finally {
      lexer.mockRestore()
      parse.mockRestore()
    }
  })

  describe("per-item list annotation (#203)", () => {
    const renderTaskList = (markdown) => {
      const lexer = vi.spyOn(marked, "lexer").mockImplementation(() => {
        // Hand-built token tree matching real marked's list shape for
        // "- [ ] a\n- plain\n- parent\n  - [x] child\n"
        const raw = markdown.replace(/^# Intro\n\n/, "")
        return [
          { type: "paragraph", raw: "# Intro\n\n" },
          {
            type: "list",
            raw,
            items: [
              { type: "list_item", raw: "- [ ] a\n", tokens: [] },
              { type: "list_item", raw: "- plain\n", tokens: [] },
              {
                type: "list_item",
                raw: "- parent\n  - [x] child\n",
                tokens: [
                  {
                    type: "list",
                    raw: "  - [x] child\n",
                    items: [{ type: "list_item", raw: "  - [x] child\n", tokens: [] }]
                  }
                ]
              }
            ]
          }
        ]
      })
      const parse = vi.spyOn(marked, "parse").mockReturnValue(
        '<h1>Intro</h1>\n' +
        "<ul>\n" +
        '<li><input disabled="" type="checkbox"> a</li>\n' +
        "<li>plain</li>\n" +
        '<li>parent<ul>\n<li><input checked="" disabled="" type="checkbox"> child</li>\n</ul>\n</li>\n' +
        "</ul>\n"
      )

      try {
        return parseWithLineNumbers(markdown)
      } finally {
        lexer.mockRestore()
        parse.mockRestore()
      }
    }

    it("annotates each li with its own source line, including nested items", () => {
      const html = renderTaskList("# Intro\n\n- [ ] a\n- plain\n- parent\n  - [x] child\n")

      // Items live on lines 3, 4, 5 and the nested child on line 6
      expect(html).toMatch(/<li data-source-line="3"[^>]*><input[^>]*type="checkbox"/)
      expect(html).toMatch(/<li data-source-line="4">plain<\/li>/)
      expect(html).toMatch(/<li data-source-line="5"[^>]*>parent<ul>/)
      expect(html).toMatch(/<li data-source-line="6"[^>]*><input[^>]*checked/)
    })

    it("shifts li lines by the frontmatter offset", () => {
      const markdown = "- [ ] a\n- plain\n- parent\n  - [x] child\n"
      const lexer = vi.spyOn(marked, "lexer").mockReturnValue([
        {
          type: "list",
          raw: markdown,
          items: [
            { type: "list_item", raw: "- [ ] a\n", tokens: [] },
            { type: "list_item", raw: "- plain\n", tokens: [] },
            {
              type: "list_item",
              raw: "- parent\n  - [x] child\n",
              tokens: [
                {
                  type: "list",
                  raw: "  - [x] child\n",
                  items: [{ type: "list_item", raw: "  - [x] child\n", tokens: [] }]
                }
              ]
            }
          ]
        }
      ])
      const parse = vi.spyOn(marked, "parse").mockReturnValue(
        "<ul>\n" +
        '<li><input disabled="" type="checkbox"> a</li>\n' +
        "<li>plain</li>\n" +
        '<li>parent<ul>\n<li><input checked="" disabled="" type="checkbox"> child</li>\n</ul>\n</li>\n' +
        "</ul>\n"
      )

      try {
        // Frontmatter of 3 stripped lines: body starts at source line 4
        const html = parseWithLineNumbers(markdown, 3)

        expect(html).toMatch(/<li data-source-line="4"/)
        expect(html).toMatch(/<li data-source-line="5">plain/)
        expect(html).toMatch(/<li data-source-line="6"/)
        expect(html).toMatch(/<li data-source-line="7"/)
      } finally {
        lexer.mockRestore()
        parse.mockRestore()
      }
    })
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
