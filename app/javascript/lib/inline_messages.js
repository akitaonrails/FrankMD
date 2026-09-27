export function showInlineError(element, message) {
  if (!element) return
  element.textContent = String(message ?? "")
  element.classList.remove("hidden")
}

export function clearInlineError(element) {
  if (!element) return
  element.textContent = ""
  element.classList.add("hidden")
}
