let activePrompt = null
const promptQueue = []

function translation(key) {
  return typeof window.t === "function" ? window.t(key) : key
}

function createButton(label, primary, destructive) {
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = label
  button.className = primary
    ? destructive
      ? "px-3 py-1.5 text-sm rounded-md bg-[var(--theme-error)] text-[var(--theme-accent-text)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
      : "px-3 py-1.5 text-sm rounded-md bg-[var(--theme-accent)] text-[var(--theme-accent-text)] hover:bg-[var(--theme-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
    : "px-3 py-1.5 text-sm rounded-md hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
  return button
}

function finishPrompt(prompt, result) {
  if (activePrompt !== prompt) return

  activePrompt = null
  prompt.dialog.remove()
  prompt.resolve(result)
  queueMicrotask(showNextPrompt)
}

function showNextPrompt() {
  if (activePrompt || promptQueue.length === 0) return

  const prompt = promptQueue.shift()
  if (!document.body) {
    prompt.resolve(prompt.confirm ? false : undefined)
    showNextPrompt()
    return
  }

  const dialog = document.createElement("dialog")
  dialog.className = "p-0 rounded-lg shadow-xl backdrop:bg-black/50 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] w-[360px] max-w-[90vw]"
  dialog.setAttribute("aria-labelledby", "app-prompt-title")
  dialog.setAttribute("aria-describedby", "app-prompt-message")
  dialog.setAttribute("role", "alertdialog")

  const content = document.createElement("div")
  content.className = "p-4 text-[var(--theme-text-primary)]"

  const title = document.createElement("h2")
  title.id = "app-prompt-title"
  title.className = "text-sm font-semibold mb-3"
  title.textContent = translation(prompt.confirm ? "common.confirm" : "common.alert")

  const message = document.createElement("p")
  message.id = "app-prompt-message"
  message.className = "text-sm text-[var(--theme-text-secondary)] whitespace-pre-wrap break-words"
  message.textContent = prompt.message

  const actions = document.createElement("div")
  actions.className = "flex justify-end gap-2 mt-4"

  if (prompt.confirm) {
    const cancelButton = createButton(prompt.cancelLabel, false, false)
    cancelButton.addEventListener("click", () => finishPrompt(prompt, false))
    actions.append(cancelButton)
  }

  const acceptButton = createButton(prompt.acceptLabel, true, prompt.destructive)
  acceptButton.addEventListener("click", () => finishPrompt(prompt, prompt.confirm ? true : undefined))
  actions.append(acceptButton)
  content.append(title, message, actions)
  dialog.append(content)

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault()
    finishPrompt(prompt, false)
  })

  prompt.dialog = dialog
  activePrompt = prompt
  document.body.append(dialog)
  dialog.showModal()
  ;(prompt.confirm ? actions.firstElementChild : acceptButton).focus()
}

function enqueuePrompt(message, { confirm = false, acceptLabel, cancelLabel, destructive = false } = {}) {
  return new Promise((resolve) => {
    promptQueue.push({
      message: String(message ?? ""),
      confirm,
      acceptLabel: acceptLabel || translation(confirm ? "common.confirm" : "common.ok"),
      cancelLabel: cancelLabel || translation("common.cancel"),
      destructive,
      resolve
    })
    showNextPrompt()
  })
}

export function appAlert(message) {
  return enqueuePrompt(message)
}

export function appConfirm(message, options = {}) {
  return enqueuePrompt(message, { ...options, confirm: true })
}
