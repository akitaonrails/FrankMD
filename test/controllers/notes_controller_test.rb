# frozen_string_literal: true

require "test_helper"

class NotesControllerTest < ActionDispatch::IntegrationTest
  def setup
    setup_test_notes_dir
  end

  def teardown
    teardown_test_notes_dir
  end

  # === index ===

  test "index renders the main page" do
    get root_url
    assert_response :success
    assert_select "div[data-controller~='app']"
  end

  test "index has empty initial-path-value and empty initial-note-value" do
    get root_url
    assert_response :success

    assert_select "div[data-controller~='app']" do |elements|
      el = elements.first
      # Root URL should have empty path (no file selected)
      assert_equal "", el["data-app-initial-path-value"]
      # Initial note should be empty JSON object
      assert_equal "{}", el["data-app-initial-note-value"]
    end
  end

  test "index includes tree data in rendered HTML" do
    create_test_note("test.md")

    get root_url
    assert_response :success
    # Tree is now server-rendered as HTML, not JSON in data attribute
    assert_includes response.body, 'data-path="test.md"'
    assert_includes response.body, 'data-type="file"'
  end

  # === tree ===

  test "tree returns HTML file tree" do
    create_test_note("note1.md")
    create_test_folder("folder1")
    create_test_note("folder1/note2.md")

    get notes_tree_url
    assert_response :success

    assert_includes response.body, 'data-path="note1.md"'
    assert_includes response.body, 'data-path="folder1"'
    assert_includes response.body, 'data-type="folder"'
    assert_includes response.body, 'data-type="file"'
  end

  test "tree accepts expanded and selected params" do
    create_test_folder("folder1")
    create_test_note("folder1/note1.md")

    get notes_tree_url, params: { expanded: "folder1", selected: "folder1/note1.md" }
    assert_response :success

    # Expanded folder should not have hidden children
    assert_includes response.body, 'class="tree-chevron expanded"'
    # Selected file should have selected class
    assert_includes response.body, 'class="tree-item selected"'
  end

  # === show ===

  test "show returns note content" do
    create_test_note("test.md", "# Hello\n\nWorld")

    get note_url(path: "test.md"), as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "test.md", data["path"]
    assert_equal "# Hello\n\nWorld", data["content"]
  end

  test "show returns 404 for missing note" do
    get note_url(path: "nonexistent.md"), as: :json
    assert_response :not_found
  end

  # === show (asset serving) ===

  test "show serves image files from notes directory" do
    images_dir = @test_notes_dir.join("images")
    FileUtils.mkdir_p(images_dir)
    File.binwrite(images_dir.join("test.png"), "\x89PNG\r\n\x1a\n")

    get note_url(path: "images/test.png")
    assert_response :success
    assert_equal "image/png", response.content_type
  end

  test "show returns 404 for missing asset files" do
    get note_url(path: "images/nonexistent.png")
    assert_response :not_found
  end

  test "show blocks path traversal for assets" do
    get note_url(path: "../../etc/passwd")
    assert_response :forbidden
  end

  # === create ===

  test "create makes new note" do
    post create_note_url(path: "new_note"), params: { content: "# New Note" }, as: :json
    assert_response :created

    assert @test_notes_dir.join("new_note.md").exist?
    assert_equal "# New Note", File.read(@test_notes_dir.join("new_note.md"))
  end

  test "create adds .md extension if missing" do
    post create_note_url(path: "no_extension"), params: { content: "Content" }, as: :json
    assert_response :created

    assert @test_notes_dir.join("no_extension.md").exist?
  end

  test "create in subfolder works" do
    create_test_folder("subfolder")

    post create_note_url(path: "subfolder/nested.md"), params: { content: "Nested" }, as: :json
    assert_response :created

    assert @test_notes_dir.join("subfolder/nested.md").exist?
  end

  test "create with nested directories creates parent folders" do
    # Hugo blog post style: YYYY/MM/DD/slug/index.md
    hugo_path = "2026/01/30/my-blog-post/index.md"
    hugo_content = <<~FRONTMATTER
      ---
      title: "My Blog Post"
      slug: "my-blog-post"
      date: 2026-01-30T14:30:00-0300
      draft: true
      tags:
      -
      ---

    FRONTMATTER

    post create_note_url(path: hugo_path), params: { content: hugo_content }, as: :json
    assert_response :created

    # Verify the full path was created
    assert @test_notes_dir.join("2026/01/30/my-blog-post/index.md").exist?
    assert_equal hugo_content, File.read(@test_notes_dir.join(hugo_path))
  end

  test "create returns error if note exists" do
    create_test_note("existing.md")

    post create_note_url(path: "existing.md"), params: { content: "Content" }, as: :json
    assert_response :unprocessable_entity
  end

  # === create with Hugo template ===

  test "create with hugo template generates date-based path" do
    travel_to Time.zone.local(2026, 2, 1, 10, 30, 0) do
      post "/notes", params: { template: "hugo", title: "My Blog Post" }, as: :json
      assert_response :created

      data = JSON.parse(response.body)
      assert_match %r{2026/02/01/my-blog-post/index\.md}, data["path"]
    end
  end

  test "create with hugo template generates frontmatter content" do
    travel_to Time.zone.local(2026, 2, 1, 10, 30, 0) do
      post "/notes", params: { template: "hugo", title: "My Blog Post" }, as: :json
      assert_response :created

      data = JSON.parse(response.body)
      content = File.read(@test_notes_dir.join(data["path"]))

      assert content.start_with?("---")
      assert_includes content, 'title: "My Blog Post"'
      assert_includes content, 'slug: "my-blog-post"'
      assert_includes content, "draft: true"
    end
  end

  test "create with hugo template respects parent folder" do
    travel_to Time.zone.local(2026, 2, 1, 10, 30, 0) do
      post "/notes", params: { template: "hugo", title: "My Post", parent: "blog" }, as: :json
      assert_response :created

      data = JSON.parse(response.body)
      assert data["path"].start_with?("blog/2026/02/01/")
    end
  end

  test "create with hugo template requires title" do
    post "/notes", params: { template: "hugo", title: "" }, as: :json
    assert_response :unprocessable_entity

    data = JSON.parse(response.body)
    assert_includes data["error"], "required"
  end

  test "create with hugo template handles accented characters in title" do
    post "/notes", params: { template: "hugo", title: "Café Açaí" }, as: :json
    assert_response :created

    data = JSON.parse(response.body)
    assert_includes data["path"], "cafe-acai"
  end

  # === update ===

  test "update saves note content" do
    create_test_note("test.md", "Old content")

    patch update_note_url(path: "test.md"), params: { content: "New content" }, as: :json
    assert_response :success

    assert_equal "New content", File.read(@test_notes_dir.join("test.md"))
  end

  test "update creates note if it does not exist" do
    patch update_note_url(path: "new.md"), params: { content: "Content" }, as: :json
    assert_response :success

    assert @test_notes_dir.join("new.md").exist?
  end

  # === destroy ===

  test "destroy removes note" do
    create_test_note("to_delete.md")

    delete destroy_note_url(path: "to_delete.md"), as: :json
    assert_response :success

    refute @test_notes_dir.join("to_delete.md").exist?
  end

  test "destroy returns 404 for missing note" do
    delete destroy_note_url(path: "nonexistent.md"), as: :json
    assert_response :not_found
  end

  # === rename ===

  test "rename moves note to new path" do
    create_test_note("old.md", "Content")

    post rename_note_url(path: "old.md"), params: { new_path: "new.md" }, as: :json
    assert_response :success

    refute @test_notes_dir.join("old.md").exist?
    assert @test_notes_dir.join("new.md").exist?
  end

  test "rename moves note to subfolder" do
    create_test_note("root.md", "Content")
    create_test_folder("subfolder")

    post rename_note_url(path: "root.md"), params: { new_path: "subfolder/moved.md" }, as: :json
    assert_response :success

    refute @test_notes_dir.join("root.md").exist?
    assert @test_notes_dir.join("subfolder/moved.md").exist?
  end

  test "rename returns 404 for missing note" do
    post rename_note_url(path: "nonexistent.md"), params: { new_path: "new.md" }, as: :json
    assert_response :not_found
  end

  # === search ===

  test "search returns matching results" do
    create_test_note("test.md", "Hello world\nThis is searchable content")

    get "/notes/search", params: { q: "searchable" }, as: :json
    assert_response :success

    results = JSON.parse(response.body)
    assert_equal 1, results.length
    assert_equal "test.md", results.first["path"]
  end

  test "search returns empty array for no matches" do
    create_test_note("test.md", "Hello world")

    get "/notes/search", params: { q: "nonexistent" }, as: :json
    assert_response :success

    results = JSON.parse(response.body)
    assert_equal [], results
  end

  test "search supports regex patterns" do
    create_test_note("test.md", "foo123bar")

    get "/notes/search", params: { q: "foo\\d+bar" }, as: :json
    assert_response :success

    results = JSON.parse(response.body)
    assert_equal 1, results.length
  end

  test "search returns context lines" do
    create_test_note("test.md", "line1\nline2\nmatch\nline4\nline5")

    get "/notes/search", params: { q: "match" }, as: :json
    assert_response :success

    results = JSON.parse(response.body)
    assert results.first["context"].is_a?(Array)
    assert results.first["context"].length > 1
  end

  # === backlinks ===

  test "backlinks returns matching results" do
    create_test_note("target.md", "# Target")
    create_test_note("source.md", "Links to [[target]] here")

    get "/notes/target.md/backlinks", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal 1, data["count"]
    assert_equal 1, data["backlinks"].length
    assert_equal "source.md", data["backlinks"].first["path"]
  end

  test "backlinks returns empty array when no links exist" do
    create_test_note("lonely.md", "# No one links to me")

    get "/notes/lonely.md/backlinks", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal 0, data["count"]
    assert_equal [], data["backlinks"]
  end

  # === bookmarkable URLs ===

  test "show with HTML request renders SPA with initial note data" do
    create_test_note("bookmarked.md", "# Bookmarked Content")

    get note_url(path: "bookmarked.md")
    assert_response :success

    # Should render the SPA
    assert_select "div[data-controller~='app']"

    # Should include initial path data attribute
    assert_match "bookmarked.md", response.body
    assert_match "Bookmarked Content", response.body

    # Verify the initial path is a plain string (no JSON quotes)
    assert_select "div[data-controller~='app'][data-app-initial-path-value]" do |elements|
      path_value = elements.first["data-app-initial-path-value"]
      assert_equal "bookmarked.md", path_value
      refute_includes path_value, '"', "initial-path-value should not contain JSON quotes"
    end

    # Verify the initial note JSON is properly embedded in the data attribute
    assert_select "div[data-controller~='app'][data-app-initial-note-value]" do |elements|
      json_str = elements.first["data-app-initial-note-value"]
      note_data = JSON.parse(json_str)
      assert_equal "bookmarked.md", note_data["path"]
      assert_equal "# Bookmarked Content", note_data["content"]
      assert_equal true, note_data["exists"]
    end
  end

  test "show with HTML request embeds content with special characters correctly" do
    content = "# Title\n\nHe said \"hello\" & she said <goodbye>\n\nBackslash: \\"
    create_test_note("special.md", content)

    get note_url(path: "special.md")
    assert_response :success

    # Verify the data attribute can be parsed back to valid JSON with correct content
    assert_select "div[data-controller~='app'][data-app-initial-note-value]" do |elements|
      json_str = elements.first["data-app-initial-note-value"]
      note_data = JSON.parse(json_str)
      assert_equal content, note_data["content"]
      assert_equal true, note_data["exists"]
    end
  end

  test "show with HTML request for nested path renders SPA" do
    create_test_folder("2026/01/30/my-post")
    create_test_note("2026/01/30/my-post/index.md", "# Hugo Post")

    get note_url(path: "2026/01/30/my-post/index.md")
    assert_response :success

    assert_select "div[data-controller~='app']"
    assert_match "2026/01/30/my-post/index.md", response.body
    assert_match "Hugo Post", response.body
  end

  test "show with HTML request for missing file renders SPA with error state" do
    get note_url(path: "nonexistent/file.md")
    assert_response :success

    # Should still render the SPA
    assert_select "div[data-controller~='app']"

    # Initial note should indicate not found (HTML-escaped JSON)
    assert_match(/no longer exists|was deleted/i, response.body)
    # Check for exists:false in HTML-escaped JSON (the : is not escaped)
    assert_includes response.body, ":false"
  end

  test "index with file query param loads initial note" do
    create_test_note("from_param.md", "# From Param")

    get root_url(file: "from_param.md")
    assert_response :success

    assert_select "div[data-controller~='app']"
    assert_match "From Param", response.body
  end

  test "index renders editor config partial" do
    get root_url
    assert_response :success
    assert_select "div#editor-config[data-controller='editor-config']"
  end

  # === turbo stream responses ===

  test "create responds with turbo stream when requested" do
    post create_note_url(path: "turbo_note.md"),
      params: { content: "# Turbo", expanded: "folder1" },
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :created

    assert_includes response.content_type, "turbo-stream"
    assert_includes response.body, "turbo-stream"
    assert_includes response.body, 'action="update"'
    assert_includes response.body, 'target="file-tree-content"'
    # Tree should contain the newly created file
    assert_includes response.body, 'data-path="turbo_note.md"'
  end

  test "create turbo stream includes expanded folder state" do
    create_test_folder("myfolder")
    create_test_note("myfolder/existing.md")

    post create_note_url(path: "new_note.md"),
      params: { content: "", expanded: "myfolder" },
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :created

    # Expanded folder should show expanded chevron
    assert_includes response.body, 'class="tree-chevron expanded"'
  end

  test "destroy responds with turbo stream when requested" do
    create_test_note("to_delete.md")

    delete destroy_note_url(path: "to_delete.md"),
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :success

    assert_includes response.content_type, "turbo-stream"
    assert_includes response.body, 'action="update"'
    assert_includes response.body, 'target="file-tree-content"'
    # Deleted file should not appear in tree
    refute_includes response.body, 'data-path="to_delete.md"'
  end

  test "rename responds with turbo stream when requested" do
    create_test_note("old_name.md", "Content")

    post rename_note_url(path: "old_name.md"),
      params: { new_path: "new_name.md", expanded: "" },
      headers: { "Accept" => "text/vnd.turbo-stream.html" }
    assert_response :success

    assert_includes response.content_type, "turbo-stream"
    assert_includes response.body, 'action="update"'
    assert_includes response.body, 'target="file-tree-content"'
    # Tree should contain the renamed file
    assert_includes response.body, 'data-path="new_name.md"'
    refute_includes response.body, 'data-path="old_name.md"'
  end
end
