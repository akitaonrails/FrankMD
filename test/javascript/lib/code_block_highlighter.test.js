/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import { highlightCodeBlocks } from "../../../app/javascript/lib/code_block_highlighter"

describe("highlightCodeBlocks", () => {
  it("highlights JavaScript and TypeScript tokens", () => {
    const html = '<pre><code class="language-typescript">const x: number = 1; describe("suite", () => { expect(x).toBe(true); });\n</code></pre>'

    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-keyword">const</span>')
    expect(highlighted).toContain('<span class="tok-number">1</span>')
    expect(highlighted).toContain('<span class="tok-function">describe</span>')
    expect(highlighted).toContain('<span class="tok-function">expect</span>')
    expect(highlighted).toContain('<span class="tok-function">toBe</span>')
    expect(highlighted).toContain('<span class="tok-constant">true</span>')
    expect(highlighted).toContain('class="language-typescript"')
    expect(highlighted).toContain('data-code-language="TypeScript"')
  })

  it("highlights comments and object properties with distinct token roles", () => {
    const html = '<pre><code class="language-js">// explanation\nconst item = { name: "value" };\n</code></pre>'

    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment">// explanation</span>')
    expect(highlighted).toContain('<span class="tok-propertyName tok-definition">name</span>')
  })

  it("highlights Rust keywords, types, functions, strings, and numbers", () => {
    const html = '<pre><code class="language-rust">// entry point\nfn main() { let answer: i32 = 42; println!("hello"); }</code></pre>'

    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment">// entry point</span>')
    expect(highlighted).toContain('<span class="tok-keyword">fn</span>')
    expect(highlighted).toContain('<span class="tok-function tok-definition">main</span>')
    expect(highlighted).toContain('<span class="tok-typeName">i32</span>')
    expect(highlighted).toContain('<span class="tok-number">42</span>')
    expect(highlighted).toContain('<span class="tok-string">"hello"</span>')
    expect(highlighted).toContain('data-code-language="Rust"')
  })

  it("supports common aliases and the bundled HTML and CSS parsers", () => {
    const cases = [
      ['language-js', "const answer = 42;", "tok-keyword"],
      ['language-ts', "const answer: number = 42;", "tok-typeName"],
      ['language-jsx', '<Widget title="ok" />', "tok-typeName"],
      ['language-tsx', '<Widget count={42} />', "tok-typeName"],
      ['language-json', '{"answer": 42}', "tok-string"],
      ['language-jsonc', '{"answer": 42}', "tok-string"],
      ['language-html', "<section>text</section>", "tok-typeName"],
      ['language-css', "a { color: red; }", "tok-typeName"]
    ]

    for (const [languageClass, source, expectedClass] of cases) {
      const html = `<pre><code class="${languageClass}">${source.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code></pre>`
      expect(highlightCodeBlocks(html)).toContain(`class="${expectedClass}"`)
    }
  })

  it("maps HTML attributes and CSS values to their syntax roles", () => {
    const html = '<pre><code class="language-html">&lt;button title="ok"&gt;text&lt;/button&gt;</code></pre>'
    const css = '<pre><code class="language-css">a { color: red; margin: 1px; }</code></pre>'

    const highlightedHtml = highlightCodeBlocks(html)
    const highlightedCss = highlightCodeBlocks(css)

    expect(highlightedHtml).toContain('<span class="tok-propertyName">title</span>')
    expect(highlightedHtml).toContain('<span class="tok-string">"ok"</span>')
    expect(highlightedCss).toContain('<span class="tok-propertyName">color</span>')
    expect(highlightedCss).toContain('<span class="tok-constant">red</span>')
    expect(highlightedCss).toContain('<span class="tok-number">1px</span>')
  })

  it("leaves unsupported languages unchanged", () => {
    const html = '<pre><code class="language-python">print("hello")</code></pre>'

    expect(highlightCodeBlocks(html)).toBe(html)
  })

  it("keeps large supported fences readable without highlighting them", () => {
    const source = "const answer = 42;\n".repeat(1100)
    const html = `<pre><code class="language-javascript">${source}</code></pre>`

    const highlighted = highlightCodeBlocks(html)
    const template = document.createElement("template")
    template.innerHTML = highlighted
    const code = template.content.querySelector("code")

    expect(template.content.querySelector(".tok-keyword")).toBeNull()
    expect(code.textContent).toBe(source)
    expect(code.parentElement.dataset.codeLanguage).toBe("JavaScript")
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
