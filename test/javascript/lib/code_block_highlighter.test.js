/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import { highlightCodeBlocks } from "../../../app/javascript/lib/code_block_highlighter"

describe("highlightCodeBlocks", () => {
  it("highlights JavaScript and TypeScript tokens", () => {
    const html = '<pre><code class="language-typescript">const x: number = 1;\n</code></pre>'

    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-keyword">const</span>')
    expect(highlighted).toContain('<span class="tok-number">1</span>')
    expect(highlighted).toContain('class="language-typescript"')
    expect(highlighted).toContain('data-code-language="TypeScript"')
  })

  it("supports common aliases and the bundled HTML and CSS parsers", () => {
    const cases = [
      ['language-js', "const answer = 42;", "tok-keyword"],
      ['language-ts', "const answer: number = 42;", "tok-typeName"],
      ['language-json', '{"answer": 42}', "tok-string"],
      ['language-html', "<section>text</section>", "tok-typeName"],
      ['language-css', "a { color: red; }", "tok-typeName"]
    ]

    for (const [languageClass, source, expectedClass] of cases) {
      const html = `<pre><code class="${languageClass}">${source.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code></pre>`
      expect(highlightCodeBlocks(html)).toContain(`class="${expectedClass}"`)
    }
  })

  it("leaves unsupported languages unchanged", () => {
    const html = '<pre><code class="language-python">print("hello")</code></pre>'

    expect(highlightCodeBlocks(html)).toBe(html)
  })

  it("keeps code content as text instead of turning it into markup", () => {
    const html = '<pre><code class="language-javascript">&lt;img src=x onerror=alert(1)&gt;\n</code></pre>'

    const highlighted = highlightCodeBlocks(html)
    const template = document.createElement("template")
    template.innerHTML = highlighted

    expect(template.content.querySelector("img")).toBeNull()
    expect(template.content.querySelector("code").textContent).toContain("<img src=x onerror=alert(1)>")
  })
})
