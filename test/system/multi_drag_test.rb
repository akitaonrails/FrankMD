# frozen_string_literal: true

require "application_system_test_case"

class MultiDragTest < ApplicationSystemTestCase
  test "dragging a selected group moves every selected item to the destination (#266)" do
    create_test_note("first.md", "# First")
    create_test_note("second.md", "# Second")
    create_test_note("rooted.md", "# Rooted")
    FileUtils.mkdir_p(@test_notes_dir.join("target"))

    visit root_url

    # Select two of the three root notes (ctrl-click builds the selection).
    find("[data-path='first.md'][data-type='file']").click
    find("[data-path='second.md'][data-type='file']").click(:control)

    # Drive the drag controller the way a real drag would: drag start on one
    # member of the selection, drop on the target folder.
    page.execute_script(<<~JS)
      (async function() {
        const tree = document.getElementById("file-tree-content")
        const dragDrop = window.Stimulus.getControllerForElementAndIdentifier(tree, "drag-drop")
        const grabbed = tree.querySelector("[data-path='first.md']")
        dragDrop.onDragStart({
          currentTarget: grabbed,
          dataTransfer: { effectAllowed: null, setData: () => {} }
        })
        await dragDrop.onDrop({
          preventDefault: () => {},
          stopPropagation: () => {},
          currentTarget: tree.querySelector("[data-path='target'][data-type='folder']")
        })
      })()
    JS

    assert_selector "[data-path='target/first.md']", wait: 3
    assert_selector "[data-path='target/second.md']", wait: 3
    assert_selector "[data-path='rooted.md']"
    assert @test_notes_dir.join("target/first.md").file?
    assert @test_notes_dir.join("target/second.md").file?
    assert @test_notes_dir.join("rooted.md").file?
    assert_not @test_notes_dir.join("first.md").exist?
    assert_not @test_notes_dir.join("second.md").exist?
  end

  test "dragging an unselected item moves only that item (#266)" do
    create_test_note("solo.md", "# Solo")
    create_test_note("bystander.md", "# Bystander")
    FileUtils.mkdir_p(@test_notes_dir.join("target"))

    visit root_url
    find("[data-path='bystander.md'][data-type='file']").click

    page.execute_script(<<~JS)
      (async function() {
        const tree = document.getElementById("file-tree-content")
        const dragDrop = window.Stimulus.getControllerForElementAndIdentifier(tree, "drag-drop")
        dragDrop.onDragStart({
          currentTarget: tree.querySelector("[data-path='solo.md']"),
          dataTransfer: { effectAllowed: null, setData: () => {} }
        })
        await dragDrop.onDrop({
          preventDefault: () => {},
          stopPropagation: () => {},
          currentTarget: tree.querySelector("[data-path='target'][data-type='folder']")
        })
      })()
    JS

    assert_selector "[data-path='target/solo.md']", wait: 3
    assert_selector "[data-path='bystander.md']"
    assert @test_notes_dir.join("target/solo.md").file?
    assert @test_notes_dir.join("bystander.md").file?
  end
end
