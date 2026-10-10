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
import { parser as yamlParser } from "@lezer/yaml"
import { parser as rustParser } from "@lezer/rust"
import { parser as goParser } from "@lezer/go"
import { parser as pythonParser } from "@lezer/python"
import { parser as javaParser } from "@lezer/java"
import { parser as cppParser } from "@lezer/cpp"
import { csharp } from "@codemirror/legacy-modes/mode/clike"
import { ruby } from "@codemirror/legacy-modes/mode/ruby"
import { shell } from "@codemirror/legacy-modes/mode/shell"
import { standardSQL, pgSQL, mySQL, mariaDB, sqlite } from "@codemirror/legacy-modes/mode/sql"
import { terraformHcl } from "./terraform_hcl_stream_parser"

// Keep parser work and token DOM small enough for synchronous preview renders.
const MAX_HIGHLIGHTED_CODE_LENGTH = 20_000
const csharpParser = StreamLanguage.define(csharp).parser
const rubyParser = StreamLanguage.define(ruby).parser
const dotenvParser = StreamLanguage.define(shell).parser
const sqlParser = StreamLanguage.define(standardSQL).parser
const postgresParser = StreamLanguage.define(pgSQL).parser
const mysqlParser = StreamLanguage.define(mySQL).parser
const mariaDBParser = StreamLanguage.define(mariaDB).parser
const sqliteParser = StreamLanguage.define(sqlite).parser
const terraformParser = StreamLanguage.define(terraformHcl).parser

// Keep this list explicit: a fence language is untrusted note content, and
// only parsers that FrankMD already ships should be selected here.
const LANGUAGE_PARSERS = new Map([
  ["js", { parser: javascriptLanguage.parser, label: "JavaScript" }],
  ["javascript", { parser: javascriptLanguage.parser, label: "JavaScript" }],
  ["mjs", { parser: javascriptLanguage.parser, label: "JavaScript" }],
  ["cjs", { parser: javascriptLanguage.parser, label: "JavaScript" }],
  ["jsx", { parser: jsxLanguage.parser, label: "JSX" }],
  ["ts", { parser: typescriptLanguage.parser, label: "TypeScript" }],
  ["typescript", { parser: typescriptLanguage.parser, label: "TypeScript" }],
  ["tsx", { parser: tsxLanguage.parser, label: "TSX" }],
  ["html", { parser: htmlLanguage.parser, label: "HTML" }],
  ["htm", { parser: htmlLanguage.parser, label: "HTML" }],
  ["svg", { parser: htmlLanguage.parser, label: "SVG" }],
  ["css", { parser: cssLanguage.parser, label: "CSS" }],
  // JSON's syntax is close enough to JavaScript for useful token coloring;
  // it remains labelled as JSON in the rendered code element.
  ["json", { parser: javascriptLanguage.parser, label: "JSON" }],
  ["jsonc", { parser: javascriptLanguage.parser, label: "JSONC" }],
  ["yaml", { parser: yamlParser, label: "YAML" }],
  ["yml", { parser: yamlParser, label: "YAML" }],
  ["ruby", { parser: rubyParser, label: "Ruby" }],
  ["rb", { parser: rubyParser, label: "Ruby" }],
  ["rake", { parser: rubyParser, label: "Ruby" }],
  ["env", { parser: dotenvParser, label: "Dotenv" }],
  ["dotenv", { parser: dotenvParser, label: "Dotenv" }],
  ["shell", { parser: dotenvParser, label: "Shell" }],
  ["bash", { parser: dotenvParser, label: "Shell" }],
  ["sh", { parser: dotenvParser, label: "Shell" }],
  ["zsh", { parser: dotenvParser, label: "Shell" }],
  ["sql", { parser: sqlParser, label: "SQL" }],
  ["postgres", { parser: postgresParser, label: "PostgreSQL" }],
  ["postgresql", { parser: postgresParser, label: "PostgreSQL" }],
  ["pgsql", { parser: postgresParser, label: "PostgreSQL" }],
  ["mysql", { parser: mysqlParser, label: "MySQL" }],
  ["mariadb", { parser: mariaDBParser, label: "MariaDB" }],
  ["sqlite", { parser: sqliteParser, label: "SQLite" }],
  ["tf", { parser: terraformParser, label: "Terraform" }],
  ["tfvars", { parser: terraformParser, label: "Terraform" }],
  ["terraform", { parser: terraformParser, label: "Terraform" }],
  ["hcl", { parser: terraformParser, label: "HCL" }],
  ["rs", { parser: rustParser, label: "Rust" }],
  ["rust", { parser: rustParser, label: "Rust" }],
  ["go", { parser: goParser, label: "Go" }],
  ["golang", { parser: goParser, label: "Go" }],
  ["py", { parser: pythonParser, label: "Python" }],
  ["python", { parser: pythonParser, label: "Python" }],
  ["python3", { parser: pythonParser, label: "Python" }],
  ["java", { parser: javaParser, label: "Java" }],
  ["c", { parser: cppParser, label: "C" }],
  ["h", { parser: cppParser, label: "C" }],
  ["ino", { parser: cppParser, label: "C" }],
  ["cc", { parser: cppParser, label: "C++" }],
  ["cpp", { parser: cppParser, label: "C++" }],
  ["c++", { parser: cppParser, label: "C++" }],
  ["cxx", { parser: cppParser, label: "C++" }],
  ["hpp", { parser: cppParser, label: "C++" }],
  ["hh", { parser: cppParser, label: "C++" }],
  ["hxx", { parser: cppParser, label: "C++" }],
  ["cs", { parser: csharpParser, label: "C#" }],
  ["csharp", { parser: csharpParser, label: "C#" }],
  ["c#", { parser: csharpParser, label: "C#" }]
])

// Keep these token classes independent from individual theme colors. Lezer's
// modifier tags let functions and definitions stay distinct from identifiers.
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

function appendHighlightedCode(code, source, parser) {
  const tree = parser.parse(source)
  const document = code.ownerDocument
  const fragment = document.createDocumentFragment()
  let position = 0
  const highlighter = parser === yamlParser ? yamlHighlighter : syntaxHighlighter

  highlightTree(tree, highlighter, (from, to, classes) => {
    if (from > position) {
      fragment.append(document.createTextNode(source.slice(position, from)))
    }

    const span = document.createElement("span")
    // The classes come from the fixed tag mapping above, never from markdown
    // content.
    span.className = parser === yamlParser ? yamlScalarClasses(source, from, to, classes) : classes
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
 * Add token spans to sanitized Markdown code blocks for languages with bundled
 * parsers. The input must already have passed through sanitizeHtml().
 *
 * @param {string} sanitizedHtml - Sanitized rendered Markdown
 * @returns {string} - HTML with syntax-colored spans in supported code blocks
 */
export function highlightCodeBlocks(sanitizedHtml) {
  if (!sanitizedHtml || !globalThis.document?.createElement) return sanitizedHtml

  const template = document.createElement("template")
  template.innerHTML = sanitizedHtml
  let changed = false

  for (const code of template.content.querySelectorAll("pre > code[class]")) {
    const language = parserForCodeElement(code)
    if (!language) continue

    try {
      const source = code.textContent || ""

      // Large blocks remain readable and retain their language label, but skip
      // parsing and span creation so they cannot stall the preview thread.
      if (source.length > MAX_HIGHLIGHTED_CODE_LENGTH) {
        code.parentElement.dataset.codeLanguage = language.label
        changed = true
        continue
      }

      appendHighlightedCode(code, source, language.parser)
      code.parentElement.dataset.codeLanguage = language.label
      changed = true
    } catch {
      // A malformed or unsupported snippet must not prevent the rest of the
      // Markdown preview from rendering.
    }
  }

  // Avoid serializing unrelated preview HTML when no supported fence exists.
  return changed ? template.innerHTML : sanitizedHtml
}
