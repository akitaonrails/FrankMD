import { describe, it, expect } from "vitest"
import {
  slugify,
  hugoDatePath,
  isValidNoteName,
  canCreateNote,
  previewNotePath
} from "../../../app/javascript/lib/new_note_utils.js"

describe("new_note_utils", () => {
  // Fixed date so assertions don't drift: 2026-08-18 (single-digit month/day
  // would be July 9 — use both single-digit cases below via explicit dates).
  const date = new Date(2026, 7, 18)

  describe("slugify", () => {
    it("lowercases and hyphenates spaces", () => {
      expect(slugify("My First Post")).toBe("my-first-post")
    })

    it("collapses runs of non-alphanumeric characters into one hyphen", () => {
      expect(slugify("Hello, World! (v2)")).toBe("hello-world-v2")
    })

    it("strips leading and trailing hyphens", () => {
      expect(slugify("--hello--")).toBe("hello")
    })

    it("maps accented characters to ASCII (matching HugoService)", () => {
      expect(slugify("Olá, você está bem?")).toBe("ola-voce-esta-bem")
      expect(slugify("Grüße aus München")).toBe("grusse-aus-munchen")
    })

    it("returns an empty string when nothing survives", () => {
      expect(slugify("???")).toBe("")
      expect(slugify("")).toBe("")
    })

    it("strips a trailing .md before slugifying is handled by caller", () => {
      // slugify itself does not know about extensions
      expect(slugify("my-post.md")).toBe("my-post-md")
    })
  })

  describe("hugoDatePath", () => {
    it("formats YYYY/MM/DD with zero-padding", () => {
      expect(hugoDatePath(new Date(2026, 7, 18))).toBe("2026/08/18")
      expect(hugoDatePath(new Date(2026, 0, 3))).toBe("2026/01/03")
    })

    it("defaults to the current date when none is given", () => {
      expect(hugoDatePath()).toMatch(/^\d{4}\/\d{2}\/\d{2}$/)
    })
  })

  describe("isValidNoteName", () => {
    it("accepts a plain name", () => {
      expect(isValidNoteName("my-note")).toBe(true)
      expect(isValidNoteName("my note.md")).toBe(true)
    })

    it("rejects empty or whitespace-only names", () => {
      expect(isValidNoteName("")).toBe(false)
      expect(isValidNoteName("   ")).toBe(false)
      expect(isValidNoteName(null)).toBe(false)
    })

    it("rejects names containing slashes", () => {
      expect(isValidNoteName("nested/path")).toBe(false)
      expect(isValidNoteName("/absolute")).toBe(false)
      expect(isValidNoteName("trailing/")).toBe(false)
    })

    it("rejects dot-only names", () => {
      expect(isValidNoteName(".")).toBe(false)
      expect(isValidNoteName("..")).toBe(false)
    })
  })

  describe("canCreateNote", () => {
    it("allows valid names for the empty template", () => {
      expect(canCreateNote("my note", "empty")).toBe(true)
    })

    it("blocks invalid names", () => {
      expect(canCreateNote("", "empty")).toBe(false)
      expect(canCreateNote("a/b", "empty")).toBe(false)
    })

    it("blocks hugo names whose slug would be empty", () => {
      expect(canCreateNote("!!!", "hugo")).toBe(false)
    })

    it("allows hugo names that slugify to something", () => {
      expect(canCreateNote("My Post.md", "hugo")).toBe(true)
    })
  })

  describe("previewNotePath", () => {
    it("previews an empty-document note at the root", () => {
      const result = previewNotePath({ name: "my-note", template: "empty", date })
      expect(result).toEqual({ valid: true, empty: false, path: "root/my-note.md" })
    })

    it("appends .md only once", () => {
      const result = previewNotePath({ name: "note.md", template: "empty", date })
      expect(result.path).toBe("root/note.md")
    })

    it("shows the parent folder when one is set", () => {
      const result = previewNotePath({ name: "my-note", parent: "docs/guides", template: "empty", date })
      expect(result.path).toBe("docs/guides/my-note.md")
    })

    it("previews a dated hugo page bundle for today", () => {
      const result = previewNotePath({ name: "My Post", template: "hugo", date })
      expect(result.path).toBe("root/2026/08/18/my-post/index.md")
      expect(result.valid).toBe(true)
    })

    it("slugifies and strips .md for hugo previews", () => {
      const result = previewNotePath({ name: "Olá Mundo.md", template: "hugo", date })
      expect(result.path).toBe("root/2026/08/18/ola-mundo/index.md")
    })

    it("previews hugo posts inside a parent folder", () => {
      const result = previewNotePath({ name: "My Post", parent: "blog", template: "hugo", date })
      expect(result.path).toBe("blog/2026/08/18/my-post/index.md")
    })

    it("uses the localized root segment", () => {
      const result = previewNotePath({ name: "x", template: "empty", date, rootSegment: "raiz" })
      expect(result.path).toBe("raiz/x.md")
    })

    it("shows the placeholder slot and flags empty while the name is blank", () => {
      const result = previewNotePath({ name: "", template: "empty", date, namePlaceholder: "nome-da-nota" })
      expect(result).toEqual({ valid: false, empty: true, path: "root/nome-da-nota.md" })
    })

    it("flags slash-containing names as invalid but still shows the typed path", () => {
      const result = previewNotePath({ name: "a/b", template: "empty", date })
      expect(result.valid).toBe(false)
      expect(result.empty).toBe(false)
      expect(result.path).toBe("root/a/b.md")
    })

    it("flags hugo names with empty slugs as invalid", () => {
      const result = previewNotePath({ name: "!!!", template: "hugo", date })
      expect(result.valid).toBe(false)
      expect(result.empty).toBe(false)
      expect(result.path).toBe("root/2026/08/18/!!!/index.md")
    })

    it("uses the placeholder slot for a blank hugo name", () => {
      const result = previewNotePath({ name: "  ", template: "hugo", date, namePlaceholder: "note-name" })
      expect(result.empty).toBe(true)
      expect(result.path).toBe("root/2026/08/18/note-name/index.md")
    })

    it("trims whitespace from the name", () => {
      const result = previewNotePath({ name: "  my-note  ", template: "empty", date })
      expect(result.path).toBe("root/my-note.md")
    })
  })
})
