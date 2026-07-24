# frozen_string_literal: true

require "test_helper"

class NotesServiceTest < ActiveSupport::TestCase
  def setup
    setup_test_notes_dir
    @service = NotesService.new(base_path: @test_notes_dir)
  end

  def teardown
    teardown_test_notes_dir
  end

  # === list_tree ===

  test "list_tree returns empty array for empty directory" do
    assert_equal [], @service.list_tree
  end

  test "list_tree returns files with correct structure" do
    create_test_note("note1.md")
    create_test_note("note2.md")

    tree = @service.list_tree
    assert_equal 2, tree.length
    assert tree.all? { |item| item[:type] == "file" }
    assert tree.map { |item| item[:name] }.sort == %w[note1 note2]
  end

  test "list_tree returns nested folders with children" do
    create_test_folder("folder1")
    create_test_note("folder1/nested.md")

    tree = @service.list_tree
    assert_equal 1, tree.length

    folder = tree.first
    assert_equal "folder", folder[:type]
    assert_equal "folder1", folder[:name]
    assert_equal 1, folder[:children].length
    assert_equal "nested", folder[:children].first[:name]
  end

  test "list_tree sorts folders before files" do
    create_test_note("zebra.md")
    create_test_folder("alpha")

    tree = @service.list_tree
    assert_equal "folder", tree.first[:type]
    assert_equal "file", tree.last[:type]
  end

  test "list_tree keeps folder order stable regardless of mtime updates" do
    create_test_folder("alpha")
    create_test_folder("beta")
    create_test_note("note.md")

    # Simulate recent activity in beta (e.g., dropping a file into the folder).
    beta_dir = @test_notes_dir.join("beta")
    now = Time.now
    File.utime(now, now + 60, beta_dir)

    tree = @service.list_tree
    folder_names = tree.select { |item| item[:type] == "folder" }.map { |item| item[:name] }

    assert_equal %w[alpha beta], folder_names
  end

  test "list_tree skips broken symlinks instead of raising" do
    create_test_note("real.md")
    broken_link = @test_notes_dir.join("dangling.md")
    File.symlink("/nonexistent/target.md", broken_link)

    tree = @service.list_tree
    assert_equal %w[real], tree.map { |item| item[:name] }
  end

  test "list_tree ignores hidden files" do
    create_test_note(".hidden.md")
    create_test_note("visible.md")

    tree = @service.list_tree
    assert_equal 1, tree.length
    assert_equal "visible", tree.first[:name]
  end

  test "list_tree shows .fed config file" do
    @test_notes_dir.join(".fed").write("theme = dark")
    create_test_note("note.md")

    tree = @service.list_tree
    assert_equal 2, tree.length

    config = tree.find { |item| item[:name] == ".fed" }
    assert_not_nil config
    assert_equal "file", config[:type]
    assert_equal "config", config[:file_type]
    assert_equal ".fed", config[:path]
  end

  test "list_tree does not show .fed in subfolders" do
    create_test_folder("subfolder")
    @test_notes_dir.join("subfolder/.fed").write("theme = dark")
    create_test_note("subfolder/note.md")

    tree = @service.list_tree
    folder = tree.find { |item| item[:type] == "folder" }
    assert_not_nil folder

    # .fed in subfolder should be ignored
    assert_equal 1, folder[:children].length
    assert_equal "note", folder[:children].first[:name]
  end

  test "list_tree marks markdown files with file_type" do
    create_test_note("note.md")

    tree = @service.list_tree
    assert_equal "markdown", tree.first[:file_type]
  end

  # === read ===

  test "read returns file content" do
    create_test_note("test.md", "Hello World")

    content = @service.read("test.md")
    assert_equal "Hello World", content
  end

  test "read raises NotFoundError for missing file" do
    assert_raises(NotesService::NotFoundError) do
      @service.read("nonexistent.md")
    end
  end

  # === write ===

  test "write creates new file" do
    @service.write("new.md", "New content")

    assert @test_notes_dir.join("new.md").exist?
    assert_equal "New content", File.read(@test_notes_dir.join("new.md"))
  end

  test "write overwrites existing file" do
    create_test_note("existing.md", "Old content")

    @service.write("existing.md", "New content")
    assert_equal "New content", File.read(@test_notes_dir.join("existing.md"))
  end

  test "write creates parent directories" do
    @service.write("deep/nested/note.md", "Content")

    assert @test_notes_dir.join("deep/nested/note.md").exist?
  end

  test "write does not leave temp files behind" do
    @service.write("note.md", "content")

    temps = Dir.children(@test_notes_dir).select { |f| f.end_with?(".tmp") }
    assert_empty temps, "atomic write should clean up its temp file"
  end

  test "write preserves the original note when the atomic rename fails" do
    create_test_note("note.md", "Original content")
    File.stubs(:rename).raises(Errno::ENOSPC)

    assert_raises(Errno::ENOSPC) { @service.write("note.md", "New content that fails") }

    # The write was atomic: the original is untouched (not truncated/corrupted)
    # and the temp file was cleaned up.
    assert_equal "Original content", File.read(@test_notes_dir.join("note.md"))
    temps = Dir.children(@test_notes_dir).select { |f| f.end_with?(".tmp") }
    assert_empty temps, "failed atomic write should not leave a temp file behind"
  end

  test "write creates Hugo blog post directory structure" do
    # Hugo blog posts use YYYY/MM/DD/slug/index.md structure
    hugo_path = "2026/01/30/my-first-post/index.md"
    hugo_content = <<~FRONTMATTER
      ---
      title: "My First Post"
      slug: "my-first-post"
      date: 2026-01-30T14:30:00-0300
      draft: true
      tags:
      -
      ---

      Post content goes here.
    FRONTMATTER

    @service.write(hugo_path, hugo_content)

    assert @test_notes_dir.join("2026").directory?
    assert @test_notes_dir.join("2026/01").directory?
    assert @test_notes_dir.join("2026/01/30").directory?
    assert @test_notes_dir.join("2026/01/30/my-first-post").directory?
    assert @test_notes_dir.join(hugo_path).file?
    assert_equal hugo_content, File.read(@test_notes_dir.join(hugo_path))
  end

  # === delete ===

  test "delete removes file" do
    path = create_test_note("to_delete.md")

    @service.delete("to_delete.md")
    refute path.exist?
  end

  test "delete raises NotFoundError for missing file" do
    assert_raises(NotesService::NotFoundError) do
      @service.delete("nonexistent.md")
    end
  end

  # === rename ===

  test "rename moves file to new location" do
    create_test_note("old.md", "Content")

    @service.rename("old.md", "new.md")

    refute @test_notes_dir.join("old.md").exist?
    assert @test_notes_dir.join("new.md").exist?
    assert_equal "Content", File.read(@test_notes_dir.join("new.md"))
  end

  test "rename moves file to different folder" do
    create_test_note("root.md", "Content")
    create_test_folder("subfolder")

    @service.rename("root.md", "subfolder/moved.md")

    refute @test_notes_dir.join("root.md").exist?
    assert @test_notes_dir.join("subfolder/moved.md").exist?
  end

  test "rename moves folder with contents" do
    create_test_folder("old_folder")
    create_test_note("old_folder/note.md", "Content")

    @service.rename("old_folder", "new_folder")

    refute @test_notes_dir.join("old_folder").exist?
    assert @test_notes_dir.join("new_folder").exist?
    assert @test_notes_dir.join("new_folder/note.md").exist?
  end

  test "rename raises NotFoundError for missing source" do
    assert_raises(NotesService::NotFoundError) do
      @service.rename("nonexistent.md", "new.md")
    end
  end

  # === create_folder ===

  test "create_folder creates directory" do
    @service.create_folder("new_folder")

    assert @test_notes_dir.join("new_folder").directory?
  end

  test "create_folder creates nested directories" do
    @service.create_folder("deep/nested/folder")

    assert @test_notes_dir.join("deep/nested/folder").directory?
  end

  # === delete_folder ===

  test "delete_folder removes empty directory" do
    create_test_folder("empty_folder")

    @service.delete_folder("empty_folder")
    refute @test_notes_dir.join("empty_folder").exist?
  end

  test "delete_folder raises InvalidPathError for non-empty directory" do
    create_test_folder("folder")
    create_test_note("folder/note.md")

    assert_raises(NotesService::InvalidPathError) do
      @service.delete_folder("folder")
    end
  end

  # === security ===

  test "prevents path traversal attacks" do
    assert_raises(NotesService::InvalidPathError) do
      @service.read("../../../etc/passwd")
    end
  end

  test "rejects paths that traverse out of the base directory" do
    create_test_note("safe.md", "Safe content")

    # ".." that escapes the base is rejected outright, not silently sanitized
    # (the old gsub approach also mangled legitimate filenames containing "..").
    assert_raises(NotesService::InvalidPathError) do
      @service.read("folder/../../../etc/passwd")
    end
  end

  test "allows a filename that legitimately contains double dots" do
    @service.write("notes..v2.md", "kept intact")

    assert_equal "kept intact", @service.read("notes..v2.md")
    assert @test_notes_dir.join("notes..v2.md").exist?
  end

  # === search_content ===

  test "search_content returns empty array for blank query" do
    create_test_note("note.md", "Some content")
    assert_equal [], @service.search_content("")
    assert_equal [], @service.search_content(nil)
  end

  test "search_content finds text in files" do
    create_test_note("note1.md", "Hello world\nThis is a test")
    create_test_note("note2.md", "Another file\nWith different content")

    results = @service.search_content("world")
    assert_equal 1, results.length
    assert_equal "note1.md", results.first[:path]
    assert_equal 1, results.first[:line_number]
    assert_includes results.first[:match_text], "world"
  end

  test "search_content is case insensitive" do
    create_test_note("note.md", "Hello World")

    results = @service.search_content("WORLD")
    assert_equal 1, results.length
  end

  test "search_content does not fail on a file with invalid UTF-8 bytes" do
    # A Latin-1/binary .md anywhere in the tree must not take down the whole search.
    File.binwrite(@test_notes_dir.join("bad.md"), "hello \xFF\xFE world\n")
    create_test_note("good.md", "hello world")

    results = nil
    assert_nothing_raised { results = @service.search_content("world") }
    assert_includes results.map { |r| r[:path] }, "good.md"
  end

  test "search_content matches text in a file with invalid UTF-8, scrubbing bad bytes" do
    File.binwrite(@test_notes_dir.join("bad.md"), "target_word \xFF here\n")

    results = @service.search_content("target_word")
    assert_includes results.map { |r| r[:path] }, "bad.md"
  end

  test "search_content supports regex patterns" do
    create_test_note("note.md", "foo123bar\nfoo456bar\nhello world")

    results = @service.search_content("foo\\d+bar")
    assert_equal 2, results.length
  end

  test "search_content includes context lines" do
    content = "line1\nline2\nMATCH HERE\nline4\nline5"
    create_test_note("note.md", content)

    results = @service.search_content("MATCH", context_lines: 2)
    assert_equal 1, results.length

    context = results.first[:context]
    assert_equal 5, context.length
    assert_equal 1, context.first[:line_number]
    assert_equal 5, context.last[:line_number]
    assert context.find { |c| c[:is_match] }[:content].include?("MATCH")
  end

  test "search_content respects max_results" do
    5.times do |i|
      create_test_note("note#{i}.md", "findme")
    end

    results = @service.search_content("findme", max_results: 3)
    assert_equal 3, results.length
  end

  test "search_content searches nested folders" do
    create_test_folder("folder")
    create_test_note("folder/nested.md", "find this text")

    results = @service.search_content("find this")
    assert_equal 1, results.length
    assert_equal "folder/nested.md", results.first[:path]
  end

  test "search_content handles invalid regex by escaping" do
    create_test_note("note.md", "test [brackets]")

    # Invalid regex should be escaped and treated as literal
    results = @service.search_content("[brackets")
    assert_equal 1, results.length
  end
end
