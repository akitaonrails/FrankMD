import { describe, it, expect } from "vitest"
import {
  escapeHtml,
  escapeHtmlString,
  fuzzyScore,
  levenshteinDistance,
  isSafeImageUrl
} from "../../app/javascript/lib/text_utils.js"

describe("escapeHtml", () => {
  it("escapes HTML and both quote types for attribute interpolation", () => {
    expect(escapeHtml('<img "quoted" \'single\'>')).toBe("&lt;img &quot;quoted&quot; &#39;single&#39;&gt;")
  })
})

describe("isSafeImageUrl", () => {
  it("accepts supported image URL schemes and rejects javascript URLs", () => {
    expect(isSafeImageUrl("http://example.com/image.png")).toBe(true)
    expect(isSafeImageUrl("https://example.com/image.png")).toBe(true)
    expect(isSafeImageUrl("data:image/png;base64,abc")).toBe(true)
    expect(isSafeImageUrl("blob:https://app.example/id")).toBe(true)
    expect(isSafeImageUrl("/images/preview/folder/a.jpg")).toBe(true)
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeImageUrl("//evil.example/a.jpg")).toBe(false)
    expect(isSafeImageUrl("/\\evil.example/a.jpg")).toBe(false)
    expect(isSafeImageUrl(" javascript:alert(1)")).toBe(false)
    expect(isSafeImageUrl("\n/images/preview/a.jpg")).toBe(false)
    expect(isSafeImageUrl("file:///tmp/image.png")).toBe(false)
  })
})

describe("escapeHtmlString", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtmlString("<script>alert('xss')</script>"))
      .toBe("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;")
  })

  it("escapes ampersands", () => {
    expect(escapeHtmlString("foo & bar")).toBe("foo &amp; bar")
  })

  it("escapes quotes", () => {
    expect(escapeHtmlString('He said "hello"')).toBe("He said &quot;hello&quot;")
  })

  it("handles empty string", () => {
    expect(escapeHtmlString("")).toBe("")
  })

  it("handles null/undefined", () => {
    expect(escapeHtmlString(null)).toBe("")
    expect(escapeHtmlString(undefined)).toBe("")
  })

  it("preserves normal text", () => {
    expect(escapeHtmlString("Hello World")).toBe("Hello World")
  })
})

describe("fuzzyScore", () => {
  it("returns 0 for no match", () => {
    expect(fuzzyScore("hello", "xyz")).toBe(0)
  })

  it("returns positive score for match", () => {
    expect(fuzzyScore("hello", "hel")).toBeGreaterThan(0)
  })

  it("gives higher score to consecutive matches", () => {
    const consecutiveScore = fuzzyScore("hello", "hel")
    const sparseScore = fuzzyScore("hello", "hlo")
    expect(consecutiveScore).toBeGreaterThan(sparseScore)
  })

  it("gives bonus for matching after separator", () => {
    // When matching starts at a separator boundary, it gets bonus points
    const withSeparator = fuzzyScore("src/button", "button")
    const withoutSeparator = fuzzyScore("srcxbutton", "button")
    expect(withSeparator).toBeGreaterThan(withoutSeparator)
  })

  it("gives bonus for matching at start", () => {
    const startScore = fuzzyScore("readme.md", "read")
    const midScore = fuzzyScore("unreadme.md", "read")
    expect(startScore).toBeGreaterThan(midScore)
  })

  it("prefers shorter strings with same match", () => {
    const shortScore = fuzzyScore("app.js", "app")
    const longScore = fuzzyScore("application.js", "app")
    expect(shortScore).toBeGreaterThan(longScore)
  })

  it("handles empty query", () => {
    // Empty query gives base length bonus: max(0, 10 - (5 - 0)) = 5
    expect(fuzzyScore("hello", "")).toBe(5)
  })
})

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0)
  })

  it("returns string length for empty comparison", () => {
    expect(levenshteinDistance("hello", "")).toBe(5)
    expect(levenshteinDistance("", "hello")).toBe(5)
  })

  it("counts single character difference", () => {
    expect(levenshteinDistance("hello", "hallo")).toBe(1)
  })

  it("counts insertion", () => {
    expect(levenshteinDistance("hello", "hellos")).toBe(1)
  })

  it("counts deletion", () => {
    expect(levenshteinDistance("hello", "helo")).toBe(1)
  })

  it("counts multiple changes", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3)
  })

  it("is symmetric", () => {
    expect(levenshteinDistance("abc", "def")).toBe(levenshteinDistance("def", "abc"))
  })

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0)
  })
})
