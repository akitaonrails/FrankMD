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

  it("highlights YAML keys, comments, scalar values, and yml fences", () => {
    const yaml = '<pre><code class="language-yaml"># app settings\napp:\n  port: 3000\n  enabled: true\n  message: "ready"\n</code></pre>'
    const highlighted = highlightCodeBlocks(yaml)

    expect(highlighted).toContain('<span class="tok-comment"># app settings</span>')
    expect(highlighted).toContain('<span class="tok-propertyName tok-definition">app</span>')
    expect(highlighted).toContain('<span class="tok-number">3000</span>')
    expect(highlighted).toContain('<span class="tok-constant">true</span>')
    expect(highlighted).toContain('<span class="tok-string">"ready"</span>')
    expect(highlighted).toContain('data-code-language="YAML"')
    expect(highlightCodeBlocks('<pre><code class="language-yml">answer: 42</code></pre>')).toContain('data-code-language="YAML"')
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

  it("highlights Go keywords, functions, strings, and numbers", () => {
    const html = '<pre><code class="language-go">package main\n\nimport "fmt"\n\nfunc Greet(name string) string { return fmt.Sprintf("hello, %s", name) }\nconst answer = 42</code></pre>'

    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-keyword">package</span>')
    expect(highlighted).toContain('<span class="tok-keyword">func</span>')
    expect(highlighted).toContain('<span class="tok-function tok-definition">Greet</span>')
    expect(highlighted).toContain('<span class="tok-propertyName">Sprintf</span>')
    expect(highlighted).toContain('<span class="tok-string">"hello, %s"</span>')
    expect(highlighted).toContain('<span class="tok-number">42</span>')
    expect(highlighted).toContain('data-code-language="Go"')
    expect(highlightCodeBlocks('<pre><code class="language-golang">package main</code></pre>')).toContain('data-code-language="Go"')
  })

  it("highlights Python comments, keywords, functions, types, strings, and numbers", () => {
    const html = '<pre><code class="language-python"># greeting\ndef greet(name: str) -> str:\n    return f"hello {name}"\n\nanswer = 42</code></pre>'

    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment"># greeting</span>')
    expect(highlighted).toContain('<span class="tok-keyword">def</span>')
    expect(highlighted).toContain('<span class="tok-function tok-definition">greet</span>')
    expect(highlighted).toContain('<span class="tok-variableName">str</span>')
    expect(highlighted).toContain('class="tok-string"')
    expect(highlighted).toContain('<span class="tok-number">42</span>')
    expect(highlighted).toContain('data-code-language="Python"')
    expect(highlightCodeBlocks('<pre><code class="language-py">print(1)</code></pre>')).toContain('data-code-language="Python"')
  })

  it("highlights Java comments, keywords, definitions, types, strings, and numbers", () => {
    const html = '<pre><code class="language-java">// greeting\npublic class Greeter {\n  public static String greet(String name) {\n    int answer = 42;\n    return "Hello, " + name;\n  }\n}</code></pre>'

    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment">// greeting</span>')
    expect(highlighted).toContain('<span class="tok-keyword">class</span>')
    expect(highlighted).toContain('<span class="tok-variableName tok-definition">Greeter</span>')
    expect(highlighted).toContain('<span class="tok-variableName tok-definition">greet</span>')
    expect(highlighted).toContain('<span class="tok-string">"Hello, "</span>')
    expect(highlighted).toContain('<span class="tok-number">42</span>')
    expect(highlighted).toContain('data-code-language="Java"')
  })

  it("highlights Ruby comments, class names, method definitions, strings, and numbers", () => {
    const html = '<pre><code class="language-ruby"># greeting\nclass Greeter\n  def greet(name)\n    puts "hello #{name}"\n    42\n  end\nend</code></pre>'
    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment"># greeting</span>')
    expect(highlighted).toContain('<span class="tok-keyword">class</span>')
    expect(highlighted).toContain('<span class="tok-typeName">Greeter</span>')
    expect(highlighted).toContain('<span class="tok-keyword">def</span>')
    expect(highlighted).toContain('<span class="tok-variableName tok-definition">greet</span>')
    expect(highlighted).toContain('<span class="tok-string">"hello #{</span>')
    expect(highlighted).toContain('<span class="tok-number">42</span>')
    expect(highlighted).toContain('data-code-language="Ruby"')
    expect(highlightCodeBlocks('<pre><code class="language-rb">puts "hi"</code></pre>')).toContain('data-code-language="Ruby"')
  })

  it("highlights dotenv comments, variable assignments, strings, and numeric values", () => {
    const html = '<pre><code class="language-dotenv"># local settings\nDATABASE_URL="postgres://db/app"\nPORT=5432\nDEBUG=true\n</code></pre>'
    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment"># local settings</span>')
    expect(highlighted).toContain('<span class="tok-variableName tok-definition">DATABASE_URL</span>')
    expect(highlighted).toContain('<span class="tok-string">"postgres://db/app"</span>')
    expect(highlighted).toContain('<span class="tok-number">5432</span>')
    expect(highlighted).toContain('data-code-language="Dotenv"')
    expect(highlightCodeBlocks('<pre><code class="language-env">API_KEY=secret</code></pre>')).toContain('data-code-language="Dotenv"')
  })

  it("highlights common shell fences and aliases", () => {
    const html = '<pre><code class="language-bash"># clean temporary files\nfor file in "$@"; do\n  echo "$file"\ndone</code></pre>'
    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment"># clean temporary files</span>')
    expect(highlighted).toContain('<span class="tok-keyword">for</span>')
    expect(highlighted).toContain('<span class="tok-string">"</span>')
    expect(highlighted).toContain('<span class="tok-variableName tok-definition">$@</span>')
    expect(highlighted).toContain('<span class="tok-variableName">echo</span>')
    expect(highlighted).toContain('data-code-language="Shell"')
    expect(highlightCodeBlocks('<pre><code class="language-sh">printf ok</code></pre>')).toContain('data-code-language="Shell"')
  })

  it("highlights SQL comments, keywords, literals, operators, and dialect aliases", () => {
    const html = '<pre><code class="language-sql">-- active users\nSELECT id, name FROM users WHERE active = TRUE AND score >= 42;</code></pre>'
    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment">-- active users</span>')
    expect(highlighted).toContain('<span class="tok-keyword">SELECT</span>')
    expect(highlighted).toContain('<span class="tok-keyword">FROM</span>')
    expect(highlighted).toContain('<span class="tok-constant">TRUE</span>')
    expect(highlighted).toContain('<span class="tok-operator">&gt;=</span>')
    expect(highlighted).toContain('<span class="tok-number">42</span>')
    expect(highlighted).toContain('data-code-language="SQL"')
    expect(highlightCodeBlocks('<pre><code class="language-postgresql">SELECT 1</code></pre>')).toContain('data-code-language="PostgreSQL"')
    expect(highlightCodeBlocks('<pre><code class="language-mariadb">SELECT 1</code></pre>')).toContain('data-code-language="MariaDB"')
  })

  it("highlights TOML comments, sections, keys, strings, numbers, and aliases", () => {
    const html = '<pre><code class="language-toml"># server settings\n[server]\nhost = "localhost"\nport = 5432\nenabled = true</code></pre>'
    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment"># server settings</span>')
    expect(highlighted).toContain('<span class="tok-constant">[server]</span>')
    expect(highlighted).toContain('<span class="tok-propertyName">host</span>')
    expect(highlighted).toContain('<span class="tok-string">"localhost"</span>')
    expect(highlighted).toContain('<span class="tok-number">5432</span>')
    expect(highlighted).toContain('<span class="tok-constant">true</span>')
    expect(highlighted).toContain('data-code-language="TOML"')
  })

  it("highlights Terraform comments, block keywords, attributes, references, and expressions", () => {
    const html = '<pre><code class="language-tf"># infrastructure\nresource "aws_instance" "web" {\n  ami = "ami-123"\n  instance_type = var.instance_type\n  count = 2\n  enabled = true\n  size = max(1, 3)\n}</code></pre>'
    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment"># infrastructure</span>')
    expect(highlighted).toContain('<span class="tok-keyword">resource</span>')
    expect(highlighted).toContain('<span class="tok-propertyName">ami</span>')
    expect(highlighted).toContain('<span class="tok-string">"ami-123"</span>')
    expect(highlighted).toContain('<span class="tok-propertyName">instance_type</span>')
    expect(highlighted).toContain('<span class="tok-number">2</span>')
    expect(highlighted).toContain('<span class="tok-constant">true</span>')
    expect(highlighted).toContain('<span class="tok-function">max</span>')
    expect(highlighted).toContain('data-code-language="Terraform"')
    expect(highlightCodeBlocks('<pre><code class="language-hcl">value = 1</code></pre>')).toContain('data-code-language="HCL"')
  })

  it("highlights C and C++ tokens and common fence aliases", () => {
    const cpp = '<pre><code class="language-cpp">// entry point\nint main() { const int answer = 42; return answer; }</code></pre>'
    const highlightedCpp = highlightCodeBlocks(cpp)

    expect(highlightedCpp).toContain('<span class="tok-comment">// entry point</span>')
    expect(highlightedCpp).toContain('<span class="tok-function tok-definition">main</span>')
    expect(highlightedCpp).toContain('<span class="tok-number">42</span>')
    expect(highlightedCpp).toContain('<span class="tok-keyword">return</span>')
    expect(highlightedCpp).toContain('data-code-language="C++"')

    const highlightedC = highlightCodeBlocks('<pre><code class="language-c">int main() { return 0; }</code></pre>')
    expect(highlightedC).toContain('<span class="tok-number">0</span>')
    expect(highlightedC).toContain('data-code-language="C"')
  })

  it("highlights C# keywords, types, definitions, strings, and numbers", () => {
    const html = '<pre><code class="language-csharp">// greeting\nusing System;\npublic class Greeter {\n  public static string Greet(string name) {\n    const int answer = 42;\n    return "Hello, " + name;\n  }\n}</code></pre>'
    const highlighted = highlightCodeBlocks(html)

    expect(highlighted).toContain('<span class="tok-comment">// greeting</span>')
    expect(highlighted).toContain('<span class="tok-keyword">class</span>')
    expect(highlighted).toContain('<span class="tok-variableName tok-definition">Greeter</span>')
    expect(highlighted).toContain('<span class="tok-string">"Hello, "</span>')
    expect(highlighted).toContain('<span class="tok-number">42</span>')
    expect(highlighted).toContain('data-code-language="C#"')
    expect(highlightCodeBlocks('<pre><code class="language-cs">public class X {}</code></pre>')).toContain('data-code-language="C#"')
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
    const html = '<pre><code class="language-unrecognized">puts "hello"</code></pre>'

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
