# frozen_string_literal: true

require "test_helper"

class FoldersControllerTest < ActionDispatch::IntegrationTest
  def setup
    setup_test_notes_dir
  end

  def teardown
    teardown_test_notes_dir
  end

  # === create ===

  test "create makes new folder" do
    post create_folder_url(path: "new_folder"), as: :json
    assert_response :created

    assert @test_notes_dir.join("new_folder").directory?
  end

  test "create makes nested folder" do
    post create_folder_url(path: "parent/child"), as: :json
    assert_response :created

    assert @test_notes_dir.join("parent/child").directory?
  end

  test "create returns error if folder exists" do
    create_test_folder("existing")

    post create_folder_url(path: "existing"), as: :json
    assert_response :unprocessable_entity
  end

  # === destroy ===

  test "destroy removes empty folder" do
    create_test_folder("empty_folder")

    delete destroy_folder_url(path: "empty_folder"), as: :json
    assert_response :success

    refute @test_notes_dir.join("empty_folder").exist?
  end

  test "destroy recursively removes non-empty folder" do
    create_test_folder("folder")
    create_test_note("folder/nested/note.md")

    delete destroy_folder_url(path: "folder"), as: :json
    assert_response :success

    refute @test_notes_dir.join("folder").exist?
  end

  test "destroy returns 404 for missing folder" do
    delete destroy_folder_url(path: "nonexistent"), as: :json
    assert_response :not_found
  end

  # === rename ===

  test "rename moves folder" do
    create_test_folder("old_name")
    create_test_note("old_name/note.md", "Content")

    post rename_folder_url(path: "old_name"), params: { new_path: "new_name" }, as: :json
    assert_response :success

    refute @test_notes_dir.join("old_name").exist?
    assert @test_notes_dir.join("new_name").directory?
    assert @test_notes_dir.join("new_name/note.md").exist?
  end

  test "rename moves folder to different parent" do
    create_test_folder("source")
    create_test_folder("target")
    create_test_note("source/note.md")

    post rename_folder_url(path: "source"), params: { new_path: "target/source" }, as: :json
    assert_response :success

    refute @test_notes_dir.join("source").exist?
    assert @test_notes_dir.join("target/source").directory?
    assert @test_notes_dir.join("target/source/note.md").exist?
  end

  test "rename returns 404 for missing folder" do
    post rename_folder_url(path: "nonexistent"), params: { new_path: "new" }, as: :json
    assert_response :not_found
  end

  # === turbo stream responses ===

  test "create responds with turbo stream when requested" do
    post create_folder_url(path: "turbo_folder"),
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :created

    assert_includes response.content_type, "turbo-stream"
    assert_includes response.body, 'action="update"'
    assert_includes response.body, 'target="file-tree-content"'
    assert_includes response.body, 'data-path="turbo_folder"'
    assert_includes response.body, 'data-type="folder"'
  end

  test "create turbo stream includes expanded folder state" do
    create_test_folder("parent")
    create_test_note("parent/note.md")

    post create_folder_url(path: "new_folder"),
      params: { expanded: "parent" },
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :created

    assert_includes response.body, 'class="tree-chevron expanded"'
  end

  test "destroy responds with turbo stream when requested" do
    create_test_folder("empty_folder")

    delete destroy_folder_url(path: "empty_folder"),
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :success

    assert_includes response.content_type, "turbo-stream"
    assert_includes response.body, 'action="update"'
    assert_includes response.body, 'target="file-tree-content"'
    refute_includes response.body, 'data-path="empty_folder"'
  end

  test "rename responds with turbo stream when requested" do
    create_test_folder("old_folder")
    create_test_note("old_folder/note.md")

    post rename_folder_url(path: "old_folder"),
      params: { new_path: "new_folder", expanded: "" },
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :success

    assert_includes response.content_type, "turbo-stream"
    assert_includes response.body, 'action="update"'
    assert_includes response.body, 'target="file-tree-content"'
    assert_includes response.body, 'data-path="new_folder"'
    refute_includes response.body, 'data-path="old_folder"'
  end

  test "rename turbo stream remaps expanded folders from old to new path" do
    create_test_folder("project")
    create_test_folder("project/src")
    create_test_note("project/src/main.md")
    create_test_folder("other")
    create_test_note("other/note.md")

    # Both "project" and "project/src" are expanded, plus unrelated "other"
    post rename_folder_url(path: "project"),
      params: { new_path: "app", expanded: "project,project/src,other" },
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :success

    # Renamed folder and its children should be expanded under new path
    assert_includes response.body, 'class="tree-chevron expanded"'
    assert_includes response.body, 'data-path="app"'
    assert_includes response.body, 'data-path="app/src"'
    # Unrelated expanded folder should still be expanded
    assert_includes response.body, 'data-path="other"'
  end

  test "rename turbo stream keeps unrelated expanded folders unchanged" do
    create_test_folder("alpha")
    create_test_note("alpha/note.md")
    create_test_folder("beta")
    create_test_note("beta/note.md")

    post rename_folder_url(path: "alpha"),
      params: { new_path: "gamma", expanded: "alpha,beta" },
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :success

    # beta should still be expanded (unaffected by the rename)
    assert_includes response.body, 'data-path="beta"'
    assert_includes response.body, 'data-path="gamma"'
    refute_includes response.body, 'data-path="alpha"'
  end
end
