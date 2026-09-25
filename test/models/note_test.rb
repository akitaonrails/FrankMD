# frozen_string_literal: true

require "test_helper"

class NoteTest < ActiveSupport::TestCase
  def setup
    setup_test_notes_dir
  end

  def teardown
    teardown_test_notes_dir
  end

  # === Note.find ===

  test "Note.find returns note with content" do
    create_test_note("test.md", "# Hello")
    note = Note.find("test.md")

    assert_equal "test.md", note.path
    assert_equal "# Hello", note.content
    assert_equal "test", note.name
  end

  test "Note.find normalizes path without .md extension" do
    create_test_note("test.md", "# Hello")
    note = Note.find("test")

    assert_equal "test.md", note.path
    assert_equal "# Hello", note.content
  end

  test "Note.find raises for missing note" do
    assert_raises(NotesService::NotFoundError) do
      Note.find("nonexistent.md")
    end
  end

  test "Note.find works with nested paths" do
    create_test_folder("deep/nested")
    create_test_note("deep/nested/file.md", "# Nested")
    note = Note.find("deep/nested/file.md")

    assert_equal "deep/nested/file.md", note.path
    assert_equal "# Nested", note.content
    assert_equal "file", note.name
    assert_equal "deep/nested", note.directory
  end

  test "Note.find works with .fed config file" do
    @test_notes_dir.join(".fed").write("theme = dark")
    note = Note.find(".fed")

    assert_equal ".fed", note.path
    assert_equal "theme = dark", note.content
  end

  # === Note.normalize_path ===

  test "normalize_path adds .md extension to regular paths" do
    assert_equal "test.md", Note.normalize_path("test")
    assert_equal "folder/file.md", Note.normalize_path("folder/file")
  end

  test "normalize_path does not add .md to paths already having it" do
    assert_equal "test.md", Note.normalize_path("test.md")
  end

  test "normalize_path does not add .md to .fed" do
    assert_equal ".fed", Note.normalize_path(".fed")
  end

  test "normalize_path handles blank paths" do
    assert_equal "", Note.normalize_path("")
    assert_equal "", Note.normalize_path(nil)
  end

  # === Note.all ===

  test "Note.all returns tree structure" do
    create_test_note("note1.md")
    create_test_folder("folder")
    create_test_note("folder/note2.md")

    tree = Note.all
    assert_kind_of Array, tree
    assert tree.any? { |item| item[:name] == "note1" }
    assert tree.any? { |item| item[:name] == "folder" && item[:type] == "folder" }
  end

  # === Note.search ===

  test "Note.search returns matching results" do
    create_test_note("searchable.md", "Hello world findme content")

    results = Note.search("findme")
    assert_equal 1, results.length
    assert_equal "searchable.md", results.first[:path]
  end

  # === note.save ===

  test "note.save creates new file" do
    note = Note.new(path: "new.md", content: "# New")
    assert note.save
    assert File.exist?(@test_notes_dir.join("new.md"))
    assert_equal "# New", File.read(@test_notes_dir.join("new.md"))
  end

  test "note.save updates existing file" do
    create_test_note("existing.md", "Old content")
    note = Note.new(path: "existing.md", content: "New content")

    assert note.save
    assert_equal "New content", File.read(@test_notes_dir.join("existing.md"))
  end

  test "note.save creates parent directories" do
    note = Note.new(path: "deep/nested/new.md", content: "# Nested")
    assert note.save
    assert File.exist?(@test_notes_dir.join("deep/nested/new.md"))
  end

  test "note.save validates path format" do
    note = Note.new(path: "../escape.md", content: "bad")
    refute note.valid?
    assert note.errors[:path].any?
  end

  test "note.save validates presence of path" do
    note = Note.new(path: "", content: "content")
    refute note.valid?
    assert note.errors[:path].any?
  end

  # === note.destroy ===

  test "note.destroy removes file" do
    create_test_note("to_delete.md")
    note = Note.new(path: "to_delete.md")

    assert note.destroy
    refute File.exist?(@test_notes_dir.join("to_delete.md"))
  end

  test "note.destroy deletes when the expected revision matches" do
    content = "current content"
    create_test_note("to_delete.md", content)
    note = Note.new(path: "to_delete.md")

    assert note.destroy(expected_revision: Digest::SHA256.hexdigest(content))
    refute File.exist?(@test_notes_dir.join("to_delete.md"))
  end

  test "note.destroy reports a revision conflict and preserves the changed file" do
    create_test_note("to_delete.md", "updated content")
    note = Note.new(path: "to_delete.md")

    refute note.destroy(expected_revision: Digest::SHA256.hexdigest("old content"))

    assert note.revision_conflict?
    assert_equal "updated content", File.read(@test_notes_dir.join("to_delete.md"))
  end

  test "note.destroy returns false for missing file" do
    note = Note.new(path: "nonexistent.md")
    refute note.destroy
    assert note.errors[:base].any?
  end

  # === note.rename ===

  test "note.rename moves file" do
    create_test_note("old.md", "content")
    note = Note.new(path: "old.md")

    assert note.rename("new.md")
    assert_equal "new.md", note.path
    refute File.exist?(@test_notes_dir.join("old.md"))
    assert File.exist?(@test_notes_dir.join("new.md"))
  end

  test "note.rename moves file to different directory" do
    create_test_note("root.md", "content")
    create_test_folder("subfolder")
    note = Note.new(path: "root.md")

    assert note.rename("subfolder/moved.md")
    assert_equal "subfolder/moved.md", note.path
    refute File.exist?(@test_notes_dir.join("root.md"))
    assert File.exist?(@test_notes_dir.join("subfolder/moved.md"))
  end

  # === note.exists? ===

  test "note.exists? returns true for existing file" do
    create_test_note("exists.md")
    note = Note.new(path: "exists.md")
    assert note.exists?
  end

  test "note.exists? returns false for missing file" do
    note = Note.new(path: "missing.md")
    refute note.exists?
  end

  # === note attributes ===

  test "note.name returns filename without extension" do
    note = Note.new(path: "my-note.md")
    assert_equal "my-note", note.name
  end

  test "note.directory returns parent directory" do
    note = Note.new(path: "folder/subfolder/note.md")
    assert_equal "folder/subfolder", note.directory
  end

  test "note.directory returns empty string for root files" do
    note = Note.new(path: "root.md")
    assert_equal "", note.directory
  end

  test "note.persisted? returns true when file exists" do
    create_test_note("persisted.md")
    note = Note.new(path: "persisted.md")
    assert note.persisted?
  end

  test "note.persisted? returns false when file does not exist" do
    note = Note.new(path: "not_persisted.md")
    refute note.persisted?
  end

  test "note.to_param returns path" do
    note = Note.new(path: "my/path.md")
    assert_equal "my/path.md", note.to_param
  end

  test "note.as_json returns hash with path, name, and content" do
    note = Note.new(path: "test.md", content: "# Test")
    json = note.as_json

    assert_equal "test.md", json[:path]
    assert_equal "test", json[:name]
    assert_equal "# Test", json[:content]
  end

  # === Permission and file system errors ===

  test "note.destroy handles file that disappeared" do
    create_test_note("disappearing.md", "content")
    note = Note.new(path: "disappearing.md")

    # Delete the file externally to simulate it being removed outside the app
    File.delete(@test_notes_dir.join("disappearing.md"))

    refute note.destroy
    assert note.errors[:base].any?
    assert_includes note.errors[:base].first, "not found"
  end

  test "note.rename handles source file that disappeared" do
    create_test_note("source.md", "content")
    note = Note.new(path: "source.md")

    # Delete the file externally
    File.delete(@test_notes_dir.join("source.md"))

    refute note.rename("destination.md")
    assert note.errors[:base].any?
  end

  test "note.save handles permission denied on create" do
    # Skip on Windows where chmod doesn't work the same way
    skip "chmod test not applicable on this platform" unless File.respond_to?(:chmod)

    # Create a directory with no write permission
    readonly_dir = @test_notes_dir.join("readonly")
    FileUtils.mkdir_p(readonly_dir)
    File.chmod(0o555, readonly_dir)

    note = Note.new(path: "readonly/cannot_write.md", content: "content")
    result = note.save

    # Restore permissions for cleanup
    File.chmod(0o755, readonly_dir)

    refute result
    assert note.errors[:base].any?
  end

  test "note.destroy handles permission denied" do
    skip "chmod test not applicable on this platform" unless File.respond_to?(:chmod)

    # Create a file and make parent directory read-only
    create_test_note("protected.md", "content")
    File.chmod(0o555, @test_notes_dir)

    note = Note.new(path: "protected.md")
    result = note.destroy

    # Restore permissions for cleanup
    File.chmod(0o755, @test_notes_dir)

    refute result
    assert note.errors[:base].any?
    assert_includes note.errors[:base].first, "Permission denied"
  end
end
