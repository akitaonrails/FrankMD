// Shared drag-and-drop dropzone highlight helpers, used by the image and video
// Drop tabs so their behavior — and the highlight class list — stay in sync.

const HIGHLIGHT_CLASSES = ["border-[var(--theme-accent)]", "bg-[var(--theme-bg-tertiary)]"]

export function highlightDropzone(el) {
  if (el) el.classList.add(...HIGHLIGHT_CLASSES)
}

// Remove the highlight — but not when the pointer merely moved onto a child
// element of the dropzone. `dragleave` fires when entering a child, so without
// this guard the highlight flickers as the cursor moves over the icon/text.
export function unhighlightDropzone(el, relatedTarget = null) {
  if (!el) return
  if (relatedTarget && el.contains(relatedTarget)) return
  el.classList.remove(...HIGHLIGHT_CLASSES)
}
