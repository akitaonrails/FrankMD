/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import {
  calculateScrollRatio,
  calculateScrollForLine,
  calculateLineFromScroll,
  calculateSyncedScrollPosition,
  calculateScrollToCenterLine,
  scrollTopForElement,
  lineAtScroll
} from "../../../app/javascript/lib/scroll_utils"

describe("calculateScrollRatio", () => {
  it("returns 0 when at top", () => {
    expect(calculateScrollRatio(0, 1000, 200)).toBe(0)
  })

  it("returns 1 when at bottom", () => {
    // scrollTop = 800, scrollHeight = 1000, clientHeight = 200
    // maxScroll = 1000 - 200 = 800
    expect(calculateScrollRatio(800, 1000, 200)).toBe(1)
  })

  it("returns 0.5 when at middle", () => {
    expect(calculateScrollRatio(400, 1000, 200)).toBe(0.5)
  })

  it("clamps to 0-1 range", () => {
    expect(calculateScrollRatio(-100, 1000, 200)).toBe(0)
    expect(calculateScrollRatio(1000, 1000, 200)).toBe(1)
  })

  it("returns 0 when content fits in viewport", () => {
    expect(calculateScrollRatio(0, 200, 200)).toBe(0)
    expect(calculateScrollRatio(0, 100, 200)).toBe(0)
  })
})

describe("calculateScrollForLine", () => {
  it("returns 0 for line 1 with default offset", () => {
    // (1 - 1) * 20 - 500 * 0.35 = 0 - 175 = -175 -> 0
    expect(calculateScrollForLine(1, 20, 500)).toBe(0)
  })

  it("calculates scroll for middle line", () => {
    // Line 50, lineHeight 20, viewportHeight 500, offsetRatio 0.35
    // (50 - 1) * 20 - 500 * 0.35 = 980 - 175 = 805
    expect(calculateScrollForLine(50, 20, 500)).toBe(805)
  })

  it("uses custom offset ratio", () => {
    // Line 50, lineHeight 20, viewportHeight 500, offsetRatio 0.5
    // (50 - 1) * 20 - 500 * 0.5 = 980 - 250 = 730
    expect(calculateScrollForLine(50, 20, 500, 0.5)).toBe(730)
  })

  it("never returns negative", () => {
    expect(calculateScrollForLine(1, 20, 1000)).toBe(0)
    expect(calculateScrollForLine(2, 20, 1000)).toBe(0)
  })
})

describe("calculateLineFromScroll", () => {
  it("returns line at center of viewport when at top", () => {
    // scrollTop = 0, clientHeight = 200, scrollHeight = 2000, totalLines = 100
    // lineHeight = 2000 / 100 = 20
    // centerY = 0 + 100 = 100
    // centerLine = round(100 / 20) = 5
    expect(calculateLineFromScroll(0, 200, 2000, 100)).toBe(5)
  })

  it("returns middle line when scrolled to middle", () => {
    // scrollTop = 900, clientHeight = 200, scrollHeight = 2000, totalLines = 100
    // lineHeight = 2000 / 100 = 20
    // centerY = 900 + 100 = 1000
    // centerLine = round(1000 / 20) = 50
    expect(calculateLineFromScroll(900, 200, 2000, 100)).toBe(50)
  })

  it("returns last line when scrolled to bottom", () => {
    // scrollTop = 1800, clientHeight = 200, scrollHeight = 2000, totalLines = 100
    // lineHeight = 20
    // centerY = 1800 + 100 = 1900
    // centerLine = round(1900 / 20) = 95
    expect(calculateLineFromScroll(1800, 200, 2000, 100)).toBe(95)
  })

  it("clamps to valid range", () => {
    expect(calculateLineFromScroll(0, 200, 2000, 100)).toBeGreaterThanOrEqual(1)
    expect(calculateLineFromScroll(1800, 200, 2000, 100)).toBeLessThanOrEqual(100)
  })

  it("handles edge case of 0 lines", () => {
    expect(calculateLineFromScroll(0, 200, 200, 0)).toBe(1)
  })
})

describe("calculateSyncedScrollPosition", () => {
  it("returns 0 for ratio 0", () => {
    expect(calculateSyncedScrollPosition(0, 1000, 200)).toBe(0)
  })

  it("returns max scroll for ratio 1", () => {
    // maxScroll = 1000 - 200 = 800
    expect(calculateSyncedScrollPosition(1, 1000, 200)).toBe(800)
  })

  it("returns proportional scroll for ratio 0.5", () => {
    expect(calculateSyncedScrollPosition(0.5, 1000, 200)).toBe(400)
  })

  it("handles when content fits in viewport", () => {
    expect(calculateSyncedScrollPosition(0.5, 200, 200)).toBe(0)
    expect(calculateSyncedScrollPosition(0.5, 100, 200)).toBe(0)
  })
})

describe("calculateScrollToCenterLine", () => {
  it("returns 0 for first line", () => {
    expect(calculateScrollToCenterLine(1, 100, 2000, 200)).toBe(0)
  })

  it("returns max scroll for last line", () => {
    // maxScroll = 2000 - 200 = 1800
    expect(calculateScrollToCenterLine(100, 100, 2000, 200)).toBe(1800)
  })

  it("returns proportional scroll for middle line", () => {
    // lineRatio = (50 - 1) / (100 - 1) = 49/99 ≈ 0.495
    // maxScroll = 1800
    // result ≈ 891
    const result = calculateScrollToCenterLine(50, 100, 2000, 200)
    expect(result).toBeGreaterThan(800)
    expect(result).toBeLessThan(1000)
  })

  it("handles single line document", () => {
    expect(calculateScrollToCenterLine(1, 1, 200, 200)).toBe(0)
  })

  it("handles zero lines", () => {
    expect(calculateScrollToCenterLine(1, 0, 200, 200)).toBe(0)
  })
})

describe("scrollTopForElement", () => {
  it("computes element top relative to container content", () => {
    // Element 100px into the content, container scrolled 200px, container top at 50
    expect(scrollTopForElement({ top: 150 }, { top: 50 }, 200)).toBe(300)
  })

  it("is invariant to the container's page offset (editor -> preview direction)", () => {
    // Same geometry, but the whole container sits 5000px down the page
    const nearTop = scrollTopForElement({ top: 5150 }, { top: 5050 }, 200)
    expect(nearTop).toBe(300)
  })

  it("matches at a zero page offset", () => {
    expect(scrollTopForElement({ top: 150 }, { top: 50 }, 200))
      .toBe(scrollTopForElement({ top: 5150 }, { top: 5050 }, 200))
  })

  it("accounts for positive container scrollTop", () => {
    // Element above the current viewport: rect top above container top
    expect(scrollTopForElement({ top: -50 }, { top: 50 }, 100)).toBe(0)
  })
})

describe("lineAtScroll", () => {
  const entries = [
    { line: 1, top: 0 },
    { line: 5, top: 100 },
    { line: 10, top: 200 }
  ]

  it("returns first line at scroll top 0", () => {
    expect(lineAtScroll(entries, 0)).toBe(1)
  })

  it("returns the last entry at or above the scroll position", () => {
    expect(lineAtScroll(entries, 100)).toBe(5)
    expect(lineAtScroll(entries, 150)).toBe(5)
    expect(lineAtScroll(entries, 500)).toBe(10)
  })

  it("returns first entry's line when scrolled above all entries (preview -> editor direction)", () => {
    expect(lineAtScroll(entries, -10)).toBe(1)
  })

  it("keeps the earlier entry when tops tie (matches previous behavior)", () => {
    expect(lineAtScroll([{ line: 2, top: 50 }, { line: 7, top: 50 }], 60)).toBe(2)
  })

  it("returns null for empty entries", () => {
    expect(lineAtScroll([], 100)).toBeNull()
    expect(lineAtScroll(null, 100)).toBeNull()
  })
})
