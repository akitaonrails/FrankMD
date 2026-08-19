import { Controller } from "@hotwired/stimulus"
import { calculateLineFromScroll, scrollTopForElement } from "lib/scroll_utils"
import { parseWithLineNumbers, findElementByLine, findLineAtScroll } from "lib/markdown_line_mapper"

// Preview Controller
// Handles markdown preview panel rendering, zoom, and scroll sync
// Provides setupEditorSync() and syncToCursor() for editor synchronization
// Dispatches preview:toggled and preview:zoom-changed events
// Automatically strips YAML/TOML frontmatter from preview

// Strip frontmatter (YAML or TOML) from markdown content
// YAML: starts with --- and ends with ---
// TOML: starts with +++ and ends with +++
// Returns { content, frontmatterLines } where frontmatterLines is the count of lines stripped
function stripFrontmatter(content) {
  if (!content) return { content, frontmatterLines: 0 }

  // Check for YAML frontmatter (---)
  if (content.startsWith("---")) {
    const endMatch = content.indexOf("\n---", 3)
    if (endMatch !== -1) {
      // Find the end of the closing --- line
      const afterFrontmatter = content.indexOf("\n", endMatch + 4)
      if (afterFrontmatter !== -1) {
        const frontmatter = content.slice(0, afterFrontmatter + 1)
        const frontmatterLines = frontmatter.split("\n").length
        return {
          content: content.slice(afterFrontmatter + 1).trimStart(),
          frontmatterLines
        }
      }
      // Closing --- is at end of file
      const frontmatterLines = content.split("\n").length
      return { content: "", frontmatterLines }
    }
  }

  // Check for TOML frontmatter (+++)
  if (content.startsWith("+++")) {
    const endMatch = content.indexOf("\n+++", 3)
    if (endMatch !== -1) {
      const afterFrontmatter = content.indexOf("\n", endMatch + 4)
      if (afterFrontmatter !== -1) {
        const frontmatter = content.slice(0, afterFrontmatter + 1)
        const frontmatterLines = frontmatter.split("\n").length
        return {
          content: content.slice(afterFrontmatter + 1).trimStart(),
          frontmatterLines
        }
      }
      const frontmatterLines = content.split("\n").length
      return { content: "", frontmatterLines }
    }
  }

  return { content, frontmatterLines: 0 }
}

export default class extends Controller {
  static targets = [
    "panel",
    "content",
    "zoomLevel"
  ]

  static values = {
    zoom: { type: Number, default: 100 },
    typewriterMode: { type: Boolean, default: false },
    syncScrollEnabled: { type: Boolean, default: true }
  }

  connect() {
    this.zoomLevels = [50, 75, 90, 100, 110, 125, 150, 175, 200]
    this.syncScrollTimeout = null
    this.lastScrollTarget = null
    this.scrollThreshold = 10 // Pixels - avoid jitter from micro-adjustments
    this.editorTextarea = null
    this._lastSyncedLine = null
    this._lastSyncedTotalLines = null
    this._previewRenderTimeout = null
    this._lastRenderedContent = null // Cache to skip identical content updates
    this._isUpdatingContent = false // Prevents preview scroll from syncing to editor during content updates
    this._contentUpdateTimeout = null
    this.applyZoom()
  }

  disconnect() {
    if (this.syncScrollTimeout) {
      cancelAnimationFrame(this.syncScrollTimeout)
    }
    if (this._previewRenderTimeout) {
      clearTimeout(this._previewRenderTimeout)
    }
    if (this._contentUpdateTimeout) {
      clearTimeout(this._contentUpdateTimeout)
    }
    this.editorTextarea = null
  }

  // Notify the scroll-sync controller that the preview is about to be scrolled
  // programmatically (typing, cursor jump, toggle re-sync). The scroll-sync
  // controller owns the single feedback-loop lock and marks it so the echo
  // scroll events are not synced back to the editor.
  _notifyProgrammaticScroll() {
    this.dispatch("programmatic-scroll")
  }

  // Handle scroll event on preview content - sync to editor
  // IMPORTANT: This should ONLY sync to editor when user explicitly scrolls the preview
  // It should NOT sync during content updates (editing), which would disrupt the editor
  // Echoes of programmatic scrolls are blocked by the scroll-sync controller's lock
  onPreviewScroll() {
    if (!this.syncScrollEnabledValue) return
    if (!this.isVisible) return

    // Don't sync during content updates - only explicit user scroll should sync to editor
    if (this._isUpdatingContent) return

    // Try to find the source line at current scroll position (more accurate)
    const sourceLine = this.hasContentTarget
      ? findLineAtScroll(this.contentTarget, this.contentTarget.scrollTop)
      : null

    // Dispatch event to notify app controller to sync editor
    this.dispatch("scroll", {
      detail: {
        scrollRatio: this._getPreviewScrollRatio(),
        sourceLine: sourceLine,
        totalLines: this.totalSourceLines || 0,
        typewriterMode: this.typewriterModeValue
      }
    })
  }

  // Get current scroll ratio of preview
  _getPreviewScrollRatio() {
    if (!this.hasContentTarget) return 0

    const preview = this.contentTarget
    const scrollHeight = preview.scrollHeight - preview.clientHeight

    if (scrollHeight <= 0) return 0
    return preview.scrollTop / scrollHeight
  }

  // Toggle preview panel visibility
  toggle() {
    if (!this.hasPanelTarget) return false

    const isHidden = this.panelTarget.classList.contains("hidden")
    this.panelTarget.classList.toggle("hidden", !isHidden)
    this.panelTarget.classList.toggle("flex", isHidden)
    document.body.classList.toggle("preview-visible", isHidden)

    this.dispatch("toggled", { detail: { visible: isHidden } })
    return isHidden // Returns true if now visible
  }

  // Show preview panel
  show() {
    if (!this.hasPanelTarget) return
    if (!this.panelTarget.classList.contains("hidden")) return

    this.panelTarget.classList.remove("hidden")
    this.panelTarget.classList.add("flex")
    document.body.classList.add("preview-visible")
    // Invalidate content cache to ensure fresh render when shown
    this._lastRenderedContent = null
    this.dispatch("toggled", { detail: { visible: true } })
  }

  // Hide preview panel
  hide() {
    if (!this.hasPanelTarget) return
    if (this.panelTarget.classList.contains("hidden")) return

    this.panelTarget.classList.add("hidden")
    this.panelTarget.classList.remove("flex")
    document.body.classList.remove("preview-visible")
    this.dispatch("toggled", { detail: { visible: false } })
  }

  // Check if preview is visible
  get isVisible() {
    return this.hasPanelTarget && !this.panelTarget.classList.contains("hidden")
  }

  // Render markdown content to preview
  render(markdownContent) {
    if (!this.isVisible) return
    if (!this.hasContentTarget) return

    // Mark that we're updating content - prevents preview scroll from syncing to editor
    this._isUpdatingContent = true
    if (this._contentUpdateTimeout) {
      clearTimeout(this._contentUpdateTimeout)
    }

    // Strip frontmatter (YAML/TOML) before rendering
    const { content, frontmatterLines } = stripFrontmatter(markdownContent || "")

    // Store frontmatter offset for line-based sync
    this.frontmatterLines = frontmatterLines

    // Parse with line numbers for accurate scroll sync
    this.contentTarget.innerHTML = parseWithLineNumbers(content, frontmatterLines)

    // Add copy buttons to code blocks
    this._addCodeCopyButtons()

    // Store total lines for ratio fallback
    this.totalSourceLines = (markdownContent || "").split("\n").length

    // Clear the content update flag after DOM settles and any scroll events have fired
    // Use 100ms to allow for browser scroll events triggered by DOM changes
    this._contentUpdateTimeout = setTimeout(() => {
      this._isUpdatingContent = false
    }, 100)
  }

  // Update preview with content and scroll sync
  update(markdownContent, scrollData = {}) {
    this.render(markdownContent)

    // Sync scroll after rendering
    if (scrollData.syncToCursor && scrollData.currentLine !== undefined) {
      if (scrollData.typewriterMode) {
        this.syncToTypewriter(scrollData.currentLine, scrollData.totalLines)
      } else {
        this.syncToLineSmooth(scrollData.currentLine, scrollData.totalLines)
      }
    } else if (scrollData.typewriterMode && scrollData.currentLine !== undefined) {
      this.syncToTypewriter(scrollData.currentLine, scrollData.totalLines)
    } else if (scrollData.scrollRatio !== undefined) {
      this.syncScrollRatio(scrollData.scrollRatio)
    }
  }

  // Sync scroll to line with element-aware positioning
  // Uses the same data-source-line anchors as syncScrollRatio so both paths
  // (typing and editor scrolling) resolve the same target element for a line
  syncToLineSmooth(currentLine, totalLines) {
    if (!this.syncScrollEnabledValue) return
    if (!this.isVisible) return
    if (!this.hasContentTarget) return
    if (totalLines <= 1) return

    // Notify scroll-sync that this is a programmatic scroll (typing path)
    this._notifyProgrammaticScroll()

    // Wait for DOM to fully settle after render
    if (this.syncScrollTimeout) {
      cancelAnimationFrame(this.syncScrollTimeout)
    }

    // Double RAF ensures layout is complete
    this.syncScrollTimeout = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const preview = this.contentTarget

        // Preferred path: line annotations (same anchors as the scroll path)
        const annotated = preview.querySelector("[data-source-line]")
        let targetElement = annotated ? findElementByLine(preview, currentLine) : null

        // Fallback: estimate by element-count ratio when no annotations exist
        if (!targetElement) {
          const blockElements = preview.querySelectorAll("h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, pre, hr, table, img, iframe, .video-embed")
          if (blockElements.length === 0) {
            // Fallback to ratio-based scroll
            const lineRatio = (currentLine - 1) / Math.max(totalLines - 1, 1)
            const previewScrollHeight = preview.scrollHeight - preview.clientHeight
            this._scrollPreviewTo(Math.max(0, lineRatio * previewScrollHeight))
            return
          }

          const lineRatio = (currentLine - 1) / Math.max(totalLines - 1, 1)
          const targetElementIndex = Math.min(
            Math.floor(lineRatio * blockElements.length),
            blockElements.length - 1
          )
          targetElement = blockElements[targetElementIndex]
        }

        if (!targetElement) return

        // Get element position relative to preview container (rect-based,
        // correct even when the container's ancestors are not positioned)
        const elementTop = scrollTopForElement(
          targetElement.getBoundingClientRect(),
          preview.getBoundingClientRect(),
          preview.scrollTop
        )

        // Scroll so the element is near the top (with some padding)
        this._scrollPreviewTo(Math.max(0, elementTop - 50))
      })
    })
  }

  // Smooth-scroll the preview to a target position, skipping sub-threshold changes
  _scrollPreviewTo(targetScroll) {
    const preview = this.contentTarget
    // Only scroll if change exceeds threshold (prevents jitter)
    if (this.lastScrollTarget === null ||
        Math.abs(targetScroll - this.lastScrollTarget) > this.scrollThreshold) {
      this.lastScrollTarget = targetScroll
      // Use smooth scrolling for animation
      preview.scrollTo({
        top: targetScroll,
        behavior: "smooth"
      })
    }
  }

  // Zoom in
  zoomIn() {
    const currentIndex = this.zoomLevels.indexOf(this.zoomValue)
    if (currentIndex < this.zoomLevels.length - 1) {
      this.zoomValue = this.zoomLevels[currentIndex + 1]
      this.applyZoom()
      this.dispatch("zoom-changed", { detail: { zoom: this.zoomValue } })
    }
  }

  // Zoom out
  zoomOut() {
    const currentIndex = this.zoomLevels.indexOf(this.zoomValue)
    if (currentIndex > 0) {
      this.zoomValue = this.zoomLevels[currentIndex - 1]
      this.applyZoom()
      this.dispatch("zoom-changed", { detail: { zoom: this.zoomValue } })
    }
  }

  // Apply current zoom level to preview content
  applyZoom() {
    if (this.hasContentTarget) {
      this.contentTarget.style.fontSize = `${this.zoomValue}%`
    }
    if (this.hasZoomLevelTarget) {
      this.zoomLevelTarget.textContent = `${this.zoomValue}%`
    }
  }

  // Called when zoom value changes
  zoomValueChanged() {
    this.applyZoom()
  }

  // Sync scroll based on ratio (for normal scrolling)
  // Uses line-based positioning when available for better accuracy with images/embeds.
  // An explicit sourceLine (top visible editor line) takes precedence over the
  // ratio-derived line, keeping the mapping exact (incl. frontmatter offsets).
  syncScrollRatio(scrollRatio, sourceLine = null) {
    if (!this.syncScrollEnabledValue) return
    if (!this.isVisible) return
    if (!this.hasContentTarget) return

    // Notify scroll-sync that this is a programmatic scroll (editor/toggle path)
    this._notifyProgrammaticScroll()

    // Debounce to avoid excessive updates
    if (this.syncScrollTimeout) {
      cancelAnimationFrame(this.syncScrollTimeout)
    }

    this.syncScrollTimeout = requestAnimationFrame(() => {
      const preview = this.contentTarget
      const previewScrollHeight = preview.scrollHeight - preview.clientHeight

      if (previewScrollHeight <= 0) return

      // Handle edge cases explicitly - ensure we reach exact top and bottom
      // Use small threshold (0.01) to catch floating point imprecision
      if (scrollRatio <= 0.01) {
        if (preview.scrollTop !== 0) {
          preview.scrollTop = 0
        }
        return
      }

      if (scrollRatio >= 0.99) {
        if (Math.abs(preview.scrollTop - previewScrollHeight) > 1) {
          preview.scrollTop = previewScrollHeight
        }
        return
      }

      // Try line-based sync first (more accurate with images/embeds)
      const effectiveLine = sourceLine ||
        (this.totalSourceLines > 1 ? Math.round(scrollRatio * this.totalSourceLines) + 1 : null)

      if (effectiveLine) {
        // Find the closest element with that line number
        const targetElement = findElementByLine(preview, effectiveLine)

        if (targetElement) {
          // Calculate scroll position to show target element at top.
          // Rect-based math keeps this correct even when the container's
          // ancestors are not CSS-positioned (offsetTop would be body-relative).
          const elementTop = scrollTopForElement(
            targetElement.getBoundingClientRect(),
            preview.getBoundingClientRect(),
            preview.scrollTop
          )

          // Clamp to valid scroll range
          const targetScroll = Math.max(0, Math.min(elementTop, previewScrollHeight))

          // Only scroll if change is significant (prevents jitter)
          if (Math.abs(preview.scrollTop - targetScroll) > 5) {
            preview.scrollTop = targetScroll
          }
          return
        }
      }

      // Fallback to ratio-based sync
      preview.scrollTop = scrollRatio * previewScrollHeight
    })
  }

  // Sync scroll based on line position (for cursor-based sync)
  syncToLine(linesBefore, totalLines) {
    if (!this.syncScrollEnabledValue) return
    if (!this.isVisible) return
    if (!this.hasContentTarget) return
    if (totalLines <= 1) return

    // Notify scroll-sync that this is a programmatic scroll (cursor jump)
    this._notifyProgrammaticScroll()

    const lineRatio = (linesBefore - 1) / (totalLines - 1)
    const preview = this.contentTarget
    const previewScrollHeight = preview.scrollHeight - preview.clientHeight

    if (previewScrollHeight > 0) {
      const targetScroll = lineRatio * previewScrollHeight

      preview.scrollTo({
        top: targetScroll,
        behavior: "smooth"
      })
    }
  }

  // Current top visible source line in the preview (null when unannotated)
  getTopSourceLine() {
    if (!this.hasContentTarget) return null
    return findLineAtScroll(this.contentTarget, this.contentTarget.scrollTop)
  }

  // Sync scroll in typewriter mode (center content)
  syncToTypewriter(currentLine, totalLines) {
    if (!this.syncScrollEnabledValue) return
    if (!this.hasContentTarget) return
    if (totalLines <= 1) return

    // Notify scroll-sync that this is a programmatic scroll (typing path)
    this._notifyProgrammaticScroll()

    // Wait for DOM to fully settle after render
    if (this.syncScrollTimeout) {
      cancelAnimationFrame(this.syncScrollTimeout)
    }

    // Double RAF ensures layout is complete
    this.syncScrollTimeout = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const preview = this.contentTarget
        const lineRatio = (currentLine - 1) / (totalLines - 1)

        // In typewriter mode, preview has bottom padding
        const style = window.getComputedStyle(preview)
        const paddingBottom = parseFloat(style.paddingBottom) || 0
        const actualContentHeight = preview.scrollHeight - paddingBottom

        // Position in the actual content based on line ratio
        const contentPosition = lineRatio * actualContentHeight

        // Center content at 50% of visible area
        const targetY = preview.clientHeight * 0.5
        const desiredScroll = Math.max(0, contentPosition - targetY)

        // Only scroll if change exceeds threshold (prevents jitter)
        if (this.lastScrollTarget === null ||
            Math.abs(desiredScroll - this.lastScrollTarget) > this.scrollThreshold) {
          this.lastScrollTarget = desiredScroll
          // Use smooth scrolling for animation
          preview.scrollTo({
            top: desiredScroll,
            behavior: "smooth"
          })
        }
      })
    })
  }

  // Add copy buttons to all code blocks in the preview
  _addCodeCopyButtons() {
    if (!this.hasContentTarget) return

    this.contentTarget.querySelectorAll("pre").forEach(pre => {
      const code = pre.querySelector("code")
      if (!code) return

      pre.style.position = "relative"

      const btn = document.createElement("button")
      btn.className = "code-copy-btn"
      btn.type = "button"
      btn.title = "Copy code"
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`

      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(code.textContent).then(() => {
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
          btn.classList.add("copied")
          setTimeout(() => {
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
            btn.classList.remove("copied")
          }, 2000)
        })
      })

      pre.appendChild(btn)
    })
  }

  // Toggle typewriter mode styling on preview
  setTypewriterMode(enabled) {
    this.typewriterModeValue = enabled
    if (this.hasContentTarget) {
      this.contentTarget.classList.toggle("preview-typewriter-mode", enabled)
    }
  }

  // Setup editor synchronization - store reference to textarea and add scroll listeners
  setupEditorSync(textarea) {
    this.editorTextarea = textarea
  }

  // Sync preview scroll to cursor position in editor
  syncToCursor() {
    if (!this.syncScrollEnabledValue) return
    if (!this.isVisible) return
    if (!this.editorTextarea) return

    const textarea = this.editorTextarea
    const content = textarea.value
    const cursorPos = textarea.selectionStart

    const textBeforeCursor = content.substring(0, cursorPos)
    const linesBefore = textBeforeCursor.split("\n").length
    const totalLines = content.split("\n").length

    this.syncToLine(linesBefore, totalLines)
  }

  // Update preview with content and sync scroll to cursor
  // This is called during typing - only syncs when line changes
  updateWithSync(content, options = {}) {
    if (!this.isVisible) return

    const cursorPos = options.cursorPos || 0
    const typewriterMode = options.typewriterMode || false

    // Calculate cursor line info
    const textBeforeCursor = content.substring(0, cursorPos)
    const currentLine = textBeforeCursor.split("\n").length
    const totalLines = content.split("\n").length

    // Only sync scroll when line changes (prevents jitter from typing on same line)
    const lineChanged = this._lastSyncedLine !== currentLine ||
                        this._lastSyncedTotalLines !== totalLines

    // Debounce preview render to reduce DOM thrashing
    if (this._previewRenderTimeout) {
      clearTimeout(this._previewRenderTimeout)
    }

    this._previewRenderTimeout = setTimeout(() => {
      // Skip if content hasn't changed (avoids redundant DOM updates)
      if (content === this._lastRenderedContent) {
        // Still sync scroll if line changed
        if (lineChanged) {
          if (typewriterMode) {
            this.syncToTypewriter(currentLine, totalLines)
          } else {
            this.syncToLineSmooth(currentLine, totalLines)
          }
          this._lastSyncedLine = currentLine
          this._lastSyncedTotalLines = totalLines
        }
        return
      }

      this._lastRenderedContent = content

      // Build scroll data - only sync scroll if line changed
      const scrollData = {
        typewriterMode,
        currentLine,
        totalLines,
        syncToCursor: lineChanged
      }

      this.update(content, scrollData)

      if (lineChanged) {
        this._lastSyncedLine = currentLine
        this._lastSyncedTotalLines = totalLines
      }
    }, 150) // Debounce preview render to reduce DOM thrashing
  }

  // Sync preview scroll in typewriter mode based on visible content
  syncScrollTypewriter(textarea) {
    if (!this.syncScrollEnabledValue) return
    if (!this.isVisible) return
    if (!textarea) return

    const content = textarea.value
    const totalLines = content.split("\n").length

    // Calculate which line is at the center of visible area using utility function
    const centerLine = calculateLineFromScroll(
      textarea.scrollTop,
      textarea.clientHeight,
      textarea.scrollHeight,
      totalLines
    )

    this.syncToTypewriter(centerLine, totalLines)
  }

  // Sync scroll from editor scroll event (normal mode - ratio based)
  syncFromEditorScroll(textarea) {
    if (!this.syncScrollEnabledValue) return
    if (!this.isVisible) return
    if (!textarea) return

    const scrollTop = textarea.scrollTop
    const scrollHeight = textarea.scrollHeight - textarea.clientHeight

    if (scrollHeight <= 0) return

    const scrollRatio = scrollTop / scrollHeight
    this.syncScrollRatio(scrollRatio)
  }
}
