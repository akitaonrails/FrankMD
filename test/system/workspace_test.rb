# frozen_string_literal: true

require "application_system_test_case"

class WorkspaceTest < ApplicationSystemTestCase
  test "empty notes focus the editor" do
    create_test_note("empty.md", "")
    visit note_url(path: "empty.md")
    assert_selector ".cm-content:focus"
    wait_for_tree_refresh("empty.md")
  end

  test "save status stays translated before locale data loads" do
    create_test_note("empty.md", "")
    visit note_url(path: "empty.md")
    page.execute_script(<<~JS)
      window.frankmdTranslations = {};
      const root = document.querySelector('[data-controller~="app"]');
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, 'app');
      app.getAutosaveController().constructor.SAVE_DEBOUNCE_MS = 60000;
    JS
    find(".cm-content").send_keys("Draft")
    assert_selector "[data-autosave-target='saveStatus']", text: I18n.t("status.unsaved")
    assert_no_selector "[data-autosave-target='saveStatus']", text: "status.unsaved"
    wait_for_tree_refresh("empty.md")
  end

  test "empty and missing documents cannot be renamed while Help remains accessible" do
    visit root_url
    assert_selector "[data-app-target='documentTitle'][disabled]"
    find("[data-app-target='overflowToggle']").click
    assert_selector "#workspace-menu [role='menuitem']", count: 1
    visit note_url(path: "missing.md")
    assert_selector "[data-app-target='currentPath']", text: "missing.md"
    assert_selector "[data-app-target='documentTitle'][disabled]"
    assert_selector "[data-app-target='currentPath']", text: I18n.t("editor.select_note"), wait: 6
  end

  test "Explorer header owns the brand and actions while editor header owns the document" do
    create_test_note("headers.md", "# Separate headers")
    visit note_url(path: "headers.md")
    assert_selector ".workspace-sidebar > header .workspace-brand span", text: "FrankMD"
    assert_selector ".workspace-sidebar > header .workspace-global-actions button", count: 4
    assert_selector ".workspace-sidebar > header [data-app-target='sidebarToggle']"
    assert_no_selector ".workspace-main > header .workspace-explorer-actions"
    assert_selector ".workspace-main > header [data-app-target='currentPath']", text: "headers"
    assert page.evaluate_script(<<~JS)
      (() => {
        const sidebar = document.querySelector('.workspace-sidebar').getBoundingClientRect();
        const header = document.querySelector('.workspace-header').getBoundingClientRect();
        return sidebar.top === header.top && sidebar.right === header.left;
      })()
    JS
    assert page.evaluate_script(<<~JS)
      (() => {
        const title = document.querySelector('.workspace-brand').getBoundingClientRect();
        const actions = document.querySelector('.workspace-explorer-actions').getBoundingClientRect();
        const header = document.querySelector('.workspace-sidebar-header').getBoundingClientRect();
        return actions.left >= title.right && actions.right <= header.right;
      })()
    JS
    find("[data-app-target='sidebarToggle']").click
    assert_selector ".workspace-sidebar.is-hidden", visible: :all
    assert_no_selector ".workspace-sidebar", visible: true
    assert_selector ".workspace-main > header [data-app-target='sidebarOpen']:focus", visible: true
    assert page.evaluate_script(<<~JS)
      (() => {
        const opener = document.querySelector('[data-app-target="sidebarOpen"]').getBoundingClientRect();
        const title = document.querySelector('[data-app-target="documentTitle"]').getBoundingClientRect();
        const main = document.querySelector('.workspace-main').getBoundingClientRect();
        return opener.right <= title.left && main.left === 0;
      })()
    JS
    find("[data-app-target='sidebarOpen']").click
    assert_selector ".workspace-sidebar", visible: true
    assert_no_selector "button.workspace-brand"
    find("[data-app-target='settingsToggle']").click
    find("#settings-dialog [data-settings-target='navButton'][data-category='about']").send_keys(:enter)
    assert_selector "#settings-dialog [data-category='about'] h3", text: "FrankMD"
    assert_selector "dialog[open]", count: 1
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
    assert_selector "[data-app-target='documentTitle']:focus"
    assert_equal "none", page.evaluate_script("getComputedStyle(document.querySelector('[data-app-target=documentTitle]')).outlineStyle")
  end

  test "title input matches its label and resizes with the text" do
    create_test_note("rename-width.md", "# Title")
    visit note_url(path: "rename-width.md")
    assert_selector "[data-app-target='documentTitle']:not([disabled])"
    label = page.evaluate_script(<<~JS)
      (() => {
        const title = document.querySelector('[data-app-target="documentTitle"]');
        const bounds = title.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      })()
    JS
    find("[data-app-target='documentTitle']").click
    assert_selector "[data-app-target='titleInput']:focus"
    assert page.evaluate_script(<<~JS)
      ((label) => {
        const input = document.querySelector('[data-app-target="titleInput"]');
        const bounds = input.getBoundingClientRect();
        const style = getComputedStyle(input);
        return Math.abs(bounds.x - label.x) < 1 && Math.abs(bounds.y - label.y) < 0.01 &&
          Math.abs(bounds.width - label.width) < 2 && Math.abs(bounds.height - label.height) < 0.01 &&
          style.paddingLeft === '8px' && style.paddingRight === '8px';
      })(#{label.to_json})
    JS
    initial_width = page.evaluate_script("document.querySelector('[data-app-target=titleInput]').getBoundingClientRect().width")
    find("[data-app-target='titleInput']").fill_in with: "a much longer document title"
    assert_operator page.evaluate_script("document.querySelector('[data-app-target=titleInput]').getBoundingClientRect().width"), :>, initial_width
    find("[data-app-target='titleInput']").fill_in with: "short"
    assert_operator page.evaluate_script("document.querySelector('[data-app-target=titleInput]').getBoundingClientRect().width"), :<, initial_width
    find("[data-app-target='titleInput']").send_keys(:escape)
  end

  test "About remains accessible inside Settings on desktop and phone" do
    [ [ 1400, 900 ], [ 320, 720 ] ].each do |width, height|
      page.current_window.resize_to(width, height)
      visit root_url
      find("[data-app-target='sidebarOpen']").click if width < 768
      find("[data-app-target='settingsToggle']").click
      find("#settings-dialog [data-settings-target='navButton'][data-category='about']").click
      assert_selector "#settings-dialog [data-category='about'] h3", text: "FrankMD"
      assert_selector "#settings-dialog [data-category='about'] a[href='https://github.com/akitaonrails/FrankMD']"
      assert_selector "dialog[open]", count: 1
      assert_no_selector "[data-help-target='aboutDialog']", visible: :all
      assert_equal 0, page.evaluate_script("Math.max(0, document.querySelector('#settings-dialog').scrollWidth - document.querySelector('#settings-dialog').clientWidth)")
      find("#settings-dialog [data-settings-target='navButton'][data-category='general']").click
      assert_no_selector "#settings-dialog section[data-category='about']", visible: true
      find("#settings-dialog").send_keys(:escape)
      assert_no_selector "#settings-dialog[open]"
      assert_selector "[data-app-target='settingsToggle']:focus"
    end
  ensure
    page.current_window.resize_to(1400, 900)
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

  test "hidden Explorer reopens for Library and Settings and preserves preview mode" do
    create_test_note("note.md", "# Preview")
    visit note_url(path: "note.md")
    find("[data-app-target='previewToggle']").click
    find("[data-app-target='sidebarToggle']").click
    assert_selector ".workspace-sidebar.is-hidden", visible: :all
    assert_no_selector "[data-app-target='libraryToggle']", visible: true
    assert_no_selector "[data-app-target='settingsToggle']", visible: true
    find("[data-app-target='sidebarOpen']").click
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

  test "menu and pinned copy buttons copy the current document content" do
    create_test_note("nested/note.md", "# Copy content\n\nOriginal")
    visit note_url(path: "nested/note.md")
    assert_selector "[data-app-target='currentPath']", text: "note"
    page.execute_script(<<~JS)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async content => { window.copiedWorkspaceContent = content } }
      });
    JS
    find(".cm-content").send_keys([ :control, :end ], " edited")
    expected = "# Copy content\n\nOriginal edited"
    find("[data-app-target='overflowToggle']").click
    find("[data-workspace-pin='copy']", visible: :all).find(:xpath, "..").hover
    find("[data-workspace-pin='copy']").click
    find("[role='menuitem']", text: "Copy content", exact_text: true).click
    assert_selector "#app-toast", text: I18n.t("status.copied_to_clipboard")
    assert_equal expected, page.evaluate_script("window.copiedWorkspaceContent")
    page.execute_script(<<~JS)
      window.copiedWorkspaceContent = null;
      const root = document.querySelector('[data-controller~="app"]');
      window.Stimulus.getControllerForElementAndIdentifier(root, 'app').setViewMode('single');
    JS
    find("[data-app-target='previewToggle']").click
    assert_no_selector "[data-app-target='editorPanel']", visible: true
    find("[data-workspace-pinned-action='copy']").click
    assert_equal expected, page.evaluate_script("window.copiedWorkspaceContent")
  end

  test "menu pins expose action icons and survive a page reload" do
    create_test_note("pins.md", "# Toolbar pins")
    visit note_url(path: "pins.md")
    assert_no_selector "[data-workspace-pinned-action='table']", visible: true
    find("[data-app-target='overflowToggle']").click
    find("[data-workspace-pin='table']", visible: :all).find(:xpath, "..").hover
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

  test "mouse clicks leave no selected row while keyboard focus stays visible" do
    create_test_note("focus.md", "# Menu focus")
    visit note_url(path: "focus.md")
    find("[data-app-target='overflowToggle']").click
    assert_no_selector "#workspace-menu :focus"
    assert_equal "0", page.evaluate_script("getComputedStyle(document.querySelector('[data-workspace-pin=table]')).opacity")
    assert_equal "1", page.evaluate_script("getComputedStyle(document.querySelector('[data-workspace-pin=image]')).opacity")
    find("[data-workspace-pin='table']", visible: :all).find(:xpath, "..").hover
    assert_equal "1", page.evaluate_script("getComputedStyle(document.querySelector('[data-workspace-pin=table]')).opacity")
    find("[data-workspace-pin='table']").click
    find("[data-app-target='documentTitle']").hover
    assert_equal "1", page.evaluate_script("getComputedStyle(document.querySelector('[data-workspace-pin=table]')).opacity")
    assert_equal "0", page.evaluate_script("getComputedStyle(document.querySelector('[data-workspace-pin=video]')).opacity")
    assert_equal "rgba(0, 0, 0, 0)", page.evaluate_script(<<~JS)
      getComputedStyle(document.querySelector('[data-workspace-pin="table"]').parentElement).backgroundColor
    JS
    page.send_keys(:escape)
    find("[data-app-target='overflowToggle']").send_keys(:enter)
    assert_selector "#workspace-menu [role='menuitem']:focus"
    page.send_keys(:arrow_right)
    assert_selector "[data-workspace-pin='image']:focus-visible"
    page.send_keys(:enter)
    assert_selector "[data-workspace-pin='image'][aria-checked='false']:focus-visible"
    assert_equal "1", page.evaluate_script("getComputedStyle(document.querySelector('[data-workspace-pin=image]')).opacity")
    refute_equal "rgba(0, 0, 0, 0)", page.evaluate_script(<<~JS)
      getComputedStyle(document.querySelector('[data-workspace-pin="image"]').parentElement).backgroundColor
    JS
  end

  test "long names and translated chrome fit desktop tablet and phone layouts" do
    path = "nested/a-document-with-a-very-long-name-for-responsive-workspace-checks.md"
    create_test_note(path, "# Workspace\n\nDocument text stays below the header.")
    [ [ 1400, 900, "en", "dark" ], [ 768, 1024, "es", "light" ], [ 320, 720, "he", "dark" ] ].each do |width, height, locale, theme|
      File.write(@test_notes_dir.join(".fed"), "theme = #{theme}\n")
      page.current_window.resize_to(width, height)
      visit note_url(path: path, locale: locale)
      assert_selector ".cm-content", text: "Document text stays below the header.", wait: 10
      assert_selector "[data-app-target='currentPath']", text: "a-document-with-a-very-long-name", wait: 10
      page.execute_script("document.documentElement.dir = 'rtl'") if locale == "he"
      assert_equal 0, page.evaluate_script("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
      assert page.evaluate_script(<<~JS)
        (() => {
          const toolbar = document.querySelector('.workspace-toolbar');
          const bounds = toolbar.getBoundingClientRect();
          const header = document.querySelector('.workspace-header').getBoundingClientRect();
          const style = getComputedStyle(toolbar);
          const icons = [...toolbar.querySelectorAll('.workspace-icon svg')];
          return bounds.left >= header.left && bounds.right <= header.right &&
            bounds.bottom <= header.bottom && style.boxShadow === 'none' &&
            style.borderWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
            icons.every((icon) => {
              const size = getComputedStyle(icon);
              return size.width === '20px' && size.height === '20px';
            }) &&
            (window.innerWidth > 767 || bounds.width < header.width);
        })()
      JS
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
      all("[data-workspace-pin][aria-checked='false']", visible: :all).each do |pin|
        pin.find(:xpath, "..").hover
        pin.click
      end
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
    assert_selector ".workspace-sidebar.is-hidden", visible: :all
    assert_no_selector "[data-app-target='libraryToggle']", visible: true
    assert_no_selector "[data-app-target='settingsToggle']", visible: true
    assert_selector "[data-app-target='sidebarOpen']", visible: true
    find("[data-app-target='sidebarOpen']").click
    assert_selector ".workspace-sidebar.is-overlay"
    assert_selector ".workspace-sidebar-header .workspace-brand span", text: "FrankMD"
    assert_selector "[data-workspace-main][inert]"
    assert_selector ".workspace-global-actions button", visible: true, count: 4
    assert_nil page.evaluate_script("document.querySelector('[data-app-target=sidebarToggle]').closest('[inert]')")
    find("[data-path='mobile.md'][data-type='file']").click
    assert_selector ".workspace-sidebar.is-hidden", visible: :all
    assert_selector "[data-app-target='sidebarOpen']", visible: true
    assert_selector ".cm-content", text: "Mobile"
    assert_equal 0, page.evaluate_script("Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
    find("[data-app-target='sidebarOpen']").click
    find("[data-app-target='settingsToggle']").click
    assert_selector "#settings-dialog[open]"
    find("#settings-dialog").send_keys(:escape)
    assert_no_selector "#settings-dialog[open]"
    page.send_keys(:escape)
    assert_selector ".workspace-sidebar.is-hidden", visible: :all
    assert_selector "[data-app-target='sidebarOpen']:focus"
    find("[data-app-target='overflowToggle']").click
    assert_selector "#workspace-menu", visible: true
    assert page.evaluate_script("document.querySelector('#workspace-menu').getBoundingClientRect().right <= window.innerWidth")
  ensure
    page.current_window.resize_to(1400, 900)
  end

  test "Stats starts hidden and can be enabled in Settings" do
    create_test_note("stats.md", "Three words here")
    visit note_url(path: "stats.md")
    assert_selector ".cm-content", text: "Three words here"
    assert_no_selector "[data-app-target='statsPanel']", visible: true

    find("[data-app-target='settingsToggle']").click
    find("#settings-dialog [data-settings-target='navButton'][data-category='editor']").click
    find("#settings-dialog [data-settings-target='statsToggle']").click
    assert_selector "#settings-dialog [data-settings-target='statsToggle'][aria-pressed='true']"
    find("#settings-dialog [data-action='click->settings#closeSettings']").click
    assert_selector "[data-app-target='statsPanel']", visible: true
    assert_selector "[data-stats-panel-target='words']", text: "3"
    Timeout.timeout(5) do
      sleep 0.05 until Config.new(base_path: @test_notes_dir).get(:show_stats)
    end

    visit note_url(path: "stats.md")
    assert_selector "[data-app-target='statsPanel']", visible: true
  end

  private

  def wait_for_tree_refresh(path)
    Timeout.timeout(5) do
      sleep 0.05 until page.evaluate_script(<<~JS)
        performance.getEntriesByType("resource").some((entry) => {
          const url = new URL(entry.name);
          return url.pathname === "/notes/tree" && url.searchParams.get("selected") === #{path.to_json};
        })
      JS
    end
  end
end
