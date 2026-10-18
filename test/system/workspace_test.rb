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

  test "sidebar owns the brand and toggle while the editor owns the document header" do
    create_test_note("headers.md", "# Separate headers")
    visit note_url(path: "headers.md")
    assert_selector ".workspace-sidebar > header .workspace-brand span", text: "FrankMD"
    assert_selector ".workspace-sidebar > header [data-app-target='sidebarToggle']"
    assert_selector ".workspace-main > header [data-app-target='currentPath']", text: "headers"
    assert page.evaluate_script(<<~JS)
      (() => {
        const sidebar = document.querySelector('.workspace-sidebar').getBoundingClientRect();
        const header = document.querySelector('.workspace-header').getBoundingClientRect();
        return sidebar.top === header.top && sidebar.right === header.left;
      })()
    JS
    find("[data-app-target='sidebarToggle']").click
    assert_selector ".workspace-sidebar.is-collapsed header .workspace-brand img", visible: true
    assert_no_selector ".workspace-brand span", visible: true
    find(".workspace-brand").send_keys(:enter)
    assert_selector "dialog[open]", text: "FrankMD"
  end

  test "title rename preserves nested paths and edited content" do
    create_test_note("folder/original.md", "Initial")
    visit note_url(path: "folder/original.md")
    assert_selector ".cm-content"
    find(".cm-content").send_keys([ :control, :end ], " edited")
    find("[data-app-target='documentTitle']").send_keys(:enter)
    assert_selector "[data-app-target='titleInput']:focus"
    assert_no_selector "[data-file-operations-target='renameDialog'][open]"
    assert_equal "original", find("[data-app-target='titleInput']").value
    assert_equal [ 8, 8 ], page.evaluate_script(<<~JS)
      (() => {
        const input = document.querySelector('[data-app-target="titleInput"]');
        return [input.selectionStart, input.selectionEnd];
      })()
    JS
    find("[data-app-target='titleInput']").fill_in with: "renamed"
    find("[data-app-target='titleInput']").send_keys(:enter)
    assert_no_selector "[data-app-target='titleInput']", visible: true
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
    find("[data-app-target='titleInput']").fill_in with: "cancelled"
    find("[data-app-target='titleInput']").send_keys(:escape)
    assert_selector "[data-app-target='documentTitle']:focus"
    assert_current_path "/notes/original.md"
    find("[data-app-target='documentTitle']").click
    find("[data-app-target='titleInput']").fill_in with: "occupied"
    find("[data-app-target='titleInput']").send_keys(:enter)
    assert_selector "[data-app-target='titleRenameError'][role='alert']", text: /exist/i
    assert_selector "[data-app-target='titleInput'][aria-invalid='true']:focus"
    assert_no_selector "dialog[open]"
    assert_current_path "/notes/original.md"
    assert_equal "Original", File.read(@test_notes_dir.join("original.md"))
    assert_equal "Occupied", File.read(@test_notes_dir.join("occupied.md"))
    find("[data-app-target='titleInput']").fill_in with: "available"
    find("[data-app-target='titleInput']").send_keys(:enter)
    assert_selector "[data-app-target='currentPath']", text: "available"
    assert_current_path "/notes/available.md"
  end

  test "blank titles show inline validation and clicking away cancels" do
    create_test_note("original.md", "Original")
    visit note_url(path: "original.md")
    find("[data-app-target='documentTitle']").click
    find("[data-app-target='titleInput']").fill_in with: " "
    find("[data-app-target='titleInput']").send_keys(:enter)
    assert_selector "[data-app-target='titleRenameError']", text: I18n.t("errors.title_required")
    find("[data-app-target='titleInput']").fill_in with: "cancelled"
    find(".cm-content").click
    assert_no_selector "[data-app-target='titleInput']", visible: true
    assert_no_selector "[data-app-target='titleRenameError']", visible: true
    assert_selector "[data-app-target='currentPath']", text: "original"
    assert_current_path "/notes/original.md"
    assert @test_notes_dir.join("original.md").exist?
    refute @test_notes_dir.join("cancelled.md").exist?
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

  test "menu pins expose action icons and survive a page reload" do
    create_test_note("pins.md", "# Toolbar pins")
    visit note_url(path: "pins.md")
    assert_no_selector "[data-workspace-pinned-action='table']", visible: true
    find("[data-app-target='overflowToggle']").click
    find("[data-workspace-pin='table']").click
    assert_selector "#workspace-menu", visible: true
    assert_selector "[data-workspace-pin='table'][aria-checked='true']"
    assert_selector "[data-workspace-pinned-action='table']", visible: true
    assert_no_selector "dialog[open]"
    page.refresh
    assert_selector "[data-workspace-pinned-action='table']", visible: true
    find("[data-workspace-pinned-action='table']").click
    assert_selector "dialog[open]:focus, dialog[open] :focus"
    page.send_keys(:escape)
    find("[data-app-target='overflowToggle']").click
    find("[data-workspace-pin='table']").click
    assert_no_selector "[data-workspace-pinned-action='table']", visible: true
    assert_selector "[data-workspace-pin='table'][aria-checked='false']"
  end

  test "preview remains reachable from the menu after unpinning" do
    create_test_note("preview.md", "# Preview")
    visit note_url(path: "preview.md")
    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]');
      window.Stimulus.getControllerForElementAndIdentifier(root, 'app').setViewMode('single');
    JS
    find("[data-app-target='overflowToggle']").click
    find("[data-workspace-pin='preview']").click
    assert_no_selector "[data-app-target='previewToggle']", visible: true
    find("#workspace-menu [data-workspace-preview-action]").click
    assert_selector "[data-app-target='previewPanel']", visible: true
    assert_no_selector "[data-app-target='editorPanel']", visible: true
    find("[data-app-target='overflowToggle']").click
    find("#workspace-menu [data-workspace-preview-action]").click
    assert_selector "[data-app-target='editorPanel']", visible: true
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
          const header = document.querySelector('.workspace-header').getBoundingClientRect();
          const editor = document.querySelector('[data-app-target="editorPanel"]').getBoundingClientRect();
          return editor.top >= header.bottom;
        })()
      JS
      find("[data-app-target='documentTitle']").click
      assert_selector "[data-app-target='titleInput']:focus"
      assert_equal 0, page.evaluate_script("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
      find("[data-app-target='titleInput']").send_keys(:escape)
      find("[data-app-target='overflowToggle']").click
      all("[data-workspace-pin][aria-checked='false']").each(&:click)
      assert_selector "#workspace-menu", visible: true
      assert_equal 0, page.evaluate_script("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
      assert_equal "0px", page.evaluate_script("getComputedStyle(document.querySelector('.workspace-header')).borderBottomWidth")
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
    assert_selector ".workspace-sidebar-header .workspace-brand span", text: "FrankMD"
    assert_selector "[data-workspace-main][inert]"
    find("[data-path='mobile.md'][data-type='file']").click
    assert_selector ".workspace-sidebar.is-collapsed"
    assert_selector ".cm-content", text: "Mobile"
    assert_equal 0, page.evaluate_script("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
    find("[data-app-target='sidebarToggle']").click
    find("[data-app-target='settingsToggle']").click
    assert_selector "#settings-dialog[open]"
    find("#settings-dialog").send_keys(:escape)
    assert_no_selector "#settings-dialog[open]"
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
