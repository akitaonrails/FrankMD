import { describe, it, expect } from "vitest"
import { defaultS3Prefix, defaultS3Key } from "../../../app/javascript/lib/s3_key.js"

describe("s3_key helpers", () => {
  // Fixed date so the assertions don't drift: 2026-07-09 (single-digit month/day
  // to prove zero-padding).
  const date = new Date(2026, 6, 9)

  it("defaultS3Prefix builds frankmd/YYYY/MM with a zero-padded month", () => {
    expect(defaultS3Prefix(date)).toBe("frankmd/2026/07")
  })

  it("defaultS3Key appends the filename to the prefix", () => {
    expect(defaultS3Key("photo.png", date)).toBe("frankmd/2026/07/photo.png")
  })

  it("defaults to the current date when none is given", () => {
    expect(defaultS3Prefix()).toMatch(/^frankmd\/\d{4}\/\d{2}$/)
    expect(defaultS3Key("a.png")).toMatch(/^frankmd\/\d{4}\/\d{2}\/a\.png$/)
  })
})
