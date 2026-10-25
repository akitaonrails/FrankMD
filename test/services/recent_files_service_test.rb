# frozen_string_literal: true

require "test_helper"

class RecentFilesServiceTest < ActiveSupport::TestCase
  setup do
    setup_test_notes_dir
    @config = Config.new
    @history = RecentFilesService.new(config: @config)
  end

  teardown { teardown_test_notes_dir }

  test "shares bounded deduplicated opening order across instances" do
    12.times do |index|
      create_test_note("#{index}.md")
      assert @history.record("#{index}.md")
    end
    assert @history.record("4.md")
    entries = RecentFilesService.new.entries
    assert_equal 10, entries.size
    assert_equal "4.md", entries.first.fetch("path")
    assert_equal entries.map { |item| item["path"] }.uniq.size, entries.size
    assert Time.iso8601(entries.first.fetch("opened_at"))
    refute_includes @test_notes_dir.join(".fed").read, "# Test"
  end

  test "external deletion is filtered without removing unrelated entries" do
    create_test_note("gone.md")
    create_test_note("keep.md")
    @history.record("gone.md")
    @history.record("keep.md")
    @test_notes_dir.join("gone.md").delete
    assert_equal [ "keep.md" ], @history.entries.map { |item| item["path"] }
    assert_raises(NotesService::NotFoundError) { @history.record("gone.md") }
    refute @test_notes_dir.join("gone.md").exist?
  end

  test "successful file and folder mutations update shared history" do
    create_test_note("docs/first.md")
    create_test_note("docs-other/other.md")
    @history.record("docs/first.md")
    @history.record("docs-other/other.md")
    notes = NotesService.new
    notes.rename("docs", "renamed")
    assert_equal [ "docs-other/other.md", "renamed/first.md" ], RecentFilesService.new.entries.map { |item| item["path"] }
    notes.rename("renamed/first.md", "renamed/second.md")
    notes.delete("renamed/second.md")
    assert_equal [ "docs-other/other.md" ], RecentFilesService.new.entries.map { |item| item["path"] }
  end

  test "rejects traversal hidden files outside symlinks and non-markdown paths" do
    create_test_note("safe.md")
    @test_notes_dir.join("outside.md").make_symlink(Rails.root.join("README.md"))
    [ "../README.md", "/tmp/secret.md", ".secret.md", "docs/../safe.md", "outside.md", "image.png", nil ].each do |path|
      assert_raises(NotesService::NotFoundError) { @history.record(path) }
    end
  end

  test "permission errors do not erase an existing entry" do
    create_test_note("safe.md")
    @history.record("safe.md")
    Pathname.any_instance.stubs(:stat).raises(Errno::EACCES)
    assert_equal "safe.md", @history.entries.first.fetch("path")
  end

  test "concurrent config modifications preserve every opening and settings" do
    6.times { |index| create_test_note("#{index}.md") }
    configs = Array.new(6) { Config.new }
    threads = configs.each_with_index.map do |config, index|
      Thread.new { RecentFilesService.new(config: config).record("#{index}.md") }
    end
    threads << Thread.new { Config.new.set("theme", "nord") }
    threads.each(&:value)
    assert_equal 6, RecentFilesService.new.entries.size
    assert_equal "nord", Config.new.get("theme")
  end

  test "malformed history does not discard other configuration" do
    @test_notes_dir.join(".fed").write("theme = nord\nrecent_files = [broken\n")
    config = Config.new
    assert_equal "nord", config.get("theme")
    assert_empty RecentFilesService.new(config: config).entries
    assert @history.clear
    assert_empty RecentFilesService.new.entries
  end
end
