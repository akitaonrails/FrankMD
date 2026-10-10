# Pin npm packages by running ./bin/importmap

enable_integrity!

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin_all_from "app/javascript/lib", under: "lib"

# Markdown parsing
pin "marked", to: "marked.js" # @15.0.6 - vendored from esm.sh

# Math rendering
pin "katex", to: "katex.js" # @0.19.0 - vendored, self-hosted (CSS+fonts in public/fonts/katex)

# CodeMirror 6
pin "@replit/codemirror-vim", to: "@replit--codemirror-vim.js" # @6.3.0 - vendored from esm.sh (externals: @codemirror/*)
pin "@codemirror/view", to: "@codemirror--view.js" # @6.39.11
pin "@codemirror/state", to: "@codemirror--state.js" # @6.5.4
pin "@codemirror/language", to: "@codemirror--language.js" # @6.12.1
pin "@codemirror/lang-markdown", to: "@codemirror--lang-markdown.js" # @6.5.0
pin "@codemirror/commands", to: "@codemirror--commands.js" # @6.10.1
pin "@codemirror/search", to: "@codemirror--search.js" # @6.6.0
pin "@lezer/highlight", to: "@lezer--highlight.js" # @1.2.5
pin "@lezer/markdown", to: "@lezer--markdown.js" # @1.6.3
pin "@codemirror/autocomplete", to: "@codemirror--autocomplete.js" # @6.20.0
pin "@codemirror/lang-css", to: "@codemirror--lang-css.js" # @6.3.1
pin "@codemirror/lang-html", to: "@codemirror--lang-html.js" # @6.4.11
pin "@codemirror/lang-javascript", to: "@codemirror--lang-javascript.js" # @6.2.4
pin "@lezer/common", to: "@lezer--common.js" # @1.5.3
pin "@lezer/css", to: "@lezer--css.js" # @1.3.0
pin "@lezer/html", to: "@lezer--html.js" # @1.3.13
pin "@lezer/javascript", to: "@lezer--javascript.js" # @1.5.4
pin "@lezer/lr", to: "@lezer--lr.js" # @1.4.11
pin "@lezer/cpp", to: "@lezer--cpp.js" # @1.1.6
pin "@lezer/go", to: "@lezer--go.js" # @1.0.1
pin "@lezer/java", to: "@lezer--java.js" # @1.1.5
pin "@lezer/python", to: "@lezer--python.js" # @1.1.19
pin "@lezer/rust", to: "@lezer--rust.js" # @1.0.3
pin "@marijn/find-cluster-break", to: "@marijn--find-cluster-break.js" # @1.0.2
pin "crelt" # @1.0.6
pin "style-mod" # @4.1.3
pin "w3c-keyname" # @2.2.8
pin "dompurify" # @3.4.16
pin "@codemirror/legacy-modes/mode/clike", to: "@codemirror--legacy-modes--mode--clike.js" # @6.5.5
pin "@lezer/yaml", to: "@lezer--yaml.js" # @1.0.4
pin "@codemirror/legacy-modes/mode/ruby", to: "@codemirror--legacy-modes--mode--ruby.js" # @6.5.5
pin "@codemirror/legacy-modes/mode/shell", to: "@codemirror--legacy-modes--mode--shell.js" # @6.5.5
pin "@codemirror/legacy-modes/mode/sql", to: "@codemirror--legacy-modes--mode--sql.js" # @6.5.5
pin "@codemirror/legacy-modes/mode/toml", to: "@codemirror--legacy-modes--mode--toml.js" # @6.5.5
pin "@codemirror/legacy-modes/mode/dockerfile", to: "@codemirror--legacy-modes--mode--dockerfile.js" # @6.5.5
