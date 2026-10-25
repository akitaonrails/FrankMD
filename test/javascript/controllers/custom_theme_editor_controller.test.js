/**
 * @vitest-environment jsdom
 */
import { Application } from "@hotwired/stimulus"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import ThemeController from "../../../app/javascript/controllers/theme_controller"
import CustomThemeEditorController from "../../../app/javascript/controllers/custom_theme_editor_controller"

describe("visual theme editor", () => {
  let application, editor, theme, dialog

  beforeEach(async () => {
    window.matchMedia = vi.fn(() => ({ matches: true }))
    document.head.innerHTML = `<style>
      :root { --theme-bg-primary:#111111; --theme-text-primary:#ffffff; --theme-accent:#112233; --theme-accent-text:#ffffff; }
      [data-theme="light"] { --theme-bg-primary:#ffffff; --theme-text-primary:#111111; }
    </style>`
    document.body.innerHTML = `<div data-controller="theme" data-theme-initial-value="dark"><button id="customize">Customize</button><span data-theme-target="currentTheme"></span><div data-theme-target="menu"></div></div>
      <dialog data-controller="custom-theme-editor" data-custom-theme-editor-theme-outlet='[data-controller="theme"]' data-custom-theme-editor-default-name-value="My theme" data-custom-theme-editor-invalid-value="Invalid color" data-custom-theme-editor-error-value="Save failed" data-custom-theme-editor-warning-value="Low contrast %{ratio}" data-action="close->custom-theme-editor#onClose">
        <fieldset data-custom-theme-editor-target="form"><input data-custom-theme-editor-target="name"><select data-custom-theme-editor-target="base"></select>
        ${["accent", "bg-primary", "text-primary"].map(key => `<input data-custom-theme-editor-target="hex" data-key="${key}"><input type="color" data-custom-theme-editor-target="color" data-key="${key}">`).join("")}</fieldset>
        <p data-custom-theme-editor-target="contrast"></p><p data-custom-theme-editor-target="status"></p><button data-custom-theme-editor-target="save">Save</button><button>Cancel</button>
      </dialog>`
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    dialog = document.querySelector("dialog")
    dialog.showModal = vi.fn(() => { dialog.open = true })
    dialog.close = vi.fn(() => { dialog.open = false; dialog.dispatchEvent(new Event("close")) })
    application = Application.start()
    application.register("theme", ThemeController)
    application.register("custom-theme-editor", CustomThemeEditorController)
    await vi.waitFor(() => {
      editor = application.getControllerForElementAndIdentifier(dialog, "custom-theme-editor")
      theme = application.getControllerForElementAndIdentifier(document.querySelector("[data-controller=theme]"), "theme")
      expect(editor?.hasThemeOutlet).toBe(true)
    })
  })

  afterEach(() => {
    application.unload("custom-theme-editor", "theme")
    application.stop()
    vi.restoreAllMocks()
    document.documentElement.removeAttribute("data-theme")
    document.documentElement.classList.remove("dark")
  })

  function color(key, value) {
    const input = editor.hexTargets.find(input => input.dataset.key === key)
    input.value = value
    editor.onColor({ currentTarget: input })
  }

  it("previews without persistence and Cancel restores the prior palette and focus", () => {
    editor.open(document.getElementById("customize"))
    color("accent", "#abcdef")
    expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("#abcdef")
    expect(global.fetch.mock.calls.filter(([url]) => url === "/config")).toHaveLength(0)
    editor.close()
    expect(theme.currentThemeId).toBe("dark")
    expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("")
    expect(document.activeElement.id).toBe("customize")
  })

  it("rejects invalid hex, warns on contrast, and Reset inherits base colors", () => {
    editor.open()
    color("accent", "url(evil)")
    expect(editor.saveTarget.disabled).toBe(true)
    expect(editor.statusTarget.textContent).toBe("Invalid color")
    color("accent", "#112233")
    color("text-primary", "#111111")
    expect(editor.contrastTarget.textContent).toContain("1.00")
    editor.reset()
    expect(editor.draft.colors).toEqual({})
    expect(editor.saveTarget.disabled).toBe(false)
    expect(editor.contrastTarget.textContent).toBe("")
    editor.baseTarget.value = "light"
    editor.onBase()
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("keeps a failed save editable and retries a single atomic configuration update", async () => {
    editor.open()
    color("accent", "#aabbcc")
    global.fetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await editor.save({ preventDefault() {} })
    expect(dialog.open).toBe(true)
    expect(editor.statusTarget.textContent).toBe("Save failed")
    expect(editor.formTarget.disabled).toBe(false)
    const saved = JSON.parse(JSON.stringify(editor.draft))
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { theme: "custom", custom_theme: saved } }) })
    await editor.save({ preventDefault() {} })
    expect(dialog.open).toBe(false)
    expect(theme.currentThemeId).toBe("custom")
    expect(theme.customValue.colors.accent).toBe("#aabbcc")
    const calls = global.fetch.mock.calls.filter(([url]) => url === "/config")
    const body = JSON.parse(calls.at(-1)[1].body)
    expect(body.theme).toBe("custom")
    expect(JSON.parse(body.custom_theme)).toEqual(saved)
  })
})
