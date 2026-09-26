import { Controller } from "@hotwired/stimulus"
import { appConfirm } from "lib/app_prompt"
import { levenshteinDistance } from "lib/text_utils"

// Code Dialog Controller
// Handles code snippet insertion and editing
// Dispatches code-dialog:insert event with code block details

export default class extends Controller {
  static targets = [
    "dialog",
    "language",
    "content",
    "indentTabs",
    "suggestions"
  ]

  connect() {
    this.codeEditMode = false
    this.codeStartPos = 0
    this.codeEndPos = 0

    this.codeLanguages = [
      "javascript", "typescript", "python", "ruby", "go", "rust", "java", "c", "cpp", "csharp",
      "php", "swift", "kotlin", "scala", "haskell", "elixir", "erlang", "clojure", "lua", "perl",
      "html", "css", "scss", "sass", "less", "json", "yaml", "toml", "xml", "markdown",
      "sql", "graphql", "bash", "shell", "powershell", "dockerfile", "makefile",
      "nginx", "apache", "vim", "regex", "diff", "git", "plaintext"
    ]
  }

  // Called by app_controller with optional existing code block
  open(options = {}) {
    const { language = "", content = "", editMode = false, startPos = 0, endPos = 0 } = options

    this.codeEditMode = editMode
    this.codeStartPos = startPos
    this.codeEndPos = endPos

    this.languageTarget.value = language
    this.contentTarget.value = content

    this.hideSuggestions()
    this.dialogTarget.showModal()
    this.languageTarget.focus()
  }

  close() {
    this.dialogTarget.close()
  }

  onLanguageInput() {
    const value = this.languageTarget.value.toLowerCase().trim()

    if (!value) {
      this.hideSuggestions()
      return
    }

    // Filter languages that start with or contain the input
    const matches = this.codeLanguages.filter(lang =>
      lang.startsWith(value) || lang.includes(value)
    ).slice(0, 6)

    if (matches.length > 0 && matches[0] !== value) {
      this.showSuggestions(matches)
    } else {
      this.hideSuggestions()
    }
  }

  onLanguageKeydown(event) {
    if (event.key === "Tab") {
      const suggestions = this.suggestionsTarget
      if (!suggestions.classList.contains("hidden")) {
        event.preventDefault()
        const firstSuggestion = suggestions.querySelector("button")
        if (firstSuggestion) {
          this.languageTarget.value = firstSuggestion.dataset.language
          this.hideSuggestions()
        }
      }
    } else if (event.key === "Escape") {
      this.hideSuggestions()
    } else if (event.key === "ArrowDown") {
      const suggestions = this.suggestionsTarget
      if (!suggestions.classList.contains("hidden")) {
        event.preventDefault()
        const firstBtn = suggestions.querySelector("button")
        if (firstBtn) firstBtn.focus()
      }
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      this.insert()
    }
  }

  onContentKeydown(event) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      this.insert()
      return
    }

    // Handle Tab key for indentation
    if (event.key === "Tab") {
      event.preventDefault()
      const textarea = this.contentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = textarea.value

      // Determine indent character(s)
      const useTabs = this.hasIndentTabsTarget && this.indentTabsTarget.checked
      const indent = useTabs ? "\t" : "  "

      if (start === end) {
        // No selection - just insert indent at cursor
        if (event.shiftKey) {
          // Outdent: remove indent from start of current line
          const lineStart = value.lastIndexOf("\n", start - 1) + 1
          const lineContent = value.substring(lineStart, start)
          if (lineContent.startsWith(indent)) {
            textarea.value = value.substring(0, lineStart) + value.substring(lineStart + indent.length)
            textarea.selectionStart = textarea.selectionEnd = start - indent.length
          } else if (lineContent.startsWith("\t") || lineContent.startsWith(" ")) {
            // Remove single space or tab if exact indent not found
            const removeLen = lineContent.startsWith("\t") ? 1 : Math.min(lineContent.match(/^ */)[0].length, indent.length)
            textarea.value = value.substring(0, lineStart) + value.substring(lineStart + removeLen)
            textarea.selectionStart = textarea.selectionEnd = start - removeLen
          }
        } else {
          // Indent: insert at cursor
          textarea.value = value.substring(0, start) + indent + value.substring(end)
          textarea.selectionStart = textarea.selectionEnd = start + indent.length
        }
      } else {
        // Selection exists - indent/outdent all selected lines
        const lineStart = value.lastIndexOf("\n", start - 1) + 1
        const lineEnd = value.indexOf("\n", end)
        const actualEnd = lineEnd === -1 ? value.length : lineEnd
        const selectedLines = value.substring(lineStart, actualEnd)
        const lines = selectedLines.split("\n")

        let newLines
        if (event.shiftKey) {
          // Outdent
          newLines = lines.map(line => {
            if (line.startsWith(indent)) {
              return line.substring(indent.length)
            } else if (line.startsWith("\t")) {
              return line.substring(1)
            } else if (line.startsWith(" ")) {
              const spaces = line.match(/^ */)[0].length
              return line.substring(Math.min(spaces, indent.length))
            }
            return line
          })
        } else {
          // Indent
          newLines = lines.map(line => indent + line)
        }

        const newText = newLines.join("\n")
        textarea.value = value.substring(0, lineStart) + newText + value.substring(actualEnd)

        // Restore selection
        textarea.selectionStart = lineStart
        textarea.selectionEnd = lineStart + newText.length
      }

      // Trigger input event for any listeners
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }

  onSuggestionKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const next = event.target.nextElementSibling
      if (next) next.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      const prev = event.target.previousElementSibling
      if (prev) {
        prev.focus()
      } else {
        this.languageTarget.focus()
      }
    } else if (event.key === "Escape") {
      this.hideSuggestions()
      this.languageTarget.focus()
    }
  }

  showSuggestions(matches) {
    const container = this.suggestionsTarget
    container.innerHTML = matches.map(lang => `
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--theme-bg-hover)] focus:bg-[var(--theme-bg-hover)] focus:outline-none text-[var(--theme-text-primary)]"
        data-language="${lang}"
        data-action="click->code-dialog#selectLanguage keydown->code-dialog#onSuggestionKeydown"
      >
        ${lang}
      </button>
    `).join("")
    container.classList.remove("hidden")
  }

  hideSuggestions() {
    this.suggestionsTarget.classList.add("hidden")
  }

  selectLanguage(event) {
    this.languageTarget.value = event.currentTarget.dataset.language
    this.hideSuggestions()
    this.contentTarget.focus()
  }

  async insert() {
    const language = this.languageTarget.value.trim()
    const content = this.contentTarget.value

    // Validate language if provided
    if (language && !this.codeLanguages.includes(language.toLowerCase())) {
      const isClose = this.codeLanguages.some(lang =>
        lang.startsWith(language.toLowerCase()) ||
        levenshteinDistance(lang, language.toLowerCase()) <= 2
      )
      if (!isClose) {
        const proceed = await appConfirm(window.t("dialogs.code.unrecognized_language", { language }))
        if (!proceed) return
      }
    }

    // Build the code fence
    let codeBlock
    if (content) {
      codeBlock = "```" + language + "\n" + content + (content.endsWith("\n") ? "" : "\n") + "```"
    } else {
      // Empty content: add a blank line inside the fence
      codeBlock = "```" + language + "\n\n```"
    }

    // Dispatch event with code block details
    this.dispatch("insert", {
      detail: {
        codeBlock,
        language,
        editMode: this.codeEditMode,
        startPos: this.codeStartPos,
        endPos: this.codeEndPos
      }
    })

    this.close()
  }
}
