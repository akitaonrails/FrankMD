import { highlightTree, tagHighlighter, tags } from "@lezer/highlight"
import { StreamLanguage } from "@codemirror/language"
import {
  javascriptLanguage,
  jsxLanguage,
  tsxLanguage,
  typescriptLanguage
} from "@codemirror/lang-javascript"
import { htmlLanguage } from "@codemirror/lang-html"
import { cssLanguage } from "@codemirror/lang-css"

// Keep parsing, token DOM, and language-mode setup bounded during preview work.
const MAX_HIGHLIGHTED_CODE_LENGTH = 20_000
const MAX_HIGHLIGHTED_CODE_LENGTH_PER_RENDER = 50_000
const MAX_CODE_BLOCKS_PER_RENDER = 100

function staticLanguage(label, parser) {
  return { label, parser }
}

function cachedParserLoader(loadParser) {
  let parserPromise

  return () => {
    if (!parserPromise) {
      parserPromise = Promise.resolve()
        .then(loadParser)
        .catch((error) => {
          // Cache successful loads, but allow a transient failed request to retry.
          parserPromise = null
          throw error
        })
    }

    return parserPromise
  }
}

function lazyLanguage(label, loadParser) {
  return { label, loadParser }
}

function streamParserLoader(loadMode, modeName) {
  return cachedParserLoader(async () => {
    const mode = await loadMode()
    return StreamLanguage.define(mode[modeName]).parser
  })
}

const yamlParser = cachedParserLoader(async () => (await import("@lezer/yaml")).parser)
const phpParser = cachedParserLoader(async () => (await import("@lezer/php")).parser)
const rustParser = cachedParserLoader(async () => (await import("@lezer/rust")).parser)
const goParser = cachedParserLoader(async () => (await import("@lezer/go")).parser)
const pythonParser = cachedParserLoader(async () => (await import("@lezer/python")).parser)
const javaParser = cachedParserLoader(async () => (await import("@lezer/java")).parser)
const cppParser = cachedParserLoader(async () => (await import("@lezer/cpp")).parser)
const csharpParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/clike"),
  "csharp"
)
const kotlinParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/clike"),
  "kotlin"
)
const rubyParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/ruby"),
  "ruby"
)
const shellParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/shell"),
  "shell"
)
const standardSQLParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/sql"),
  "standardSQL"
)
const postgresParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/sql"),
  "pgSQL"
)
const mysqlParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/sql"),
  "mySQL"
)
const mariaDBParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/sql"),
  "mariaDB"
)
const sqliteParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/sql"),
  "sqlite"
)
const tomlParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/toml"),
  "toml"
)
const dockerfileParser = streamParserLoader(
  () => import("@codemirror/legacy-modes/mode/dockerfile"),
  "dockerFile"
)
const terraformParser = cachedParserLoader(async () => {
  const { terraformHcl } = await import("./terraform_hcl_stream_parser.js")
  return StreamLanguage.define(terraformHcl).parser
})

const javascript = staticLanguage("JavaScript", javascriptLanguage.parser)
const jsx = staticLanguage("JSX", jsxLanguage.parser)
const typescript = staticLanguage("TypeScript", typescriptLanguage.parser)
const tsx = staticLanguage("TSX", tsxLanguage.parser)
const html = staticLanguage("HTML", htmlLanguage.parser)
const svg = staticLanguage("SVG", htmlLanguage.parser)
const css = staticLanguage("CSS", cssLanguage.parser)
const json = staticLanguage("JSON", javascriptLanguage.parser)
const jsonc = staticLanguage("JSONC", javascriptLanguage.parser)
const yaml = lazyLanguage("YAML", yamlParser)
const php = lazyLanguage("PHP", phpParser)
const ruby = lazyLanguage("Ruby", rubyParser)
const dotenv = lazyLanguage("Dotenv", shellParser)
const shell = lazyLanguage("Shell", shellParser)
const sql = lazyLanguage("SQL", standardSQLParser)
const postgres = lazyLanguage("PostgreSQL", postgresParser)
const mysql = lazyLanguage("MySQL", mysqlParser)
const mariaDB = lazyLanguage("MariaDB", mariaDBParser)
const sqlite = lazyLanguage("SQLite", sqliteParser)
const toml = lazyLanguage("TOML", tomlParser)
const dockerfile = lazyLanguage("Dockerfile", dockerfileParser)
const terraform = lazyLanguage("Terraform", terraformParser)
const hcl = lazyLanguage("HCL", terraformParser)
const rust = lazyLanguage("Rust", rustParser)
const go = lazyLanguage("Go", goParser)
const python = lazyLanguage("Python", pythonParser)
const java = lazyLanguage("Java", javaParser)
const c = lazyLanguage("C", cppParser)
const cpp = lazyLanguage("C++", cppParser)
const csharp = lazyLanguage("C#", csharpParser)
const kotlin = lazyLanguage("Kotlin", kotlinParser)

// Keep this list explicit: fence names are untrusted note content, and only
// parsers that FrankMD ships should be selected here.
const LANGUAGE_PARSERS = new Map([
  ["js", javascript],
  ["javascript", javascript],
  ["mjs", javascript],
  ["cjs", javascript],
  ["jsx", jsx],
  ["ts", typescript],
  ["typescript", typescript],
  ["tsx", tsx],
  ["html", html],
  ["htm", html],
  ["svg", svg],
  ["css", css],
  ["json", json],
  ["jsonc", jsonc],
  ["yaml", yaml],
  ["yml", yaml],
  [".yaml", yaml],
  [".yml", yaml],
  ["php", php],
  ["phtml", php],
  ["ruby", ruby],
  ["rb", ruby],
  [".rb", ruby],
  ["rake", ruby],
  ["env", dotenv],
  [".env", dotenv],
  ["dotenv", dotenv],
  ["shell", shell],
  ["bash", shell],
  ["sh", shell],
  ["zsh", shell],
  ["sql", sql],
  ["postgres", postgres],
  ["postgresql", postgres],
  ["pgsql", postgres],
  ["mysql", mysql],
  ["mariadb", mariaDB],
  ["sqlite", sqlite],
  ["toml", toml],
  ["tml", toml],
  ["dockerfile", dockerfile],
  ["docker", dockerfile],
  ["tf", terraform],
  [".tf", terraform],
  ["tfvars", terraform],
  [".tfvars", terraform],
  ["terraform", terraform],
  ["hcl", hcl],
  [".hcl", hcl],
  ["rs", rust],
  ["rust", rust],
  ["go", go],
  ["golang", go],
  ["py", python],
  ["python", python],
  ["python3", python],
  ["java", java],
  ["c", c],
  ["h", c],
  ["ino", c],
  ["cc", cpp],
  ["cpp", cpp],
  ["c++", cpp],
  ["cxx", cpp],
  ["hpp", cpp],
  ["hh", cpp],
  ["hxx", cpp],
  ["cs", csharp],
  ["csharp", csharp],
  ["c#", csharp],
  ["kotlin", kotlin],
  ["kt", kotlin],
  ["kts", kotlin]
])

// Lezer's modifier tags keep functions and definitions distinct from names.
const syntaxTags = [
  { tag: tags.keyword, class: "tok-keyword" },
  { tag: tags.function(tags.variableName), class: "tok-function" },
  { tag: tags.function(tags.propertyName), class: "tok-function" },
  { tag: tags.definition(tags.function(tags.variableName)), class: "tok-function tok-definition" },
  { tag: tags.definition(tags.variableName), class: "tok-variableName tok-definition" },
  { tag: tags.definition(tags.propertyName), class: "tok-propertyName tok-definition" },
  { tag: tags.constant(tags.variableName), class: "tok-constant" },
  { tag: tags.typeName, class: "tok-typeName" },
  { tag: tags.className, class: "tok-className" },
  { tag: tags.namespace, class: "tok-namespace" },
  { tag: tags.tagName, class: "tok-typeName" },
  { tag: tags.propertyName, class: "tok-propertyName" },
  { tag: tags.variableName, class: "tok-variableName" },
  { tag: tags.string, class: "tok-string" },
  { tag: tags.attributeValue, class: "tok-string" },
  { tag: tags.regexp, class: "tok-string2" },
  { tag: tags.number, class: "tok-number" },
  { tag: tags.unit, class: "tok-number" },
  { tag: [tags.bool, tags.null, tags.atom], class: "tok-constant" },
  { tag: [tags.operator, tags.derefOperator], class: "tok-operator" },
  { tag: tags.punctuation, class: "tok-punctuation" },
  { tag: tags.comment, class: "tok-comment" },
  { tag: tags.invalid, class: "tok-invalid" }
]

const syntaxHighlighter = tagHighlighter(syntaxTags)
const yamlHighlighter = tagHighlighter([
  ...syntaxTags,
  // Lezer marks plain YAML scalars as content; make them visible as values.
  { tag: tags.content, class: "tok-string" }
])

function yamlScalarClasses(source, from, to, classes) {
  if (!classes.includes("tok-string")) return classes

  const token = source.slice(from, to).trim()
  if (!token || token.startsWith("\"") || token.startsWith("'") || token.startsWith("|") || token.startsWith(">")) {
    return classes
  }

  if (/^(?:true|false|null|~)$/i.test(token)) return "tok-constant"
  if (/^[+-]?(?:(?:0|[1-9][\d_]*)(?:\.[\d_]+)?(?:e[+-]?[\d_]+)?|0x[\da-f_]+|0o[0-7_]+|0b[01_]+)$/i.test(token)) {
    return "tok-number"
  }

  return classes
}

function parserForCodeElement(code) {
  for (const className of code.classList) {
    if (!className.startsWith("language-")) continue

    const language = className.slice("language-".length).toLowerCase()
    return LANGUAGE_PARSERS.get(language) || null
  }

  return null
}

function appendHighlightedCode(code, source, parser, language) {
  const tree = parser.parse(source)
  const document = code.ownerDocument
  const fragment = document.createDocumentFragment()
  let position = 0
  const isYaml = language === yaml
  const highlighter = isYaml ? yamlHighlighter : syntaxHighlighter

  highlightTree(tree, highlighter, (from, to, classes) => {
    if (from > position) {
      fragment.append(document.createTextNode(source.slice(position, from)))
    }

    const span = document.createElement("span")
    // Classes come from the fixed tag map above, never from Markdown content.
    span.className = isYaml ? yamlScalarClasses(source, from, to, classes) : classes
    span.textContent = source.slice(from, to)
    fragment.append(span)
    position = to
  })

  if (position < source.length) {
    fragment.append(document.createTextNode(source.slice(position)))
  }

  code.replaceChildren(fragment)
}

/**
 * Highlight supported code elements in sanitized preview HTML. Less common
 * parser modules are imported only when a matching fence is present.
 *
 * @param {ParentNode} root - A sanitized rendered Markdown root
 * @returns {Promise<boolean>} - Whether labels or token spans were added
 */
export async function highlightCodeBlocksInElement(root) {
  if (!root?.querySelectorAll) return false

  const candidates = []
  let remainingCodeLength = MAX_HIGHLIGHTED_CODE_LENGTH_PER_RENDER
  let inspectedBlockCount = 0
  let changed = false

  for (const code of root.querySelectorAll("pre > code[class]")) {
    if (inspectedBlockCount >= MAX_CODE_BLOCKS_PER_RENDER) break
    inspectedBlockCount += 1

    const language = parserForCodeElement(code)
    if (!language || !code.parentElement) continue

    if (code.parentElement.dataset.codeLanguage !== language.label) {
      code.parentElement.dataset.codeLanguage = language.label
      changed = true
    }

    if (remainingCodeLength <= 0) continue

    const source = code.textContent || ""
    if (source.length > MAX_HIGHLIGHTED_CODE_LENGTH || source.length > remainingCodeLength) continue

    remainingCodeLength -= source.length
    candidates.push({ code, source, language })
  }

  const lazyLanguages = new Set(candidates.map(({ language }) => language).filter((language) => !language.parser))
  const loadedParsers = new Map()

  const applyHighlighting = (getParser) => {
    for (const { code, source, language } of candidates) {
      // A newer preview render may have replaced this block while a parser loaded.
      if (!root.contains(code)) continue

      const parser = getParser(language)
      if (!parser) continue

      try {
        appendHighlightedCode(code, source, parser, language)
        changed = true
      } catch {
        // A malformed snippet must not prevent the rest of the preview rendering.
      }
    }
  }

  // Highlight common languages before waiting for uncommon parser imports.
  applyHighlighting((language) => language.parser)

  if (lazyLanguages.size > 0) {
    await Promise.all([...lazyLanguages].map(async (language) => {
      try {
        loadedParsers.set(language, await language.loadParser())
      } catch {
        // A missing or offline parser leaves readable, unhighlighted source.
        loadedParsers.set(language, null)
      }
    }))
  }

  applyHighlighting((language) => loadedParsers.get(language))

  return changed
}

/**
 * Add token spans to sanitized Markdown code blocks.
 *
 * @param {string} sanitizedHtml - Sanitized rendered Markdown
 * @returns {Promise<string>} - HTML with syntax-colored spans in supported blocks
 */
export async function highlightCodeBlocks(sanitizedHtml) {
  if (!sanitizedHtml || !globalThis.document?.createElement) return sanitizedHtml

  const template = document.createElement("template")
  template.innerHTML = sanitizedHtml

  const changed = await highlightCodeBlocksInElement(template.content)
  return changed ? template.innerHTML : sanitizedHtml
}
