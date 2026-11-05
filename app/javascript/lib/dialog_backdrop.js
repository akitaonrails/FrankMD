// On mobile, tapping a modal dialog's backdrop dismisses it the way Escape
// does: a cancelable "cancel" event first, so dialogs that must stay open
// (or that finish themselves on cancel) keep control, then close().

export const MOBILE_MAX_WIDTH = 767

export function isBackdropClick(dialog, event) {
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open || event.target !== dialog) return false
  const rect = dialog.getBoundingClientRect()
  return event.clientX < rect.left || event.clientX > rect.right ||
    event.clientY < rect.top || event.clientY > rect.bottom
}

export function dismissDialog(dialog) {
  const cancel = new Event("cancel", { cancelable: true })
  if (dialog.dispatchEvent(cancel) && dialog.open) dialog.close()
}

export function installMobileBackdropDismiss(root = document) {
  const handler = (event) => {
    if (window.innerWidth > MOBILE_MAX_WIDTH) return
    // Dialogs with their own backdrop handler have already closed by now.
    if (isBackdropClick(event.target, event)) dismissDialog(event.target)
  }
  root.addEventListener("click", handler)
  return () => root.removeEventListener("click", handler)
}
