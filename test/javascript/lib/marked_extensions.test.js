/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { wikilinkExtension } from "../../../app/javascript/lib/marked_extensions.js"

describe("wikilinkExtension", () => {
  describe("start()", () => {
    it("returns index of [[ in source", () => {
      expect(wikilinkExtension.start("hello [[world]]")).toBe(6)
    })

    it("returns -1 when no [[ found", () => {
      expect(wikilinkExtension.start("no wikilinks here")).toBe(-1)
    })
  })

  describe("tokenizer()", () => {
    it("matches simple wikilink [[Note Name]]", () => {
      const token = wikilinkExtension.tokenizer("[[My Note]] rest")
      expect(token).toBeDefined()
      expect(token.type).toBe("wikilink")
      expect(token.raw).toBe("[[My Note]]")
      expect(token.target).toBe("My Note")
      expect(token.displayText).toBeNull()
    })

    it("matches wikilink with display text [[Note|Display]]", () => {
      const token = wikilinkExtension.tokenizer("[[My Note|Custom Label]] rest")
      expect(token).toBeDefined()
      expect(token.target).toBe("My Note")
      expect(token.displayText).toBe("Custom Label")
    })

    it("matches wikilink with path [[folder/Note]]", () => {
      const token = wikilinkExtension.tokenizer("[[projects/My Note]] rest")
      expect(token).toBeDefined()
      expect(token.target).toBe("projects/My Note")
      expect(token.displayText).toBeNull()
    })

    it("trims whitespace from target and display text", () => {
      const token = wikilinkExtension.tokenizer("[[  My Note  |  Label  ]] rest")
      expect(token.target).toBe("My Note")
      expect(token.displayText).toBe("Label")
    })

    it("returns undefined for non-matching input", () => {
      expect(wikilinkExtension.tokenizer("not a wikilink")).toBeUndefined()
    })

    it("returns undefined for unclosed brackets", () => {
      expect(wikilinkExtension.tokenizer("[[unclosed")).toBeUndefined()
    })
  })

  describe("renderer()", () => {
    it("renders simple wikilink as anchor tag", () => {
      const html = wikilinkExtension.renderer({ target: "My Note", displayText: null })
      expect(html).toContain('class="wikilink"')
      expect(html).toContain('data-wikilink-path="My Note"')
      expect(html).toContain('data-action="click->app#openWikilink"')
      expect(html).toContain(">My Note</a>")
    })

    it("renders wikilink with custom display text", () => {
      const html = wikilinkExtension.renderer({ target: "My Note", displayText: "Click here" })
      expect(html).toContain('data-wikilink-path="My Note"')
      expect(html).toContain(">Click here</a>")
    })

    it("renders path-based wikilink showing only basename", () => {
      const html = wikilinkExtension.renderer({ target: "projects/My Note", displayText: null })
      expect(html).toContain('data-wikilink-path="projects/My Note"')
      expect(html).toContain(">My Note</a>")
    })

    it("escapes HTML in display text", () => {
      const html = wikilinkExtension.renderer({ target: "Note", displayText: "<script>alert(1)</script>" })
      expect(html).not.toContain("<script>")
      expect(html).toContain("&lt;script&gt;")
    })

    it("escapes quotes in target path", () => {
      const html = wikilinkExtension.renderer({ target: 'Note "with" quotes', displayText: null })
      expect(html).toContain("&quot;")
      expect(html).not.toContain('path="Note "with"')
    })
  })
})
