# frozen_string_literal: true

require "application_system_test_case"

class SaveConflictTest < ApplicationSystemTestCase
  def wait_for_editor(expected)
    Timeout.timeout(10) do
      sleep 0.1 until editor_content == expected
      expected
    end
  end

  test "an external edit opens a conflict diff instead of being overwritten (#272)" do
    create_test_note("conflict.md", "# Original")
    visit root_url
    find("[data-path='conflict.md'][data-type='file']").click
    assert_selector ".cm-editor"

    # Another editor (or another machine syncing the folder) changes the file
    # while it is open here.
    File.write(@test_notes_dir.join("conflict.md"), "# External edit")

    # Touch the editor so autosave sends a save with the stale base revision.
    page.execute_script(<<~JS)
      const el = document.querySelector('[data-controller~="codemirror"]')
      window.Stimulus.getControllerForElementAndIdentifier(el, "codemirror").setValue("# Local edit")
    JS

    assert_selector "dialog[open] [data-recovery-diff-target='serverText']", wait: 10
    within "dialog[open]" do
      assert_text "External edit"
      assert_text "Local edit"
    end

    # The server file is untouched while the user decides.
    assert_equal "# External edit", @test_notes_dir.join("conflict.md").read

    # Keeping the server version reloads it in the editor.
    within "dialog[open]" do
      click_button "Use Server Version"
    end

    assert_no_selector "dialog[open]"
    assert_equal "# External edit", @test_notes_dir.join("conflict.md").read
    assert_equal "# External edit", wait_for_editor("# External edit")
  end

  test "keeping the local version re-saves it on top of the server revision (#272)" do
    create_test_note("conflict.md", "# Original")
    visit root_url
    find("[data-path='conflict.md'][data-type='file']").click
    assert_selector ".cm-editor"

    File.write(@test_notes_dir.join("conflict.md"), "# External edit")

    page.execute_script(<<~JS)
      const el = document.querySelector('[data-controller~="codemirror"]')
      window.Stimulus.getControllerForElementAndIdentifier(el, "codemirror").setValue("# Local edit")
    JS

    assert_selector "dialog[open] [data-recovery-diff-target='serverText']", wait: 10
    within "dialog[open]" do
      click_button "Restore Backup"
    end

    # The local text wins and reaches the disk without a second dialog.
    assert_selector "dialog[open]", count: 0, wait: 10
    Timeout.timeout(10) do
      sleep 0.1 until @test_notes_dir.join("conflict.md").read == "# Local edit"
    end
    assert_no_selector "dialog[open]"
  end
end
