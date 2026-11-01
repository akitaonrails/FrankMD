# frozen_string_literal: true

require "application_system_test_case"

class ExplorerBackgroundTest < ApplicationSystemTestCase
  test "right-clicking the explorer's empty area deselects and offers the explorer menu (#261, #267)" do
    create_test_note("first.md", "# First")
    create_test_note("second.md", "# Second")
    visit root_url

    # Select a note, then right-click the empty surface below the tree items.
    find("[data-path='first.md'][data-type='file']").click
    assert_selector "[data-path='first.md'].explorer-selected"
    find("#file-tree-content").right_click(x: 10, y: 300)

    # The menu appears, and the selection is cleared.
    assert_selector "[data-app-target='explorerMenu']:not(.hidden)"
    assert_no_selector ".explorer-selected"

    # A left-click on empty explorer space dismisses the menu.
    find("#file-tree-content").click(x: 10, y: 300)
    assert_selector "[data-app-target='explorerMenu'].hidden", visible: :all
    find("#file-tree-content").right_click(x: 10, y: 300)

    # Toolbar creation now targets the root again; interacting outside the
    # explorer dismisses the menu.
    find('button[title="New Note (Ctrl+N)"]').click
    within "dialog[open]" do
      assert_text "note-name.md"
      click_button "Cancel"
    end
    assert_selector "[data-app-target='explorerMenu'].hidden", visible: :all

    # Select all picks every visible item and closes the menu.
    find("#file-tree-content").right_click(x: 10, y: 300)
    within "[data-app-target='explorerMenu']" do
      click_button "Select All"
    end
    assert_selector ".explorer-selected", count: 2
    assert_selector "[data-app-target='explorerMenu'].hidden", visible: :all

    # Find File opens the file finder from the menu.
    find("#file-tree-content").right_click(x: 10, y: 300)
    within "[data-app-target='explorerMenu']" do
      click_button "Find File"
    end
    assert_selector "dialog[data-file-finder-target='dialog'][open]"
    find("body").native.send_keys(:escape)
  end

  test "the explorer menu creates notes at the root and Escape dismisses it (#267)" do
    visit root_url

    find("#file-tree-content").right_click(x: 10, y: 300)
    assert_selector "[data-app-target='explorerMenu']:not(.hidden)"

    within "[data-app-target='explorerMenu']" do
      click_button "New Note"
    end
    within "dialog[open]" do
      fill_in placeholder: "Note name", with: "menu_note"
      assert_text "root/menu_note.md"
      click_button "Create"
    end
    assert_selector "[data-path='menu_note.md']"
    assert @test_notes_dir.join("menu_note.md").file?

    find("#file-tree-content").right_click(x: 10, y: 300)
    assert_selector "[data-app-target='explorerMenu']:not(.hidden)"
    find("body").right_click(x: 700, y: 40)
    assert_selector "[data-app-target='explorerMenu'].hidden", visible: :all

    find("#file-tree-content").right_click(x: 10, y: 300)
    assert_selector "[data-app-target='explorerMenu']:not(.hidden)"
    find("body").native.send_keys(:escape)
    assert_selector "[data-app-target='explorerMenu'].hidden", visible: :all, wait: 3
  end
end
