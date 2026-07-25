import { Controller } from "@hotwired/stimulus"

// Help Controller
// Manages help and about dialogs with tabbed content

export default class extends Controller {
  static targets = [
    "helpDialog",
    "aboutDialog",
    "tabMarkdown",
    "tabShortcuts",
    "tabVim",
    "panelMarkdown",
    "panelShortcuts",
    "panelVim"
  ]

  connect() {
    // Setup click-outside-to-close for dialogs
    this.setupDialogClickOutside()
    this.currentTab = "markdown"
  }

  setupDialogClickOutside() {
    const dialogs = [this.helpDialogTarget, this.aboutDialogTarget].filter(d => d)

    dialogs.forEach(dialog => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          dialog.close()
        }
      })
    })
  }

  // Open help dialog
  openHelp() {
    if (this.hasHelpDialogTarget) {
      this.currentTab = "markdown"
      this.updateTabStyles()
      this.helpDialogTarget.showModal()
    }
  }

  // Switch tab from click event
  switchTab(event) {
    const tab = event.currentTarget.dataset.tab
    this.switchToTab(tab)
  }

  // Internal method to switch tabs by name
  switchToTab(tab) {
    this.currentTab = tab
    this.updateTabStyles()
  }

  // Update tab button and panel visibility (data-driven over getTabOrder).
  updateTabStyles() {
    const activeClasses = "bg-[var(--theme-accent)] text-[var(--theme-accent-text)]"
    const inactiveClasses = "hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]"

    for (const tab of this.getTabOrder()) {
      const cap = tab.charAt(0).toUpperCase() + tab.slice(1)
      const btn = this[`hasTab${cap}Target`] ? this[`tab${cap}Target`] : null
      const panel = this[`hasPanel${cap}Target`] ? this[`panel${cap}Target`] : null
      if (btn) {
        btn.className = `px-3 py-1 text-sm rounded-md ${tab === this.currentTab ? activeClasses : inactiveClasses}`
      }
      if (panel) {
        panel.classList.toggle("hidden", tab !== this.currentTab)
      }
    }
  }

  // Get ordered list of tab names
  getTabOrder() {
    return ["markdown", "shortcuts", "vim"]
  }

  // Handle arrow key navigation on tab buttons
  onTabKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

    event.preventDefault()
    const tabs = this.getTabOrder()
    const currentIndex = tabs.indexOf(this.currentTab)

    let newIndex
    if (event.key === "ArrowRight") {
      newIndex = (currentIndex + 1) % tabs.length
    } else {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length
    }

    this.switchToTab(tabs[newIndex])
    this.focusTab(tabs[newIndex])
  }

  // Focus the tab button for a given tab name
  focusTab(tabName) {
    const cap = tabName.charAt(0).toUpperCase() + tabName.slice(1)
    if (this[`hasTab${cap}Target`]) {
      this[`tab${cap}Target`].focus()
    }
  }

  // Handle mouse wheel on tab bar to switch tabs
  onTabWheel(event) {
    event.preventDefault()
    const tabs = this.getTabOrder()
    const currentIndex = tabs.indexOf(this.currentTab)

    let newIndex
    if (event.deltaY > 0 || event.deltaX > 0) {
      // Scroll down/right -> next tab
      newIndex = (currentIndex + 1) % tabs.length
    } else {
      // Scroll up/left -> previous tab
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length
    }

    this.switchToTab(tabs[newIndex])
  }

  // Close help dialog
  closeHelp() {
    if (this.hasHelpDialogTarget) {
      this.helpDialogTarget.close()
    }
  }

  // Open about dialog
  openAbout() {
    if (this.hasAboutDialogTarget) {
      this.aboutDialogTarget.showModal()
    }
  }

  // Close about dialog
  closeAbout() {
    if (this.hasAboutDialogTarget) {
      this.aboutDialogTarget.close()
    }
  }

  // Handle escape key for closing dialogs
  onKeydown(event) {
    if (event.key === "Escape") {
      if (this.hasHelpDialogTarget && this.helpDialogTarget.open) {
        this.helpDialogTarget.close()
      }
      if (this.hasAboutDialogTarget && this.aboutDialogTarget.open) {
        this.aboutDialogTarget.close()
      }
    }
  }
}
