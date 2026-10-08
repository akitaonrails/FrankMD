# frozen_string_literal: true

require "test_helper"

class TreeHelperTest < ActionView::TestCase
  include TreeHelper

  test "renders empty state when no items" do
    html = render_tree_items([], expanded_folders: Set.new, selected_file: "")
    assert_includes html, t("sidebar.no_notes_yet")
    assert_includes html, "text-sm"
  end

  test "renders file item with correct attributes" do
    items = [ { name: "test", path: "test.md", type: "file", file_type: "markdown" } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    assert_includes html, 'data-path="test.md"'
    assert_includes html, 'data-type="file"'
    assert_includes html, 'data-file-type="markdown"'
    assert_includes html, "keydown-&gt;app#renameSelectedExplorerItem"
    assert_includes html, "test"
  end

  test "renders selected file with selected class" do
    items = [ { name: "test", path: "test.md", type: "file", file_type: "markdown" } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "test.md")

    assert_includes html, "selected"
  end

  test "renders folders as focusable explorer items with selection and keyboard actions" do
    items = [ { name: "folder1", path: "folder1", type: "folder", children: [] } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    assert_includes html, 'tabindex="0"'
    assert_includes html, "focus-&gt;app#onExplorerItemFocus"
    assert_includes html, "keydown-&gt;app#deleteSelectedExplorerItem"
    assert_includes html, "keydown-&gt;app#renameSelectedExplorerItem"
  end

  test "renders folder with children" do
    items = [ {
      name: "folder1", path: "folder1", type: "folder",
      children: [ { name: "note", path: "folder1/note.md", type: "file", file_type: "markdown" } ]
    } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    assert_includes html, "tree-folder"
    assert_includes html, 'data-path="folder1"'
    assert_includes html, 'data-type="folder"'
    assert_includes html, "tree-children hidden"
    assert_includes html, 'data-path="folder1/note.md"'
  end

  test "renders expanded folder without hidden class" do
    items = [ {
      name: "folder1", path: "folder1", type: "folder",
      children: [ { name: "note", path: "folder1/note.md", type: "file", file_type: "markdown" } ]
    } ]
    html = render_tree_items(items, expanded_folders: Set.new([ "folder1" ]), selected_file: "")

    assert_includes html, 'class="tree-chevron expanded"'
    # Children div should not have hidden class
    refute_includes html, "tree-children hidden"
  end

  test "renders config file without drag attributes" do
    items = [ { name: ".fed", path: ".fed", type: "file", file_type: "config" } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    assert_includes html, 'data-file-type="config"'
    assert_includes html, 'tabindex="0"'
    # Config files should not be draggable
    refute_includes html, 'draggable="true"'
    # Config files can be selected but should not have context menu actions.
    assert_includes html, "click-&gt;app#selectFile"
    assert_includes html, "keydown-&gt;app#deleteSelectedExplorerItem"
    assert_includes html, "keydown-&gt;app#renameSelectedExplorerItem"
    refute_includes html, "contextmenu"
  end

  test "renders regular files with drag and context menu" do
    items = [ { name: "test", path: "test.md", type: "file", file_type: "markdown" } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    assert_includes html, 'draggable="true"'
    # Data-action values are HTML-encoded by Rails content_tag
    assert_includes html, "contextmenu-&gt;app#showContextMenu"
    assert_includes html, "dragstart-&gt;drag-drop#onDragStart"
  end

  test "renders folders with drag-drop actions" do
    items = [ { name: "folder1", path: "folder1", type: "folder", children: [] } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    # Data-action values are HTML-encoded by Rails content_tag
    assert_includes html, "click-&gt;app#toggleFolder"
    assert_includes html, "dragover-&gt;drag-drop#onDragOver"
    assert_includes html, "drop-&gt;drag-drop#onDrop"
  end

  test "handles string keys in items" do
    items = [ { "name" => "test", "path" => "test.md", "type" => "file", "file_type" => "markdown" } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    assert_includes html, 'data-path="test.md"'
    assert_includes html, "test"
  end

  test "returns empty string for empty children at non-root depth" do
    items = [ { name: "empty", path: "empty", type: "folder", children: [] } ]
    html = render_tree_items(items, expanded_folders: Set.new, selected_file: "")

    assert_includes html, "tree-folder"
    # Children div should be present but empty (no "no notes yet" message)
    refute_includes html, t("sidebar.no_notes_yet")
  end
end
