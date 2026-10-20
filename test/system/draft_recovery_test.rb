# frozen_string_literal: true

require "application_system_test_case"

class DraftRecoveryTest < ApplicationSystemTestCase
  test "preserves the outgoing draft when switching files before autosave debounce" do
    create_test_note("a.md", "# Server A")
    create_test_note("b.md", "# Server B")

    visit root_url
    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, "app")
      app.getAutosaveController().constructor.SAVE_DEBOUNCE_MS = 60000
      app.getAutosaveController().constructor.SAVE_MAX_INTERVAL_MS = 60000
    JS

    find("[data-path='a.md']").click
    assert_equal "# Server A", wait_for_editor_content("# Server A")

    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, "app")
      app.getCodemirrorController().setValue("# Local draft A")
    JS

    find("[data-path='b.md']").click
    assert_equal "# Server B", wait_for_editor_content("# Server B")
    assert_equal "# Local draft A", JSON.parse(wait_for_browser_draft("a.md"))["content"]

    find("[data-path='a.md']").click
    assert_equal "# Local draft A", wait_for_editor_content("# Local draft A")
    assert_equal "# Server A", @test_notes_dir.join("a.md").read

    page.go_back
    assert_equal "# Server B", wait_for_editor_content("# Server B")
    page.go_back
    assert_equal "# Local draft A", wait_for_editor_content("# Local draft A")
    page.go_back
    assert_selector "[data-app-target='editorPlaceholder']", visible: true

    page.go_forward
    assert_equal "# Local draft A", wait_for_editor_content("# Local draft A")

    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, "app")
      app.getCodemirrorController().setValue("")
    JS
    find("[data-path='b.md']").click
    assert_equal "# Server B", wait_for_editor_content("# Server B")
    find("[data-path='a.md']").click
    assert_equal "", wait_for_editor_content("")
  end

  test "restores an online unsaved draft after a hard reload" do
    server_content = "# Original note"
    create_test_note("draft.md", server_content)

    visit note_url(path: "draft.md")
    assert_equal server_content, editor_content

    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, "app")
      const autosave = app.getAutosaveController()
      autosave.constructor.SAVE_DEBOUNCE_MS = 60000
      autosave.constructor.DRAFT_DEBOUNCE_MS = 60000
      app.getCodemirrorController().setValue("# Local draft")
    JS

    key = "frankmd:draft:#{ERB::Util.url_encode('draft.md')}"
    assert_nil page.evaluate_script("localStorage.getItem(#{key.to_json})")
    assert_equal server_content, @test_notes_dir.join("draft.md").read

    page.refresh
    assert_equal "# Local draft", wait_for_editor_content("# Local draft")
    assert_selector "[data-autosave-target='saveStatus']", text: I18n.t("status.unsaved")
    assert_equal server_content, @test_notes_dir.join("draft.md").read
    wait_for_tree_refresh("draft.md")
  end

  test "moves an active dirty draft with a renamed file" do
    create_test_note("before.md", "# Server version")

    visit root_url
    find("[data-path='before.md']").click
    assert_equal "# Server version", wait_for_editor_content("# Server version")
    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, "app")
      const autosave = app.getAutosaveController()
      autosave.constructor.SAVE_DEBOUNCE_MS = 60000
      autosave.constructor.SAVE_MAX_INTERVAL_MS = 60000
      autosave.constructor.DRAFT_DEBOUNCE_MS = 60000
      app.getCodemirrorController().setValue("# Local edit")
    JS

    find("[data-path='before.md']").right_click
    within "[data-app-target='contextMenu']" do
      click_button "Rename"
    end
    within "dialog[open]" do
      fill_in with: "after"
      click_button "Rename"
    end

    assert_selector "[data-path='after.md']", wait: 3
    assert_equal "after.md", page.evaluate_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      window.Stimulus.getControllerForElementAndIdentifier(root, "app").currentFile
    JS
    assert_equal "# Local edit", JSON.parse(wait_for_browser_draft("after.md"))["content"]
    assert_nil page.evaluate_script("localStorage.getItem(#{draft_key("before.md").to_json})")
    assert_equal "# Server version", @test_notes_dir.join("after.md").read
  end

  test "moves an active dirty draft to the destination folder" do
    create_test_note("before.md", "# Server version")
    FileUtils.mkdir_p(@test_notes_dir.join("target"))

    visit root_url
    find("[data-path='before.md']").click
    assert_equal "# Server version", wait_for_editor_content("# Server version")
    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, "app")
      const autosave = app.getAutosaveController()
      autosave.constructor.SAVE_DEBOUNCE_MS = 60000
      autosave.constructor.SAVE_MAX_INTERVAL_MS = 60000
      autosave.constructor.DRAFT_DEBOUNCE_MS = 60000
      app.getCodemirrorController().setValue("# Moved local edit")
    JS

    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="drag-drop"]')
      const dragDrop = window.Stimulus.getControllerForElementAndIdentifier(root, "drag-drop")
      await dragDrop.moveItem("before.md", "target/before.md", "file")
    JS

    assert_selector "[data-path='target/before.md']", wait: 3
    assert_equal "target/before.md", page.evaluate_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      window.Stimulus.getControllerForElementAndIdentifier(root, "app").currentFile
    JS
    assert_equal "# Moved local edit", JSON.parse(wait_for_browser_draft("target/before.md"))["content"]
    assert_nil page.evaluate_script("localStorage.getItem(#{draft_key("before.md").to_json})")
    assert_equal "# Server version", @test_notes_dir.join("target/before.md").read
  end

  test "remaps nested drafts and cleans them after deleting a folder" do
    create_test_note("docs/child.md", "# Server version")

    visit root_url
    find("[data-path='docs/child.md']").click
    assert_equal "# Server version", wait_for_editor_content("# Server version")
    page.execute_script(<<~JS)
      const root = document.querySelector('[data-controller~="app"]')
      const app = window.Stimulus.getControllerForElementAndIdentifier(root, "app")
      const autosave = app.getAutosaveController()
      autosave.constructor.SAVE_DEBOUNCE_MS = 60000
      autosave.constructor.SAVE_MAX_INTERVAL_MS = 60000
      autosave.constructor.DRAFT_DEBOUNCE_MS = 60000
      app.getCodemirrorController().setValue("# Nested local edit")
      localStorage.setItem(#{draft_key("docs-old/keep.md").to_json}, JSON.stringify({
        schemaVersion: 1, path: "docs-old/keep.md", content: "keep", baseRevision: "revision",
        draftRevision: "keep-revision", updatedAt: Date.now()
      }))
    JS

    find("[data-path='docs']").right_click
    within "[data-app-target='contextMenu']" do
      click_button "Rename"
    end
    within "dialog[open]" do
      fill_in with: "archive"
      click_button "Rename"
    end

    assert_selector "[data-path='archive/child.md']", wait: 3
    assert_equal "# Nested local edit", JSON.parse(wait_for_browser_draft("archive/child.md"))["content"]
    assert_nil page.evaluate_script("localStorage.getItem(#{draft_key("docs/child.md").to_json})")
    assert_equal "keep", JSON.parse(page.evaluate_script("localStorage.getItem(#{draft_key("docs-old/keep.md").to_json})"))["content"]

    find("[data-path='archive']").right_click
    accept_confirm do
      within "[data-app-target='contextMenu']" do
        click_button "Delete"
      end
    end

    assert_no_selector "[data-path='archive']", wait: 3
    assert_nil page.evaluate_script("localStorage.getItem(#{draft_key("archive/child.md").to_json})")
    assert_equal "keep", JSON.parse(page.evaluate_script("localStorage.getItem(#{draft_key("docs-old/keep.md").to_json})"))["content"]
  end

  private

  def wait_for_browser_draft(path)
    wait_until { page.evaluate_script("localStorage.getItem(#{draft_key(path).to_json})") }
  end

  def draft_key(path)
    "frankmd:draft:#{ERB::Util.url_encode(path)}"
  end

  def wait_for_editor_content(expected)
    wait_until do
      value = editor_content
      value == expected ? value : nil
    end
  end

  def wait_until
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + Capybara.default_max_wait_time
    loop do
      value = yield
      return value if value
      raise "Timed out waiting for browser state" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
      sleep 0.05
    end
  end
end
