# frozen_string_literal: true

require "test_helper"

class PathSafetyTest < ActiveSupport::TestCase
  BASE = "/data/notes"

  test "contains a plain path inside base" do
    assert_equal Pathname.new("/data/notes/note.md"), PathSafety.contain(BASE, "note.md")
  end

  test "contains a nested path inside base" do
    assert_equal Pathname.new("/data/notes/a/b.md"), PathSafety.contain(BASE, "a/b.md")
  end

  test "rejects ../ traversal" do
    assert_nil PathSafety.contain(BASE, "../../etc/passwd")
  end

  test "rejects an absolute path outside base" do
    assert_nil PathSafety.contain(BASE, "/etc/passwd")
  end

  test "rejects a sibling directory that shares the name prefix" do
    # The exact bypass a raw String#start_with? allowed: base /data/notes wrongly
    # accepting /data/notes-backup because the string prefix matched.
    assert_nil PathSafety.contain(BASE, "/data/notes-backup/secret.md")
    assert_nil PathSafety.contain(BASE, "/data/notesX")
  end

  test "allows a filename that legitimately contains dot-dot" do
    # The old gsub(/\.\./, "") mangled "notes..v2.md" into "notesv2.md".
    assert_equal Pathname.new("/data/notes/notes..v2.md"), PathSafety.contain(BASE, "notes..v2.md")
  end

  test "returns nil for a nil path" do
    assert_nil PathSafety.contain(BASE, nil)
  end

  test "rejects a symlink that resolves outside base" do
    Dir.mktmpdir do |raw|
      tmp = File.realpath(raw) # resolve /tmp -> /private/tmp on macOS
      base = File.join(tmp, "notes")
      outside = File.join(tmp, "outside")
      FileUtils.mkdir_p(base)
      FileUtils.mkdir_p(outside)
      File.write(File.join(outside, "secret.txt"), "x")
      File.symlink(File.join(outside, "secret.txt"), File.join(base, "link.txt"))

      assert_nil PathSafety.contain(base, "link.txt")
    end
  end

  test "allows a real file inside base" do
    Dir.mktmpdir do |raw|
      tmp = File.realpath(raw)
      base = File.join(tmp, "notes")
      FileUtils.mkdir_p(base)
      File.write(File.join(base, "ok.md"), "x")

      assert_equal Pathname.new(File.join(base, "ok.md")), PathSafety.contain(base, "ok.md")
    end
  end
end
