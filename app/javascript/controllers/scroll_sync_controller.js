import { Controller } from "@hotwired/stimulus"
import { getEditorContent } from "lib/codemirror_adapter"

export default class extends Controller {
  static outlets = ["codemirror", "preview"]

  connect() {
    this._scrollSource = null
    this._scrollSourceTimeout = null
    this.typewriterModeEnabled = false
    this._previewResizeObserver = null
    this._setupResizeListener()
  }

  disconnect() {
    if (this._scrollSourceTimeout) clearTimeout(this._scrollSourceTimeout)
    if (this._resizeTimeout) clearTimeout(this._resizeTimeout)
    if (this._previewResizeObserver) {
      this._previewResizeObserver.disconnect()
      this._previewResizeObserver = null
    }
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler)
    }
  }

  // Observe the preview content for size changes (image loads, embeds) so the
  // driven pane can be re-anchored while a sync lock is held.
  previewOutletConnected() {
    this._setupPreviewResizeObserver()
  }

  // === Controller Getters (via Stimulus Outlets) ===

  getCodemirrorController() { return this.codemirrorOutlets[0] ?? null }
  getPreviewController() { return this.previewOutlets[0] ?? null }

  // === Event Handlers ===

  onTypewriterToggled(event) {
    const { enabled } = event.detail
    this.typewriterModeEnabled = enabled
  }

  onEditorScroll(event) {
    const previewController = this.getPreviewController()
    if (!previewController || !previewController.isVisible) return

    if (this._scrollSource === "preview") return

    this._markScrollFromEditor()

    const scrollRatio = event.detail?.scrollRatio || 0
    // Anchor on the editor's top visible line when available (exact mapping,
    // incl. frontmatter offsets); the ratio is the fallback inside the preview
    const codemirrorController = this.getCodemirrorController()
    const topLine = codemirrorController?.getTopVisibleLine?.() ?? null
    previewController.syncScrollRatio(scrollRatio, topLine)
  }

  onPreviewScroll(event) {
    const codemirrorController = this.getCodemirrorController()
    if (!codemirrorController) return

    if (codemirrorController.isSelecting) return
    if (this._scrollSource === "editor") return

    this._markScrollFromPreview()

    const { scrollRatio, sourceLine, totalLines } = event.detail
    const scrollInfo = codemirrorController.getScrollInfo()
    const maxScroll = scrollInfo.height - scrollInfo.clientHeight
    if (maxScroll <= 0) return

    if (scrollRatio <= 0.01) {
      if (scrollInfo.top !== 0) {
        codemirrorController.scrollTo(0)
      }
      return
    }

    if (scrollRatio >= 0.99) {
      if (Math.abs(scrollInfo.top - maxScroll) > 1) {
        codemirrorController.scrollTo(maxScroll)
      }
      return
    }

    // Line-anchored sync: scroll the editor to the preview's top source line
    if (sourceLine && totalLines > 1 && codemirrorController.scrollToLine) {
      codemirrorController.scrollToLine(sourceLine)
      return
    }

    // Ratio fallback for unannotated/short documents
    const targetScroll = scrollRatio * maxScroll

    if (Math.abs(scrollInfo.top - targetScroll) > 5) {
      codemirrorController.scrollTo(targetScroll)
    }
  }

  // The preview is about to be scrolled programmatically (typing path, cursor
  // jump, toggle re-sync). It originates from the editor side, so mark the
  // single lock as editor-initiated: the preview's echo scroll events must not
  // be synced back to the editor (prevents animation-tail re-scroll feedback).
  onProgrammaticPreviewScroll() {
    this._markScrollFromEditor()
  }

  onPreviewToggled(event) {
    const { visible } = event.detail
    if (visible) {
      this.updatePreview()
      const codemirrorController = this.getCodemirrorController()
      const previewController = this.getPreviewController()
      if (codemirrorController && previewController) {
        const scrollRatio = codemirrorController.getScrollRatio()
        const topLine = codemirrorController.getTopVisibleLine?.() ?? null
        // Mark the lock for the re-sync echo...
        this._markScrollFromEditor()
        previewController.syncScrollRatio(scrollRatio, topLine)
        // ...but clear it as soon as the echo settles (scroll events fire in
        // the next frame's scroll steps, before its animation callbacks), so a
        // user scrolling the preview right after the toggle isn't swallowed.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this._clearScrollSource())
        })
      }
    }
  }

  onPreviewZoomChanged() {
    // Zoom changes reflow the preview: re-anchor the panes to each other
    this._reanchorAfterResize()
  }

  // === Public API ===

  updatePreviewWithSync() {
    const previewController = this.getPreviewController()
    if (!previewController || !previewController.isVisible) return

    const codemirrorController = this.getCodemirrorController()
    const textarea = document.querySelector('[data-app-target="textarea"]')
    const content = getEditorContent(codemirrorController, textarea)

    if (this.typewriterModeEnabled) {
      const cursorInfo = codemirrorController ? codemirrorController.getCursorPosition() : { offset: 0 }
      previewController.updateWithSync(content, {
        cursorPos: cursorInfo.offset,
        typewriterMode: true
      })
    } else {
      previewController.render(content)
    }
  }

  updatePreview() {
    const previewController = this.getPreviewController()
    if (!previewController || !previewController.isVisible) return

    const codemirrorController = this.getCodemirrorController()
    const textarea = document.querySelector('[data-app-target="textarea"]')
    const content = getEditorContent(codemirrorController, textarea)

    previewController.render(content)
  }

  syncPreviewScrollToCursor() {
    const previewController = this.getPreviewController()
    if (previewController) {
      previewController.syncToCursor()
    }
  }

  // === Internal ===

  _markScrollFromEditor() {
    this._scrollSource = "editor"
    if (this._scrollSourceTimeout) {
      clearTimeout(this._scrollSourceTimeout)
    }
    this._scrollSourceTimeout = setTimeout(() => {
      this._scrollSource = null
    }, 400)
  }

  _markScrollFromPreview() {
    this._scrollSource = "preview"
    if (this._scrollSourceTimeout) {
      clearTimeout(this._scrollSourceTimeout)
    }
    this._scrollSourceTimeout = setTimeout(() => {
      this._scrollSource = null
    }, 400)
  }

  _clearScrollSource() {
    if (this._scrollSourceTimeout) {
      clearTimeout(this._scrollSourceTimeout)
      this._scrollSourceTimeout = null
    }
    this._scrollSource = null
  }

  // Re-anchor the driven pane after the preview content changes size
  // (zoom, image load, window resize). While the lock is held the pane that
  // was last synced TO is re-synced from its driver.
  _reanchorAfterResize() {
    const previewController = this.getPreviewController()
    const codemirrorController = this.getCodemirrorController()
    if (!previewController || !codemirrorController) return
    if (!previewController.isVisible) return

    if (this._scrollSource === "preview") {
      // Preview last drove: re-anchor the editor to the preview's top source line
      const sourceLine = previewController.getTopSourceLine?.()
      if (sourceLine && codemirrorController.scrollToLine) {
        codemirrorController.scrollToLine(sourceLine)
        return
      }
      // Ratio fallback for unannotated documents
      const content = previewController.contentTarget
      if (!content) return
      const maxPreviewScroll = content.scrollHeight - content.clientHeight
      const scrollInfo = codemirrorController.getScrollInfo()
      const maxEditorScroll = scrollInfo.height - scrollInfo.clientHeight
      if (maxPreviewScroll > 0 && maxEditorScroll > 0) {
        codemirrorController.scrollTo((content.scrollTop / maxPreviewScroll) * maxEditorScroll)
      }
      return
    }

    // Editor last drove (or idle): re-anchor the preview to the editor's top line
    const topLine = codemirrorController.getTopVisibleLine?.() ?? null
    previewController.syncScrollRatio(codemirrorController.getScrollRatio(), topLine)
  }

  _setupPreviewResizeObserver() {
    if (this._previewResizeObserver) return
    if (typeof ResizeObserver === "undefined") return

    const previewController = this.getPreviewController()
    if (!previewController || !previewController.hasContentTarget) return

    this._previewResizeObserver = new ResizeObserver(() => this._reanchorAfterResize())
    this._previewResizeObserver.observe(previewController.contentTarget)
  }

  _setupResizeListener() {
    this._resizeHandler = () => {
      clearTimeout(this._resizeTimeout)
      this._resizeTimeout = setTimeout(() => this._reanchorAfterResize(), 200)
    }
    window.addEventListener("resize", this._resizeHandler)
  }
}
