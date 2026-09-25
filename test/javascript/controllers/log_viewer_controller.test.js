/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Application } from "@hotwired/stimulus"
import LogViewerController from "../../../app/javascript/controllers/log_viewer_controller"

describe("LogViewerController", () => {
  let application
  let container
  let controller
  let originalTranslator

  beforeEach(() => {
    originalTranslator = window.t
    const translations = {
      "dialogs.log_viewer.title_logs": "Rails Log",
      "dialogs.log_viewer.title_config": "Configuration",
      "dialogs.log_viewer.refresh": "Refresh",
      "dialogs.log_viewer.close": "Close (Esc)",
      "dialogs.log_viewer.logs": "Logs",
      "dialogs.log_viewer.config": "Config",
      "dialogs.log_viewer.loading": "Loading...",
      "dialogs.log_viewer.empty_logs": "(log is empty)",
      "dialogs.log_viewer.line_count_one": "%{count} line",
      "dialogs.log_viewer.line_count": "%{count} lines",
      "dialogs.log_viewer.error_loading_logs": "Error loading logs: %{error}",
      "dialogs.log_viewer.no_config_file": "(no .fed file)",
      "dialogs.log_viewer.key_count": "%{count} keys",
      "dialogs.log_viewer.key_count_one": "%{count} key",
      "dialogs.log_viewer.error_loading_config": "Error loading config: %{error}",
      "dialogs.log_viewer.config_file_label": "Config file",
      "dialogs.log_viewer.file_exists_label": "File exists",
      "dialogs.log_viewer.ai_configured_label": "AI configured in .fed",
      "dialogs.log_viewer.yes": "yes",
      "dialogs.log_viewer.no": "no",
      "dialogs.log_viewer.ai_configured_yes": "yes (ENV AI vars ignored)",
      "dialogs.log_viewer.ai_configured_no": "no (using ENV vars)",
      "dialogs.log_viewer.key": "Key",
      "dialogs.log_viewer.value": "Value",
      "dialogs.log_viewer.source": "Source",
      "dialogs.log_viewer.env_var": "ENV var",
      "dialogs.log_viewer.source_default": "default",
      "dialogs.log_viewer.null_value": "nil",
      "dialogs.log_viewer.empty_config": "No configuration values"
    }
    window.t = vi.fn((key, options = {}) => (translations[key] || key).replace(/%\{(\w+)\}/g, (match, name) => options[name] ?? match))

    // Setup DOM
    document.body.innerHTML = `
      <div data-controller="log-viewer">
        <dialog data-log-viewer-target="dialog">
          <h2 data-log-viewer-target="title">Rails Log</h2>
          <div data-log-viewer-target="environment"></div>
          <div data-log-viewer-target="status"></div>
          <button data-log-viewer-target="tabLogs" data-action="click->log-viewer#showLogs">Logs</button>
          <button data-log-viewer-target="tabConfig" data-action="click->log-viewer#showConfig">Config</button>
          <pre data-log-viewer-target="content"></pre>
          <div data-log-viewer-target="configContent" class="hidden"></div>
        </dialog>
      </div>
    `

    // Mock dialog methods
    HTMLDialogElement.prototype.showModal = vi.fn()
    HTMLDialogElement.prototype.close = vi.fn()

    container = document.querySelector('[data-controller="log-viewer"]')

    // Setup Stimulus
    application = Application.start()
    application.register("log-viewer", LogViewerController)

    // Get controller instance (needs to wait for Stimulus to initialize)
    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(container, "log-viewer")
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    application.stop()
    document.body.innerHTML = ""
    if (originalTranslator) window.t = originalTranslator
    else delete window.t
  })

  // Note: Keyboard shortcut (Ctrl+Shift+O) is now handled by app_controller
  // Tests for keyboard shortcuts are in the app_controller/keyboard_shortcuts tests

  describe("open", () => {
    it("shows the dialog", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ environment: "test", file: "test.log", lines: ["line1"] })
      })
      const dialog = container.querySelector('[data-log-viewer-target="dialog"]')

      await controller.open()

      expect(dialog.showModal).toHaveBeenCalled()
    })

    it("shows loading state initially", async () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
      const content = container.querySelector('[data-log-viewer-target="content"]')

      controller.open()

      expect(content.textContent).toBe("Loading...")
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.loading")
    })

    it("defaults to logs tab", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ environment: "test", file: "test.log", lines: ["line1"] })
      })

      await controller.open()

      expect(controller.activeTab).toBe("logs")
    })
  })

  describe("fetchLogs", () => {
    it("fetches logs from server", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          environment: "development",
          file: "development.log",
          lines: ["line 1", "line 2", "line 3"]
        })
      })

      await controller.fetchLogs()

      expect(global.fetch).toHaveBeenCalledWith("/logs/tail?lines=100", expect.any(Object))
    })

    it("displays environment and file name", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          environment: "production",
          file: "production.log",
          lines: []
        })
      })
      const envTarget = container.querySelector('[data-log-viewer-target="environment"]')

      await controller.fetchLogs()

      expect(envTarget.textContent).toBe("production - production.log")
    })

    it("displays log lines", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          environment: "test",
          file: "test.log",
          lines: ["First line", "Second line", "Third line"]
        })
      })
      const content = container.querySelector('[data-log-viewer-target="content"]')

      await controller.fetchLogs()

      expect(content.textContent).toBe("First line\nSecond line\nThird line")
    })

    it("shows empty message for empty log", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          environment: "test",
          file: "test.log",
          lines: []
        })
      })
      const content = container.querySelector('[data-log-viewer-target="content"]')

      await controller.fetchLogs()

      expect(content.textContent).toBe("(log is empty)")
    })

    it("displays line count in status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          environment: "test",
          file: "test.log",
          lines: ["a", "b", "c", "d", "e"]
        })
      })
      const status = container.querySelector('[data-log-viewer-target="status"]')

      await controller.fetchLogs()

      expect(status.textContent).toBe("5 lines")
    })

    it("uses the singular line count label", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          environment: "test",
          file: "test.log",
          lines: ["one line"]
        })
      })
      const status = container.querySelector('[data-log-viewer-target="status"]')

      await controller.fetchLogs()

      expect(status.textContent).toBe("1 line")
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.line_count_one", { count: 1 })
    })

    it("handles fetch errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))
      const content = container.querySelector('[data-log-viewer-target="content"]')

      await controller.fetchLogs()

      expect(content.textContent).toContain("Error loading logs")
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.error_loading_logs", { error: "Network error" })
    })

    it("handles non-ok response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })
      const content = container.querySelector('[data-log-viewer-target="content"]')

      await controller.fetchLogs()

      expect(content.textContent).toContain("Error loading logs")
    })
  })

  describe("fetchConfig", () => {
    it("fetches config from server", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: true,
          ai_configured_in_file: false,
          environment: "test",
          entries: [
            { key: "theme", value: "dark", source: "file", env_var: null, sensitive: false }
          ]
        })
      })

      await controller.fetchConfig()

      expect(global.fetch).toHaveBeenCalledWith("/logs/config", expect.any(Object))
    })

    it("displays config entries in table", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: true,
          ai_configured_in_file: false,
          environment: "test",
          entries: [
            { key: "theme", value: "dark", source: "file", env_var: null, sensitive: false },
            { key: "locale", value: "en", source: "default", env_var: "FRANKMD_LOCALE", sensitive: false }
          ]
        })
      })
      const configContent = container.querySelector('[data-log-viewer-target="configContent"]')

      await controller.fetchConfig()

      expect(configContent.innerHTML).toContain("theme")
      expect(configContent.innerHTML).toContain("dark")
      expect(configContent.innerHTML).toContain(".fed")
      expect(configContent.innerHTML).toContain("default")
    })

    it("shows key count in status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: true,
          ai_configured_in_file: false,
          environment: "test",
          entries: [
            { key: "theme", value: null, source: "default", env_var: null, sensitive: false },
            { key: "locale", value: "en", source: "default", env_var: "FRANKMD_LOCALE", sensitive: false }
          ]
        })
      })
      const status = container.querySelector('[data-log-viewer-target="status"]')

      await controller.fetchConfig()

      expect(status.textContent).toBe("2 keys")
    })

    it("uses the singular key count label", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: true,
          ai_configured_in_file: false,
          environment: "test",
          entries: [{ key: "theme", value: "dark", source: "file", env_var: null, sensitive: false }]
        })
      })
      const status = container.querySelector('[data-log-viewer-target="status"]')

      await controller.fetchConfig()

      expect(status.textContent).toBe("1 key")
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.key_count_one", { count: 1 })
    })

    it("localizes config labels and shows an empty state when there are no entries", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: false,
          ai_configured_in_file: true,
          environment: "test",
          entries: []
        })
      })
      const configContent = container.querySelector('[data-log-viewer-target="configContent"]')

      await controller.fetchConfig()

      expect(configContent.textContent).toContain("Config file:")
      expect(configContent.textContent).toContain("File exists:")
      expect(configContent.textContent).toContain("AI configured in .fed:")
      expect(configContent.textContent).toContain("No configuration values")
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.empty_config", {})
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.no_config_file")
    })

    it("handles fetch errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))
      const configContent = container.querySelector('[data-log-viewer-target="configContent"]')

      await controller.fetchConfig()

      expect(configContent.textContent).toContain("Error loading config")
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.error_loading_config", { error: "Network error" })
    })
  })

  describe("tab switching", () => {
    it("localizes config loading state", () => {
      controller.activeTab = "config"

      controller.showLoading()

      expect(controller.configContentTarget.textContent).toBe("Loading...")
      expect(window.t).toHaveBeenCalledWith("dialogs.log_viewer.loading")
    })

    it("showLogs reveals log content and hides config", () => {
      const content = container.querySelector('[data-log-viewer-target="content"]')
      const configContent = container.querySelector('[data-log-viewer-target="configContent"]')

      // First switch to config
      content.classList.add("hidden")
      configContent.classList.remove("hidden")

      controller.showLogs()

      expect(content.classList.contains("hidden")).toBe(false)
      expect(configContent.classList.contains("hidden")).toBe(true)
      expect(controller.activeTab).toBe("logs")
    })

    it("showConfig reveals config content and hides logs", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: true,
          ai_configured_in_file: false,
          environment: "test",
          entries: []
        })
      })
      const content = container.querySelector('[data-log-viewer-target="content"]')
      const configContent = container.querySelector('[data-log-viewer-target="configContent"]')

      await controller.showConfig()

      expect(content.classList.contains("hidden")).toBe(true)
      expect(configContent.classList.contains("hidden")).toBe(false)
      expect(controller.activeTab).toBe("config")
    })

    it("showConfig updates title", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: true,
          ai_configured_in_file: false,
          environment: "test",
          entries: []
        })
      })
      const title = container.querySelector('[data-log-viewer-target="title"]')

      await controller.showConfig()

      expect(title.textContent).toBe("Configuration")
    })

    it("showLogs updates title", () => {
      const title = container.querySelector('[data-log-viewer-target="title"]')
      title.textContent = "Configuration"

      controller.showLogs()

      expect(title.textContent).toBe("Rails Log")
    })
  })

  describe("refresh", () => {
    it("refreshes logs when on logs tab", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ environment: "test", file: "test.log", lines: ["new line"] })
      })
      controller.activeTab = "logs"

      await controller.refresh()

      expect(global.fetch).toHaveBeenCalledWith("/logs/tail?lines=100", expect.any(Object))
    })

    it("refreshes config when on config tab", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          config_file: "/notes/.fed",
          config_file_exists: true,
          ai_configured_in_file: false,
          environment: "test",
          entries: []
        })
      })
      controller.activeTab = "config"

      await controller.refresh()

      expect(global.fetch).toHaveBeenCalledWith("/logs/config", expect.any(Object))
    })
  })

  describe("close", () => {
    it("closes the dialog", () => {
      const dialog = container.querySelector('[data-log-viewer-target="dialog"]')

      controller.close()

      expect(dialog.close).toHaveBeenCalled()
    })
  })

  describe("dialog interactions", () => {
    it("closes on backdrop click", () => {
      const dialog = container.querySelector('[data-log-viewer-target="dialog"]')
      const closeSpy = vi.spyOn(controller, "close")

      const event = { target: dialog }
      controller.onDialogClick(event)

      expect(closeSpy).toHaveBeenCalled()
    })

    it("does not close when clicking inside dialog", () => {
      const content = container.querySelector('[data-log-viewer-target="content"]')
      const closeSpy = vi.spyOn(controller, "close")

      const event = { target: content }
      controller.onDialogClick(event)

      expect(closeSpy).not.toHaveBeenCalled()
    })

    it("closes on Escape key", () => {
      const closeSpy = vi.spyOn(controller, "close")

      const event = { key: "Escape" }
      controller.onKeydown(event)

      expect(closeSpy).toHaveBeenCalled()
    })
  })

  // Note: disconnect() no longer needed as keyboard handling moved to app_controller
})
