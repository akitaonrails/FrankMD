# frozen_string_literal: true

require "application_system_test_case"

class WorkspaceTest < ApplicationSystemTestCase
  test "empty and missing documents cannot be renamed while Help remains accessible" do
    visit root_url
    assert_selector "[data-app-target='documentTitle'][disabled]"
    find("[data-app-target='overflowToggle']").click
    assert_selector "#workspace-menu [role='menuitem']", count: 2
    visit note_url(path: "missing.md")
    assert_selector "[data-app-target='documentTitle'][disabled]"
  end

  test "title rename preserves nested paths and edited content" do
    create_test_note("folder/original.md", "Initial")
    visit note_url(path: "folder/original.md")
    assert_selector ".cm-content"
    find(".cm-content").send_keys([ :control, :end ], " edited")
    find("[data-app-target='documentTitle']").send_keys(:enter)
    within "[data-file-operations-target='renameDialog']" do
      assert_equal "original", find("input").value
      find("input").fill_in with: "renamed"
      click_button "Rename"
    end
    assert_selector "[data-app-target='currentPath']", text: "renamed"
    assert_current_path "/notes/folder/renamed.md"
    assert_selector ".cm-content", text: "Initial edited"
    assert_selector "[data-autosave-target='saveStatus']", text: "Saved", wait: 10
    assert_equal "Initial edited", File.read(@test_notes_dir.join("folder/renamed.md"))
    refute @test_notes_dir.join("folder/original.md").exist?
    assert_equal "folder/renamed.md", find("[data-app-target='documentTitle']")["title"]
  end

  test "title rename cancellation and failure retain the current note" do
    create_test_note("original.md", "Original")
    create_test_note("occupied.md", "Occupied")
    visit note_url(path: "original.md")
    find("[data-app-target='documentTitle']").click
    within "[data-file-operations-target='renameDialog']" do
      click_button "Cancel"
    end
    assert_current_path "/notes/original.md"
    find("[data-app-target='documentTitle']").click
    within "[data-file-operations-target='renameDialog']" do
      find("input").fill_in with: "occupied"
      click_button "Rename"
      assert_selector "[data-file-operations-target='renameError']", text: /exist/i
    end
    assert_equal "Original", File.read(@test_notes_dir.join("original.md"))
    assert_equal "Occupied", File.read(@test_notes_dir.join("occupied.md"))
  end

  test "collapsed navigation opens Library and Settings and preserves preview mode" do
    create_test_note("note.md", "# Preview")
    visit note_url(path: "note.md")
    find("[data-app-target='previewToggle']").click
    find("[data-app-target='sidebarToggle']").click
    assert_selector ".workspace-sidebar.is-collapsed"
    find("[data-app-target='libraryToggle']").click
    assert_selector "[data-app-target='libraryPanel']", visible: true
    assert_no_selector "[data-app-target='editorToolbar']", visible: true
    find("[data-app-target='settingsToggle']").click
    assert_selector "#settings-dialog[open]"
    find("#settings-dialog").send_keys(:escape)
    find("[data-app-target='libraryToggle']").click
    assert_selector "[data-app-target='previewPanel']", visible: true
    assert_equal "true", find("[data-app-target='previewToggle']")["aria-pressed"]
  end

  test "single preview retains its toggle and overflow moves focus into dialogs" do
    create_test_note("single.md", "# Single")
    visit note_url(path: "single.md")
    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]');
      window.Stimulus.getControllerForElementAndIdentifier(root, 'app').setViewMode('single');
    JS
    find("[data-app-target='previewToggle']").click
    assert_selector "[data-app-target='previewPanel']", visible: true
    assert_no_selector "[data-app-target='editorPanel']", visible: true
    find("[data-app-target='previewToggle']").click
    assert_selector "[data-app-target='editorPanel']", visible: true
    find("[data-app-target='overflowToggle']").click
    find("[role='menuitem']", text: "Insert/Edit Table", exact_text: true).click
    assert_no_selector "#workspace-menu", visible: true
    assert_selector "dialog[open]:focus, dialog[open] :focus"
  end

  test "overflow copies the complete path using the existing feedback" do
    create_test_note("nested/note.md", "Copy path")
    visit note_url(path: "nested/note.md")
    assert_selector "[data-app-target='currentPath']", text: "note"
    page.execute_script(<<~JS)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async path => { window.copiedWorkspacePath = path } }
      });
    JS
    find("[data-app-target='overflowToggle']").click
    find("[role='menuitem']", text: "Click to copy path", exact_text: true).click
    assert_selector "#app-toast", text: I18n.t("status.copied_to_clipboard")
    assert_equal "nested/note.md", page.evaluate_script("window.copiedWorkspacePath")
  end

  test "long names and translated chrome fit desktop tablet and phone layouts" do
    path = "nested/a-document-with-a-very-long-name-for-responsive-workspace-checks.md"
    create_test_note(path, "# Workspace\n\nDocument text stays below the header.")
    [ [ 1400, 900, "en", "dark" ], [ 768, 1024, "es", "light" ], [ 320, 720, "he", "dark" ] ].each do |width, height, locale, theme|
      File.write(@test_notes_dir.join(".fed"), "theme = #{theme}\n")
      page.current_window.resize_to(width, height)
      visit note_url(path: path, locale: locale)
      assert_selector ".cm-content"
      assert_selector "[data-app-target='currentPath']", text: "a-document-with-a-very-long-name"
      page.execute_script("document.documentElement.dir = 'rtl'") if locale == "he"
      assert_equal 0, page.evaluate_script("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
      assert page.evaluate_script(<<~JS)
        (() => {
          const header = document.querySelector('header').getBoundingClientRect();
          const editor = document.querySelector('[data-app-target="editorPanel"]').getBoundingClientRect();
          return editor.top >= header.bottom;
        })()
      JS
      find("[data-app-target='overflowToggle']").click
      assert_selector "#workspace-menu", visible: true
      assert page.evaluate_script(<<~JS)
        (() => {
          const menu = document.querySelector('#workspace-menu').getBoundingClientRect();
          return menu.left >= 0 && menu.right <= window.innerWidth && menu.bottom <= window.innerHeight;
        })()
      JS
    end
  ensure
    page.current_window.resize_to(1400, 900)
  end

  test "mobile Explorer overlays the document and closes after selection and Escape" do
    page.current_window.resize_to(320, 720)
    create_test_note("mobile.md", "Mobile")
    visit root_url
    assert_selector ".workspace-sidebar.is-collapsed"
    assert_selector "[data-app-target='libraryToggle']", visible: true
    assert_selector "[data-app-target='settingsToggle']", visible: true
    find("[data-app-target='sidebarToggle']").click
    assert_selector ".workspace-sidebar.is-overlay"
    find("[data-path='mobile.md'][data-type='file']").click
    assert_selector ".workspace-sidebar.is-collapsed"
    assert_selector ".cm-content", text: "Mobile"
    assert_equal 0, page.evaluate_script("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
    find("[data-app-target='sidebarToggle']").click
    page.send_keys(:escape)
    assert_selector ".workspace-sidebar.is-collapsed"
    assert_selector "[data-app-target='sidebarToggle']:focus"
    find("[data-app-target='overflowToggle']").click
    assert_selector "#workspace-menu", visible: true
    assert page.evaluate_script("document.querySelector('#workspace-menu').getBoundingClientRect().right <= window.innerWidth")
  ensure
    page.current_window.resize_to(1400, 900)
  end
end
