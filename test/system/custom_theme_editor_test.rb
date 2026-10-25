# frozen_string_literal: true

require "application_system_test_case"

class CustomThemeEditorTest < ApplicationSystemTestCase
  test "creates a theme with live preview and persists it without modifying the note" do
    create_test_note("theme-note.md", "# Theme note\n\nOriginal content")
    @test_notes_dir.join(".fed").write("theme = dark\n")
    visit note_url(path: "theme-note.md")
    assert_selector ".cm-content", text: "Original content"
    open_theme_editor
    within "dialog.custom-theme-editor[open]" do
      fill_in "Theme name", with: "Reference palette"
      fill_in "Accent", with: "#5b8cff"
      fill_in "Background", with: "#101010"
      fill_in "Text", with: "#ffffff"
      assert_selector '[data-custom-theme-editor-target="contrast"]', text: "Low contrast"
      assert_equal "#5b8cff", current_color("accent")
      find("summary").click
      assert_equal "#f0e68c", find_field("Code functions").value
      fill_in "Code keywords", with: "#ffcc66"
      assert_equal "#ffcc66", current_color("syntax-keyword")
      find("summary").click
      page.execute_script("document.querySelector('.custom-theme-body').scrollTop = 0")
      page.save_screenshot(Rails.root.join("tmp/capybara/custom-theme-editor-desktop.png"))
      click_button "Save"
    end
    assert_no_selector "dialog.custom-theme-editor[open]"
    assert_selector '[data-theme-target="currentTheme"]', text: "Reference palette"
    assert_equal "custom", Config.new.get("theme")
    assert_equal "#5b8cff", Config.new.get("custom_theme").dig("colors", "accent")
    assert_equal "# Theme note\n\nOriginal content", @test_notes_dir.join("theme-note.md").read

    visit note_url(path: "theme-note.md")
    assert_selector ".cm-content", text: "Original content"
    assert_equal "#5b8cff", current_color("accent")
    open_theme_editor
    within "dialog.custom-theme-editor[open]" do
      fill_in "Accent", with: "#ff0000"
    end
    assert_equal "#ff0000", current_color("accent")
    page.driver.browser.action.send_keys(:escape).perform
    assert_no_selector "dialog.custom-theme-editor[open]"
    assert_selector '[data-action="click->theme#openCustomEditor"]:focus'
    assert_selector 'html[style*="--theme-accent: #5b8cff"]'
    assert_equal "#5b8cff", current_color("accent")
    wait_for_tree_refresh("theme-note.md")
  end

  test "mobile editor keeps controls reachable and validates colors" do
    page.driver.browser.manage.window.resize_to(390, 844)
    visit root_url
    open_theme_editor
    within "dialog.custom-theme-editor[open]" do
      fill_in "Accent", with: "#bad"
      assert_button "Save", disabled: true
      assert_text "six-digit hex"
      fill_in "Accent", with: "#112233"
      assert_button "Save", disabled: false
      page.save_screenshot(Rails.root.join("tmp/capybara/custom-theme-editor-mobile.png"))
      find("summary").click
      fill_in "Code comments", with: "#aabbcc"
      assert_button "Save", disabled: false
      assert_no_text "Translation missing"
    end
    size = page.evaluate_script(<<~JS)
      (() => {
        const rect = document.querySelector('dialog.custom-theme-editor').getBoundingClientRect();
        return { width: rect.width, height: rect.height, pageWidth: document.documentElement.scrollWidth };
      })()
    JS
    assert_operator size.fetch("width"), :<=, 390
    assert_operator size.fetch("height"), :<=, 844
    assert_operator size.fetch("pageWidth"), :<=, 390
    page.driver.browser.action.send_keys(:escape).perform
    assert_no_selector "dialog.custom-theme-editor[open]"
    assert_nil Config.new.get("custom_theme")
  ensure
    page.driver.browser.manage.window.resize_to(1400, 900)
  end

  private

  def open_theme_editor
    unless page.has_selector?('[data-app-target="settingsToggle"]', wait: 0)
      find('[data-app-target="sidebarOpen"]').click
    end
    find('[data-app-target="settingsToggle"]').click
    find('[data-action="click->theme#openCustomEditor"]').click
    assert_selector "dialog.custom-theme-editor[open]"
  end

  def current_color(key)
    page.evaluate_script("getComputedStyle(document.documentElement).getPropertyValue(arguments[0]).trim()", "--theme-#{key}")
  end
end
