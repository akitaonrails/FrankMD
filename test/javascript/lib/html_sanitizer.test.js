/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest"
import { sanitizeHtml } from "../../../app/javascript/lib/html_sanitizer.js"

describe("sanitizeHtml", () => {
  describe("strips script execution vectors", () => {
    it("removes script tags", () => {
      const out = sanitizeHtml("<p>hi</p><script>alert(1)</script>")
      expect(out).toContain("hi")
      expect(out).not.toContain("<script")
    })

    it("removes inline event handlers", () => {
      expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain("onerror")
      expect(sanitizeHtml('<div onclick="alert(1)">x</div>')).not.toContain("onclick")
      expect(sanitizeHtml('<svg onload="alert(1)"></svg>')).not.toContain("onload")
    })

    it("removes inline styles and style elements", () => {
      expect(sanitizeHtml('<p style="position:fixed">x</p>')).not.toContain("style=")
      expect(sanitizeHtml("<style>body { display: none }</style><p>x</p>")).not.toContain("<style")
    })

    it("removes javascript: URLs", () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:")
    })

    it("removes iframe srcdoc", () => {
      const out = sanitizeHtml('<iframe src="https://www.youtube.com/embed/a" srcdoc="<script>alert(1)</script>"></iframe>')
      expect(out).not.toContain("srcdoc")
    })
  })

  describe("keeps what the app itself renders", () => {
    it("keeps the YouTube embed the video dialog inserts", () => {
      const embed = '<div class="embed-container"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="t" frameborder="0" allow="autoplay" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>'
      const out = sanitizeHtml(embed)

      expect(out).toContain("https://www.youtube.com/embed/dQw4w9WgXcQ")
      expect(out).toContain("allowfullscreen")
    })

    it("keeps a local video embed", () => {
      const embed = '<video controls class="video-player"><source src="/notes/videos/a.mp4" type="video/mp4"></video>'
      const out = sanitizeHtml(embed)

      expect(out).toContain("<video")
      expect(out).toContain("a.mp4")
    })

    it("keeps data-source-line annotations used by scroll sync", () => {
      expect(sanitizeHtml('<p data-source-line="7">x</p>')).toContain('data-source-line="7"')
    })

    it("keeps wikilink attributes used by the app controller", () => {
      const link = '<a class="wikilink" data-wikilink-path="Note.md" data-action="click->app#openWikilink">Note</a>'
      const out = sanitizeHtml(link)

      expect(out).toContain('data-wikilink-path="Note.md"')
      expect(out).toContain("openWikilink")
    })

    it("keeps ordinary markdown output", () => {
      const html = '<h1>T</h1><pre><code class="language-js">const a = 1</code></pre><table><tr><td>c</td></tr></table>'
      const out = sanitizeHtml(html)

      expect(out).toContain("<h1>")
      expect(out).toContain("language-js")
      expect(out).toContain("<table")
    })
  })

  describe("iframe source allow-list", () => {
    it("drops an iframe from a host that is not allow-listed", () => {
      const out = sanitizeHtml('<iframe src="https://evil.example/x"></iframe>')
      expect(out).not.toContain("evil.example")
    })

    it("drops an http (non-https) iframe", () => {
      const out = sanitizeHtml('<iframe src="http://www.youtube.com/embed/a"></iframe>')
      expect(out).not.toContain("youtube.com")
    })

    it("drops an iframe with no src", () => {
      expect(sanitizeHtml("<iframe></iframe>")).not.toContain("<iframe")
    })

    it("allows youtube-nocookie and vimeo players", () => {
      expect(sanitizeHtml('<iframe src="https://www.youtube-nocookie.com/embed/a"></iframe>')).toContain("youtube-nocookie")
      expect(sanitizeHtml('<iframe src="https://player.vimeo.com/video/1"></iframe>')).toContain("player.vimeo.com")
    })

    it("defeats host-confusion tricks on the iframe allowlist", () => {
      // userinfo: the real host is evil.com
      expect(sanitizeHtml('<iframe src="https://www.youtube.com@evil.com/embed/a"></iframe>')).not.toContain("evil.com")
      // subdomain: youtube.com is only a label of evil.com
      expect(sanitizeHtml('<iframe src="https://www.youtube.com.evil.com/embed/a"></iframe>')).not.toContain("evil.com")
      // protocol-relative to an untrusted host
      expect(sanitizeHtml('<iframe src="//evil.com/embed/a"></iframe>')).not.toContain("evil.com")
    })
  })

  describe("strips interactive form controls (phishing/UI-redress)", () => {
    it("removes form and input tags but keeps their text content", () => {
      const out = sanitizeHtml('<form action="https://evil.com"><input name="p"><button>Go</button></form>')
      expect(out).not.toContain("<form")
      expect(out).not.toContain("<input")
      expect(out).not.toContain("<button")
    })
  })

  it("returns an empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("")
    expect(sanitizeHtml(null)).toBe("")
    expect(sanitizeHtml(undefined)).toBe("")
  })
})
