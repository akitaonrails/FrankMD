import { Controller } from "@hotwired/stimulus"
import { clampMenuToViewport } from "lib/menu_bounds"

// Text Format Controller
// Handles text formatting context menu for inline markdown formatting
// Provides openAtCursor() and openAtPosition() for menu positioning
// Provides applyFormatById() for direct formatting (keyboard shortcuts)
// Dispatches text-format:applied event with { format, prefix, suffix, selectionData }

export default class extends Controller {
  static targets = ["menu", "textarea"]

  static formats = [
    { id: "bold", label: "Bold", hotkey: "B", prefix: "**", suffix: "**" },
    { id: "italic", label: "Italic", hotkey: "I", prefix: "*", suffix: "*" },
    { id: "strikethrough", label: "Strikethrough", hotkey: "S", prefix: "~~", suffix: "~~" },
    { id: "highlight", label: "Highlight", hotkey: "H", prefix: "==", suffix: "==" },
    { id: "subscript", label: "Subscript", hotkey: "U", prefix: "~", suffix: "~" },
    { id: "superscript", label: "Superscript", hotkey: "P", prefix: "^", suffix: "^" },
    { id: "link", label: "Link", hotkey: "L", prefix: "[", suffix: "](url)" }
  ]

  connect() {
    this.selectedIndex = 0
    this.selectionData = null
    this.setupCloseOnClickOutside()
  }

  _getCodemirrorController() {
    const element = document.querySelector('[data-controller~="codemirror"]')
    if (element) {
      return this.application.getControllerForElementAndIdentifier(element, "codemirror")
    }
    return null
  }

  disconnect() {
    if (this.boundClickOutside) {
      document.removeEventListener("mousedown", this.boundClickOutside)
    }
  }

  setupCloseOnClickOutside() {
    this.boundClickOutside = (event) => {
      if (!this.hasMenuTarget) return
      if (this.menuTarget.classList.contains("hidden")) return
      if (!this.menuTarget.contains(event.target)) {
        this.close()
      }
    }
    document.addEventListener("mousedown", this.boundClickOutside)
  }

  // Open the menu at specified position with selection data
  open(selectionData, x, y) {
    if (!this.hasMenuTarget) return
    if (!selectionData || !selectionData.text) return

    this.selectionData = selectionData
    this.selectedIndex = 0
    this.renderMenu()
    this.positionMenu(x, y)
    this.menuTarget.classList.remove("hidden")
    clampMenuToViewport(this.menuTarget)
    this.menuTarget.focus()
  }

  // Close the menu
  close() {
    if (!this.hasMenuTarget) return
    this.menuTarget.classList.add("hidden")
    this.selectionData = null
  }

  // Position menu with viewport boundary checks
  positionMenu(x, y) {
    if (!this.hasMenuTarget) return

    const menu = this.menuTarget
    menu.style.left = `${x}px`
    menu.style.top = `${y}px`

    // Wait for render to get actual dimensions
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect()
      const padding = 10

      // Adjust if menu goes off right edge
      if (rect.right > window.innerWidth - padding) {
        menu.style.left = `${window.innerWidth - rect.width - padding}px`
      }

      // Adjust if menu goes off bottom edge
      if (rect.bottom > window.innerHeight - padding) {
        menu.style.top = `${y - rect.height}px`
      }

      // Ensure menu stays on screen (left/top)
      const newRect = menu.getBoundingClientRect()
      if (newRect.left < padding) {
        menu.style.left = `${padding}px`
      }
      if (newRect.top < padding) {
        menu.style.top = `${padding}px`
      }
    })
  }

  // Render menu items with hotkey underlines
  renderMenu() {
    if (!this.hasMenuTarget) return

    const items = this.constructor.formats.map((format, index) => {
      const isSelected = index === this.selectedIndex
      const labelWithHotkey = this.formatLabelWithHotkey(format.label, format.hotkey)

      return `
        <button
          type="button"
          class="w-full px-3 py-1.5 text-left text-sm flex items-center justify-between gap-4 ${
            isSelected
              ? "bg-[var(--theme-accent)] text-[var(--theme-accent-text)]"
              : "hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-primary)]"
          }"
          data-action="click->text-format#onItemClick mouseenter->text-format#onItemHover"
          data-index="${index}"
          data-format-id="${format.id}"
        >
          <span>${labelWithHotkey}</span>
          <span class="text-xs ${isSelected ? "opacity-80" : "text-[var(--theme-text-muted)]"}">${format.hotkey}</span>
        </button>
      `
    }).join("")

    this.menuTarget.innerHTML = items
  }

  // Format label with underlined hotkey character
  formatLabelWithHotkey(label, hotkey) {
    const lowerLabel = label.toLowerCase()
    const lowerHotkey = hotkey.toLowerCase()
    const index = lowerLabel.indexOf(lowerHotkey)

    if (index === -1) {
      return label
    }

    const before = label.substring(0, index)
    const char = label.charAt(index)
    const after = label.substring(index + 1)

    return `${before}<u>${char}</u>${after}`
  }

  // Handle keydown events on the menu
  onMenuKeydown(event) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        this.selectedIndex = (this.selectedIndex + 1) % this.constructor.formats.length
        this.renderMenu()
        break

      case "ArrowUp":
        event.preventDefault()
        this.selectedIndex = (this.selectedIndex - 1 + this.constructor.formats.length) % this.constructor.formats.length
        this.renderMenu()
        break

      case "Enter":
        event.preventDefault()
        this.applyFormat(this.constructor.formats[this.selectedIndex])
        break

      case "Escape":
        event.preventDefault()
        this.close()
        // Dispatch event to return focus to textarea
        this.dispatch("closed")
        break

      default:
        // Check for hotkey press
        const hotkey = event.key.toUpperCase()
        const format = this.constructor.formats.find(f => f.hotkey === hotkey)
        if (format) {
          event.preventDefault()
          this.applyFormat(format)
        }
        break
    }
  }

  // Handle mouse hover on menu item
  onItemHover(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10)
    if (!isNaN(index) && index !== this.selectedIndex) {
      this.selectedIndex = index
      this.renderMenu()
    }
  }

  // Handle click on menu item
  onItemClick(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10)
    if (!isNaN(index)) {
      this.applyFormat(this.constructor.formats[index])
    }
  }

  // Apply the selected format: use CodeMirror if available, else dispatch event
  applyFormat(format) {
    if (!format || !this.selectionData) return

    const cm = this._getCodemirrorController()
    if (cm) {
      this.applyFormatToEditor(format, this.selectionData, cm)
      this.close()
      this.dispatch("content-changed")
    } else {
      // Fallback: dispatch applied event for legacy handling
      this.dispatch("applied", {
        detail: {
          format: format.id,
          prefix: format.prefix,
          suffix: format.suffix,
          selectionData: this.selectionData
        }
      })
      this.close()
    }
  }

  // Get a format by its ID
  getFormat(formatId) {
    return this.constructor.formats.find(f => f.id === formatId)
  }

  // Open the format menu at cursor position (via Ctrl+M)
  openAtCursor(textarea) {
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    // Only open if text is selected
    if (start === end) return

    const selectedText = textarea.value.substring(start, end)
    if (!selectedText.trim()) return

    const selectionData = {
      start,
      end,
      text: selectedText
    }

    // Calculate position based on cursor/selection
    const { x, y } = this.getCaretCoordinates(textarea, end)

    this.open(selectionData, x, y + 20) // Offset below cursor
  }

  // Open the format menu at a specific position (via context menu)
  openAtPosition(textarea, x, y) {
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    // Only open if text is selected
    if (start === end) return

    const selectedText = textarea.value.substring(start, end)
    if (!selectedText.trim()) return

    const selectionData = {
      start,
      end,
      text: selectedText
    }

    this.open(selectionData, x, y)
  }

  // Check if a format is toggleable (symmetric prefix/suffix)
  isToggleable(format) {
    return format.prefix === format.suffix
  }

  // Check if text is wrapped with format markers and return unwrap info
  getUnwrapInfo(format, textarea) {
    const { prefix, suffix } = format
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const fullText = textarea.value
    const selectedText = fullText.substring(start, end)

    // Case 1: Selection itself includes the markers
    if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix) && selectedText.length >= prefix.length + suffix.length) {
      return {
        canUnwrap: true,
        unwrapStart: start,
        unwrapEnd: end,
        newText: selectedText.slice(prefix.length, -suffix.length || undefined),
        cursorStart: start,
        cursorEnd: end - prefix.length - suffix.length
      }
    }

    // Case 2: Markers are just outside the selection
    const beforeStart = start - prefix.length
    const afterEnd = end + suffix.length
    if (beforeStart >= 0 && afterEnd <= fullText.length) {
      const textBefore = fullText.substring(beforeStart, start)
      const textAfter = fullText.substring(end, afterEnd)
      if (textBefore === prefix && textAfter === suffix) {
        return {
          canUnwrap: true,
          unwrapStart: beforeStart,
          unwrapEnd: afterEnd,
          newText: selectedText,
          cursorStart: beforeStart,
          cursorEnd: beforeStart + selectedText.length
        }
      }
    }

    return { canUnwrap: false }
  }

  // Apply a format directly by its ID (for keyboard shortcuts like Ctrl+B, Ctrl+I)
  applyFormatById(formatId, textarea) {
    if (!textarea) return

    const format = this.getFormat(formatId)
    if (!format) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    // If no selection, just insert the format markers and place cursor between them
    if (start === end) {
      const { prefix, suffix } = format
      const before = textarea.value.substring(0, start)
      const after = textarea.value.substring(end)
      textarea.value = before + prefix + suffix + after
      // Position cursor between prefix and suffix
      const cursorPos = start + prefix.length
      textarea.setSelectionRange(cursorPos, cursorPos)
      textarea.focus()
      // Dispatch input event to trigger syntax highlighting update
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      return true // Indicates formatting was applied
    }

    // Check for toggle (unwrap) if format is toggleable
    if (this.isToggleable(format)) {
      const unwrapInfo = this.getUnwrapInfo(format, textarea)
      if (unwrapInfo.canUnwrap) {
        const before = textarea.value.substring(0, unwrapInfo.unwrapStart)
        const after = textarea.value.substring(unwrapInfo.unwrapEnd)
        textarea.value = before + unwrapInfo.newText + after
        textarea.setSelectionRange(unwrapInfo.cursorStart, unwrapInfo.cursorEnd)
        textarea.focus()
        textarea.dispatchEvent(new Event("input", { bubbles: true }))
        return true
      }
    }

    // Apply formatting to selected text
    const text = textarea.value.substring(start, end)
    const selectionData = { start, end, text }
    this.applyFormatToTextarea(format, selectionData, textarea)
    return true
  }

  // Apply format to textarea and update its value
  applyFormatToTextarea(format, selectionData, textarea) {
    if (!format || !selectionData || !textarea) return

    const { start, end, text } = selectionData
    const { prefix, suffix } = format

    // Build the formatted text
    const formattedText = prefix + text + suffix

    // Replace the selected text
    const before = textarea.value.substring(0, start)
    const after = textarea.value.substring(end)
    textarea.value = before + formattedText + after

    // Calculate new cursor position
    // For link format, select "url" for easy replacement
    if (prefix === "[" && suffix === "](url)") {
      const urlStart = start + prefix.length + text.length + 2 // After ](
      const urlEnd = urlStart + 3 // Select "url"
      textarea.setSelectionRange(urlStart, urlEnd)
    } else {
      // Position cursor after the formatted text
      const newPosition = start + formattedText.length
      textarea.setSelectionRange(newPosition, newPosition)
    }

    textarea.focus()
    // Dispatch input event to trigger syntax highlighting update
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  }

  // Apply format directly to CodeMirror editor (wrap/unwrap/toggle + link cursor positioning)
  applyFormatToEditor(format, selectionData, codemirrorController) {
    if (!format || !selectionData || !codemirrorController) return

    const { prefix, suffix } = format
    const { start, end, text } = selectionData
    const fullText = codemirrorController.getValue()

    // Check for toggle (unwrap) if format is symmetric
    const isToggleable = prefix === suffix
    if (isToggleable) {
      // Case 1: Selection itself includes the markers
      if (text.startsWith(prefix) && text.endsWith(suffix) && text.length >= prefix.length + suffix.length) {
        const unwrapped = text.slice(prefix.length, -suffix.length || undefined)
        codemirrorController.replaceRange(unwrapped, start, end)
        codemirrorController.setSelection(start, start + unwrapped.length)
        codemirrorController.focus()
        return
      }

      // Case 2: Markers are just outside the selection
      const beforeStart = start - prefix.length
      const afterEnd = end + suffix.length
      if (beforeStart >= 0 && afterEnd <= fullText.length) {
        const textBefore = fullText.substring(beforeStart, start)
        const textAfter = fullText.substring(end, afterEnd)
        if (textBefore === prefix && textAfter === suffix) {
          codemirrorController.replaceRange(text, beforeStart, afterEnd)
          codemirrorController.setSelection(beforeStart, beforeStart + text.length)
          codemirrorController.focus()
          return
        }
      }
    }

    // Build the formatted text
    const formattedText = prefix + text + suffix

    // Replace the selected text
    codemirrorController.replaceRange(formattedText, start, end)

    // Calculate new cursor position
    // For link format, select "url" for easy replacement
    if (prefix === "[" && suffix === "](url)") {
      const urlStart = start + prefix.length + text.length + 2 // After ](
      const urlEnd = urlStart + 3 // Select "url"
      codemirrorController.setSelection(urlStart, urlEnd)
    } else {
      // Position cursor after the formatted text
      const newPosition = start + formattedText.length
      codemirrorController.setSelection(newPosition, newPosition)
    }

    codemirrorController.focus()
  }

  // Handle context menu with CodeMirror selection check
  onContextMenu(event, codemirrorController, isMarkdown) {
    if (!isMarkdown || !codemirrorController) return

    const { from, to, text: selectedText } = codemirrorController.getSelection()

    // Only show custom menu if text is selected
    if (from === to) return
    if (!selectedText.trim()) return

    event.preventDefault()

    const selectionData = { start: from, end: to, text: selectedText }
    this.open(selectionData, event.clientX, event.clientY)
  }

  // Open format menu from keyboard shortcut (Ctrl+M) using CodeMirror
  openFromKeyboard(codemirrorController) {
    if (!codemirrorController) return

    const { from, to, text: selectedText } = codemirrorController.getSelection()
    if (from === to) return
    if (!selectedText.trim()) return

    const selectionData = { start: from, end: to, text: selectedText }

    // Get cursor coordinates from CodeMirror for menu positioning
    const editor = codemirrorController.editor
    const coords = editor?.coordsAtPos(to)
    if (coords) {
      this.open(selectionData, coords.left, coords.bottom + 4)
    } else {
      // Fallback: open at center of editor
      const container = codemirrorController.element
      const rect = container.getBoundingClientRect()
      this.open(selectionData, rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
  }

  // Get approximate caret coordinates in a textarea
  getCaretCoordinates(textarea, position) {
    // Create a mirror div to measure text position
    const mirror = document.createElement("div")
    const style = window.getComputedStyle(textarea)

    // Copy relevant styles
    mirror.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: ${textarea.clientWidth}px;
      height: auto;
      font-family: ${style.fontFamily};
      font-size: ${style.fontSize};
      font-weight: ${style.fontWeight};
      line-height: ${style.lineHeight};
      padding: ${style.padding};
      border: ${style.border};
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
    `

    // Get text before position
    const textBefore = textarea.value.substring(0, position)
    mirror.textContent = textBefore

    // Add a marker span at the position
    const marker = document.createElement("span")
    marker.textContent = "|"
    mirror.appendChild(marker)

    document.body.appendChild(mirror)

    // Get textarea's position on screen
    const textareaRect = textarea.getBoundingClientRect()

    // Calculate position relative to viewport
    const x = textareaRect.left + marker.offsetLeft - textarea.scrollLeft
    const y = textareaRect.top + marker.offsetTop - textarea.scrollTop

    document.body.removeChild(mirror)

    return { x, y }
  }
}
