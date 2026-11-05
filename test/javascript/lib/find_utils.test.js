import { describe, it, expect } from "vitest"
import {
  escapeRegexChars,
  findAllMatches,
  findClosestMatchIndex,
  matchLineContexts,
  replaceMatches,
  validateRegex
} from "../../../app/javascript/lib/find_utils.js"

describe("escapeRegexChars", () => {
  it("escapes regex special characters", () => {
    expect(escapeRegexChars("a+b*c?")).toBe("a\\+b\\*c\\?")
  })

  it("returns empty string for empty input", () => {
    expect(escapeRegexChars("")).toBe("")
  })
})

describe("findAllMatches", () => {
  it("returns empty array for empty search", () => {
    expect(findAllMatches("hello", "")).toEqual([])
  })

  it("finds literal matches", () => {
    const matches = findAllMatches("Hello hello", "hello")
    expect(matches.length).toBe(2)
    expect(matches[0].start).toBe(0)
  })

  it("respects case sensitivity", () => {
    const matches = findAllMatches("Hello hello", "hello", { caseSensitive: true })
    expect(matches.length).toBe(1)
    expect(matches[0].text).toBe("hello")
  })

  it("supports regex matches", () => {
    const matches = findAllMatches("cat cot cut", "c.t", { useRegex: true })
    expect(matches.length).toBe(3)
  })

  it("captures regex groups", () => {
    const matches = findAllMatches("abc123", "(abc)(\\d+)", { useRegex: true })
    expect(matches[0].groups).toEqual(["abc", "123"])
  })
})

describe("replaceMatches", () => {
  it("replaces literal matches", () => {
    const matches = findAllMatches("one two one", "one")
    const result = replaceMatches("one two one", matches, "1")
    expect(result).toBe("1 two 1")
  })

  it("replaces with regex groups", () => {
    const matches = findAllMatches("abc123", "(abc)(\\d+)", { useRegex: true })
    const result = replaceMatches("abc123", matches, "$2-$1", { useRegex: true })
    expect(result).toBe("123-abc")
  })
})

describe("findClosestMatchIndex", () => {
  const matches = findAllMatches("a b a b", "b")

  it("finds next match from position", () => {
    expect(findClosestMatchIndex(matches, 0, "next")).toBe(0)
  })

  it("wraps when reaching end", () => {
    expect(findClosestMatchIndex(matches, 10, "next")).toBe(0)
  })

  it("finds previous match from position", () => {
    expect(findClosestMatchIndex(matches, 5, "previous")).toBe(0)
  })

  it("wraps when going before start", () => {
    expect(findClosestMatchIndex(matches, 0, "previous")).toBe(1)
  })
})

describe("validateRegex", () => {
  it("returns valid for proper regex", () => {
    expect(validateRegex("abc").valid).toBe(true)
  })

  it("returns error for invalid regex", () => {
    const result = validateRegex("[")
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe("matchLineContexts", () => {
  it("returns line numbers and the text around each match", () => {
    const text = "alpha\nbeta alpha gamma\nalpha"
    const contexts = matchLineContexts(text, findAllMatches(text, "alpha"))

    expect(contexts).toEqual([
      { lineNumber: 1, before: "", match: "alpha", after: "" },
      { lineNumber: 2, before: "beta ", match: "alpha", after: " gamma" },
      { lineNumber: 3, before: "", match: "alpha", after: "" }
    ])
  })

  it("cuts multi-line matches at the end of their first line", () => {
    const text = "one\ntwo"
    const [context] = matchLineContexts(text, findAllMatches(text, "e\\nt", { useRegex: true }))

    expect(context).toEqual({ lineNumber: 1, before: "on", match: "e", after: "" })
  })

  it("trims long leading text", () => {
    const text = `${"x".repeat(50)} needle`
    const [context] = matchLineContexts(text, findAllMatches(text, "needle"), { maxLeading: 5 })

    expect(context.before).toBe("…xxxx ")
  })

  it("returns an empty list without matches", () => {
    expect(matchLineContexts("text", [])).toEqual([])
  })
})
