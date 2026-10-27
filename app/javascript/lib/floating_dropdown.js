const PADDING = 8
const GAP = 4
const MAX_HEIGHT = 320

// Keep the menu in its Stimulus scope, but render it above scrolling dialogs.
// Fixed positioning also provides a fallback for browsers without popovers.
export default class FloatingDropdown {
  constructor(menu, button) {
    this.menu = menu
    this.button = button
    this.opened = false
    this.listeners = []
    menu.setAttribute("popover", "auto")
    menu.classList.add("floating-dropdown")
    button.setAttribute("aria-haspopup", "menu")
    button.setAttribute("aria-expanded", "false")
    if (menu.id) {
      button.setAttribute("aria-controls", menu.id)
      button.setAttribute("popovertarget", menu.id)
    }
    // Associate the native invoker so clicking it doesn't light-dismiss before
    // Stimulus toggles, and suppress its default action to avoid toggling twice.
    this.listen(button, "click", event => event.preventDefault())

    this.listen(menu, "beforetoggle", event => {
      if (event.newState === "closed") this.finishClose()
    })
    this.listen(button, "keydown", event => this.navigate(event))
    this.listen(menu, "keydown", event => this.navigate(event))
    this.listen(document, "click", event => {
      if (!menu.contains(event.target) && !button.contains(event.target)) this.close()
    })
    this.listen(document, "focusin", event => {
      if (!menu.contains(event.target) && !button.contains(event.target)) this.close()
    })
    this.listen(document, "frankmd:dropdown-open", event => {
      if (event.detail !== menu) this.close()
    })
    this.listen(window, "scroll", event => {
      if (!this.opened || (event.target instanceof Node && menu.contains(event.target))) return
      const anchor = button.getBoundingClientRect()
      // Scroll events queued before opening must not dismiss the new menu.
      if (anchor.top !== this.anchor.top || anchor.left !== this.anchor.left) this.close()
    }, true)
    this.listen(window, "resize", () => { if (this.opened) this.position() })
    if (window.visualViewport) {
      this.listen(window.visualViewport, "resize", () => { if (this.opened) this.position() })
      this.listen(window.visualViewport, "scroll", () => this.close())
    }
    const dialog = menu.closest("dialog")
    if (dialog) this.listen(dialog, "close", () => this.close())
  }

  listen(target, type, callback, capture = false) {
    target.addEventListener(type, callback, capture)
    this.listeners.push(() => target.removeEventListener(type, callback, capture))
  }

  toggle() {
    if (this.opened) this.close(true)
    else this.open()
  }

  open() {
    if (this.opened || this.button.disabled) return
    document.dispatchEvent(new CustomEvent("frankmd:dropdown-open", { detail: this.menu }))
    this.opened = true
    this.menu.classList.remove("hidden")
    this.menu.showPopover?.()
    this.button.setAttribute("aria-expanded", "true")
    this.position()
    const options = this.options()
    options.forEach(option => { option.tabIndex = -1 })
    this.focus(options.find(option => option.getAttribute("aria-checked") === "true") || options[0])
  }

  close(restoreFocus = false) {
    const wasOpen = this.opened
    if (wasOpen) this.menu.hidePopover?.()
    this.finishClose()
    if (wasOpen && restoreFocus) this.button.focus({ preventScroll: true })
  }

  finishClose() {
    this.opened = false
    this.menu.classList.add("hidden")
    this.button.setAttribute("aria-expanded", "false")
  }

  position() {
    const viewport = window.visualViewport
    const left = (viewport?.offsetLeft || 0) + PADDING
    const top = (viewport?.offsetTop || 0) + PADDING
    const right = left + (viewport?.width || window.innerWidth) - 2 * PADDING
    const bottom = top + (viewport?.height || window.innerHeight) - 2 * PADDING
    const anchor = this.button.getBoundingClientRect()
    if (anchor.bottom < top || anchor.top > bottom || anchor.right < left || anchor.left > right) {
      this.close()
      return
    }
    this.anchor = anchor
    const below = Math.max(0, bottom - anchor.bottom - GAP)
    const above = Math.max(0, anchor.top - GAP - top)
    const upward = below < Math.min(MAX_HEIGHT, this.menu.scrollHeight) && above > below
    this.menu.style.maxWidth = `${Math.max(0, right - left)}px`
    this.menu.style.maxHeight = `${Math.min(MAX_HEIGHT, upward ? above : below)}px`
    const rect = this.menu.getBoundingClientRect()
    const rtl = getComputedStyle(this.button).direction === "rtl"
    this.menu.style.left = `${Math.max(left, Math.min(rtl ? anchor.left : anchor.right - rect.width, right - rect.width))}px`
    this.menu.style.top = `${upward ? anchor.top - GAP - rect.height : anchor.bottom + GAP}px`
    if (this.menu.contains(document.activeElement)) this.focus(document.activeElement)
  }

  options() {
    return Array.from(this.menu.querySelectorAll("button:not(:disabled)"))
  }

  focus(option) {
    option?.focus({ preventScroll: true })
    if (!option) return
    const item = option.getBoundingClientRect()
    const menu = this.menu.getBoundingClientRect()
    if (item.top < menu.top) this.menu.scrollTop -= menu.top - item.top
    else if (item.bottom > menu.bottom) this.menu.scrollTop += item.bottom - menu.bottom
  }

  navigate(event) {
    if (event.key === "Tab" && this.opened) {
      this.close(true)
      return
    }
    if (event.key === "Escape" && this.opened) {
      event.preventDefault()
      event.stopPropagation()
      this.close(true)
      return
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const wasOpen = this.opened
    if (!wasOpen) this.open()
    const options = this.options()
    const index = options.indexOf(document.activeElement)
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
      !wasOpen ? (event.key === "ArrowUp" ? options.length - 1 : index) :
      (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length
    this.focus(options[next])
  }

  disconnect() {
    this.close()
    this.listeners.forEach(remove => remove())
  }
}
