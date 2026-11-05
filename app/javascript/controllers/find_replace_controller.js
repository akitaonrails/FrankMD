import { Controller } from "@hotwired/stimulus"
import {
  findAllMatches,
  findClosestMatchIndex,
  matchLineContexts,
  replaceMatches,
  validateRegex
} from "lib/find_utils"

export default class extends Controller {
  static targets = [
    "dialog",
    "findInput",
    "replaceInput",
    "replaceSection",
    "tabFind",
    "tabReplace",
    "matchCount",
    "miniBar",
    "miniCount",
    "miniModeLabel",
    "caseSensitiveToggle",
    "regexToggle",
    "results"
  ]

  static values = {
    caseSensitive: { type: Boolean, default: false },
    useRegex: { type: Boolean, default: false }
  }

  connect() {
    this.activeTab = "find"
    this.matches = []
    this.currentMatchIndex = -1
    this.textareaRef = null
    this.boundTextareaInput = null
    this.boundDocumentKeydown = null
    this.updateTabState()
    this.updateToggleState()
    this.updateMatchCount()
  }

  open(options = {}) {
    const { textarea, tab = "find", query } = options
    if (textarea) {
      this.textareaRef = textarea
    }

    if (query) {
      this.findInputTarget.value = query
    }

    this.setActiveTab(tab)
    this.showDialog()
    this.hideMiniBar()

    this.findInputTarget.focus()
    this.findAll()
    this.bindTextareaListener()
    this.bindDocumentKeydown()
  }

  close() {
    this.hideDialog()
    this.hideMiniBar()

    this.matches = []
    this.currentMatchIndex = -1
    this.updateMatchCount()
    this.renderResults()
    this.unbindTextareaListener()
    this.unbindDocumentKeydown()
  }

  minimize() {
    if (!this.findInputTarget.value) {
      this.close()
      return
    }

    this.hideDialog()
    this.showMiniBar()
    this.bindDocumentKeydown()
  }

  skip() {
    this.findNext()
  }

  miniNext() {
    if (this.activeTab === "replace") {
      this.replaceCurrent(true)
      return
    }

    this.findNext()
  }

  miniPrevious() {
    if (this.activeTab === "replace") {
      this.replaceCurrent(false)
      this.findPrevious()
      return
    }

    this.findPrevious()
  }

  miniSkip() {
    this.findNext()
  }

  restore() {
    this.showDialog()
    this.hideMiniBar()
    this.findInputTarget.focus()
  }

  onInput() {
    this.findAll()
  }

  onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault()
      this.close()
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()

      if (event.altKey && this.activeTab === "replace") {
        this.replaceCurrent(true)
        return
      }

      if (event.shiftKey) {
        this.findPrevious()
      } else {
        this.findNext()
      }
    }
  }

  switchToFind() {
    this.setActiveTab("find")
  }

  switchToReplace() {
    this.setActiveTab("replace")
  }

  toggleCaseSensitive() {
    this.caseSensitiveValue = !this.caseSensitiveValue
    this.updateToggleState()
    this.findAll()
  }

  toggleRegex() {
    this.useRegexValue = !this.useRegexValue
    this.updateToggleState()
    this.findAll()
  }

  findAll() {
    const searchTerm = this.findInputTarget.value
    const text = this.textareaRef ? this.textareaRef.value : ""

    if (!searchTerm) {
      this.matches = []
      this.currentMatchIndex = -1
      this.updateMatchCount()
      this.renderResults()
      return
    }

    if (this.useRegexValue) {
      const validation = validateRegex(searchTerm)
      if (!validation.valid) {
        this.matches = []
        this.currentMatchIndex = -1
        this.matchCountTarget.textContent = validation.error || "Invalid regex"
        this.matchCountTarget.classList.add("text-red-500")
        this.renderResults()
        return
      }
    }

    this.matches = findAllMatches(text, searchTerm, {
      caseSensitive: this.caseSensitiveValue,
      useRegex: this.useRegexValue
    })

    const position = this.textareaRef ? this.textareaRef.selectionStart : 0
    this.currentMatchIndex = findClosestMatchIndex(this.matches, position, "next")
    this.updateMatchCount()
    this.renderResults()
  }

  findNext() {
    if (!this.matches.length) {
      this.findAll()
    }

    if (!this.matches.length) return

    if (this.isMobile()) {
      this.stepResult(1)
      return
    }

    const position = this.textareaRef ? this.textareaRef.selectionEnd : 0
    this.currentMatchIndex = findClosestMatchIndex(this.matches, position, "next")
    this.jumpToMatch(this.currentMatchIndex)
  }

  findPrevious() {
    if (!this.matches.length) {
      this.findAll()
    }

    if (!this.matches.length) return

    if (this.isMobile()) {
      this.stepResult(-1)
      return
    }

    const position = this.textareaRef ? this.textareaRef.selectionStart : 0
    this.currentMatchIndex = findClosestMatchIndex(this.matches, position, "previous")
    this.jumpToMatch(this.currentMatchIndex)
  }

  replaceCurrent(advance = false) {
    if (!this.matches.length) return

    const match = this.matches[this.currentMatchIndex]
    if (!match) return

    const replacement = this.buildReplacement(match)
    this.dispatch("replace", { detail: { start: match.start, end: match.end, replacement } })
    this.findAll()

    // On mobile findAll already moved to the match after the replacement.
    if (advance && !this.isMobile()) {
      this.findNext()
    }
  }

  replaceAll() {
    if (!this.matches.length) return

    const replacedCount = this.matches.length
    const replacement = this.replaceInputTarget.value
    const text = this.textareaRef ? this.textareaRef.value : ""
    const updated = replaceMatches(text, this.matches, replacement, {
      useRegex: this.useRegexValue
    })

    this.dispatch("replace-all", {
      detail: {
        matches: this.matches,
        replacement,
        useRegex: this.useRegexValue,
        updatedText: updated
      }
    })

    this.findAll()
    this.showReplacedFeedback(replacedCount)
  }

  showReplacedFeedback(count) {
    const message = window.t("dialogs.find_replace.replaced_count", { count })
    this.matchCountTarget.textContent = message
    this.matchCountTarget.classList.add("text-green-500")
    if (this.hasMiniCountTarget) {
      this.miniCountTarget.textContent = message
    }

    // Clear the feedback after 2 seconds
    if (this.replacedFeedbackTimeout) {
      clearTimeout(this.replacedFeedbackTimeout)
    }
    this.replacedFeedbackTimeout = setTimeout(() => {
      this.matchCountTarget.classList.remove("text-green-500")
      this.updateMatchCount()
    }, 2000)
  }

  jumpToMatch(index) {
    const match = this.matches[index]
    if (!match) return

    this.dispatch("jump", { detail: { start: match.start, end: match.end } })
    this.updateMatchCount()
  }

  // On mobile the dialog lists matches instead of selecting them in the
  // editor, which the dialog and on-screen keyboard would mostly cover.
  isMobile() {
    return window.innerWidth < 768
  }

  stepResult(direction) {
    const total = this.matches.length
    const start = this.currentMatchIndex < 0 ? (direction > 0 ? -1 : 0) : this.currentMatchIndex
    this.currentMatchIndex = (start + direction + total) % total
    this.updateMatchCount()
    this.renderResults()
  }

  selectResult(event) {
    const row = event.target.closest("[data-index]")
    if (!row) return

    const index = Number.parseInt(row.dataset.index, 10)
    if (!this.matches[index]) return

    this.currentMatchIndex = index
    this.jumpToMatch(index)
    this.close()
  }

  renderResults() {
    if (!this.hasResultsTarget) return

    const list = this.resultsTarget
    list.replaceChildren()

    const show = this.isMobile() && this.matches.length > 0
    list.classList.toggle("hidden", !show)
    if (!show) return

    const text = this.textareaRef ? this.textareaRef.value : ""
    matchLineContexts(text, this.matches).forEach((context, index) => {
      const current = index === this.currentMatchIndex
      const row = document.createElement("button")
      row.type = "button"
      row.dataset.index = index
      row.className = `w-full flex text-left font-mono text-xs leading-relaxed px-2 py-2 border-b border-[var(--theme-border)] last:border-b-0 ${current ? "bg-[var(--theme-accent)] text-[var(--theme-accent-text)]" : "hover:bg-[var(--theme-bg-hover)]"}`
      if (current) row.setAttribute("aria-current", "true")

      const lineNumber = document.createElement("span")
      lineNumber.className = `w-10 flex-shrink-0 text-right pr-2 select-none ${current ? "opacity-80" : "text-[var(--theme-text-faint)]"}`
      lineNumber.textContent = context.lineNumber

      const line = document.createElement("span")
      line.className = "flex-1 min-w-0 truncate"
      const highlight = document.createElement("span")
      highlight.className = "rounded-sm bg-[var(--theme-selection)] text-[var(--theme-selection-text)]"
      highlight.textContent = context.match
      line.append(context.before, highlight, context.after)

      row.append(lineNumber, line)
      list.append(row)
    })

    list.querySelector("[aria-current]")?.scrollIntoView?.({ block: "nearest" })
  }

  updateMatchCount() {
    this.matchCountTarget.classList.remove("text-red-500")

    const total = this.matches.length
    if (!this.findInputTarget.value) {
      this.matchCountTarget.textContent = ""
      if (this.hasMiniCountTarget) {
        this.miniCountTarget.textContent = ""
      }
      this.hideMiniBar()
      return
    }

    let text
    if (total === 0) {
      text = window.t("dialogs.find_replace.no_results")
    } else {
      const current = this.currentMatchIndex >= 0 ? this.currentMatchIndex + 1 : 0
      text = window.t("dialogs.find_replace.match_count", {
        current,
        total
      })
    }

    this.matchCountTarget.textContent = text
    if (this.hasMiniCountTarget) {
      this.miniCountTarget.textContent = text
    }
  }

  showDialog() {
    if (typeof this.dialogTarget.show === "function") {
      if (!this.dialogTarget.open) {
        this.dialogTarget.show()
      }
      return
    }

    if (typeof this.dialogTarget.showModal === "function") {
      if (!this.dialogTarget.open) {
        this.dialogTarget.showModal()
      }
      return
    }

    this.dialogTarget.setAttribute("open", "open")
  }

  hideDialog() {
    if (typeof this.dialogTarget.close === "function") {
      this.dialogTarget.close()
    } else {
      this.dialogTarget.removeAttribute("open")
    }
  }

  showMiniBar() {
    if (!this.hasMiniBarTarget) return

    this.miniBarTarget.classList.remove("hidden")
  }

  hideMiniBar() {
    if (!this.hasMiniBarTarget) return

    this.miniBarTarget.classList.add("hidden")
  }

  setActiveTab(tab) {
    this.activeTab = tab === "replace" ? "replace" : "find"
    this.updateTabState()
  }

  updateTabState() {
    const isReplace = this.activeTab === "replace"

    this.replaceSectionTarget.classList.toggle("hidden", !isReplace)

    this.tabFindTarget.classList.toggle("bg-[var(--theme-accent)]", !isReplace)
    this.tabFindTarget.classList.toggle("text-[var(--theme-accent-text)]", !isReplace)
    this.tabFindTarget.classList.toggle("text-[var(--theme-text-muted)]", isReplace)

    this.tabReplaceTarget.classList.toggle("bg-[var(--theme-accent)]", isReplace)
    this.tabReplaceTarget.classList.toggle("text-[var(--theme-accent-text)]", isReplace)
    this.tabReplaceTarget.classList.toggle("text-[var(--theme-text-muted)]", !isReplace)

    if (this.hasMiniModeLabelTarget) {
      this.miniModeLabelTarget.textContent = isReplace
        ? window.t("dialogs.find_replace.tab_replace")
        : window.t("dialogs.find_replace.tab_find")
    }
  }

  updateToggleState() {
    this.caseSensitiveToggleTarget.classList.toggle("bg-[var(--theme-bg-hover)]", this.caseSensitiveValue)
    this.caseSensitiveToggleTarget.setAttribute("aria-pressed", this.caseSensitiveValue.toString())

    this.regexToggleTarget.classList.toggle("bg-[var(--theme-bg-hover)]", this.useRegexValue)
    this.regexToggleTarget.setAttribute("aria-pressed", this.useRegexValue.toString())
  }

  buildReplacement(match) {
    const replacement = this.replaceInputTarget.value

    if (!this.useRegexValue) {
      return replacement
    }

    return replacement.replace(/\$(\$|&|\d+)/g, (_, token) => {
      if (token === "$") return "$"
      if (token === "&" || token === "0") return match.text

      const groupIndex = Number.parseInt(token, 10)
      if (Number.isNaN(groupIndex) || groupIndex < 1) return ""

      return match.groups && match.groups[groupIndex - 1] !== undefined
        ? match.groups[groupIndex - 1]
        : ""
    })
  }

  bindDocumentKeydown() {
    if (this.boundDocumentKeydown) return

    this.boundDocumentKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault()
        this.close()
      }
    }

    document.addEventListener("keydown", this.boundDocumentKeydown)
  }

  unbindDocumentKeydown() {
    if (!this.boundDocumentKeydown) return

    document.removeEventListener("keydown", this.boundDocumentKeydown)
    this.boundDocumentKeydown = null
  }

  bindTextareaListener() {
    if (!this.textareaRef || this.boundTextareaInput) return

    this.boundTextareaInput = () => this.findAll()
    this.textareaRef.addEventListener("input", this.boundTextareaInput)
  }

  unbindTextareaListener() {
    if (!this.textareaRef || !this.boundTextareaInput) return

    this.textareaRef.removeEventListener("input", this.boundTextareaInput)
    this.boundTextareaInput = null
  }
}
