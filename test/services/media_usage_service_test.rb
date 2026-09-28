# frozen_string_literal: true

require "test_helper"

class MediaUsageServiceTest < ActiveSupport::TestCase
  def setup
    setup_test_notes_dir
    @service = MediaUsageService.new(base_path: @test_notes_dir)
  end

  def teardown
    teardown_test_notes_dir
  end

  test "indexes Markdown images, image links, and HTML video sources by distinct note" do
    create_test_note(
      "projects/guides/guide.md",
      <<~MARKDOWN
        ![photo](../../images/my%20cat.png)
        [![same photo](../../images/my%20cat.png)](https://example.test/photo)
        ![diagram](../../images/diagram%20%28draft%29.png)
        <video controls><source src="../../videos/clips/clip%20one.mp4" type="video/mp4"></video>
        [download video](../../videos/clips/clip%20one.mp4)
      MARKDOWN
    )
    create_test_note("index.md", "![photo](images/my%20cat.png)")

    assert_equal(
      {
        "images/diagram (draft).png" => [ "projects/guides/guide.md" ],
        "images/my cat.png" => %w[index.md projects/guides/guide.md],
        "videos/clips/clip one.mp4" => [ "projects/guides/guide.md" ]
      },
      @service.build_index
    )
  end

  test "normalizes Markdown destinations and HTML source URLs" do
    create_test_note(
      "docs/media.md",
      <<~MARKDOWN
        ![cover](../images/cover%20photo.png)
        [open image](/images/cover%20photo.png#full-size)
        <img src=/notes/images/inline%20photo.png>
        [trailer](../videos/trailer.mp4)
        <video src="../videos/trailer.mp4"></video>
      MARKDOWN
    )

    assert_equal(
      {
        "images/cover photo.png" => [ "docs/media.md" ],
        "images/inline photo.png" => [ "docs/media.md" ],
        "videos/trailer.mp4" => [ "docs/media.md" ]
      },
      @service.build_index
    )
  end

  test "indexes full, collapsed, and shortcut references with normalized labels" do
    create_test_note(
      "references.md",
      <<~MARKDOWN
        ![cover][  PHOTO   IMAGE ]
        ![video][]
        [shortcut]
        [ photo image ]: images/photo%20one.png
        [video]: videos/clip.mp4
        [shortcut]: images/shortcut.png
        [unused]: images/unused.png
      MARKDOWN
    )

    assert_equal(
      {
        "images/photo one.png" => [ "references.md" ],
        "images/shortcut.png" => [ "references.md" ],
        "videos/clip.mp4" => [ "references.md" ]
      },
      @service.build_index
    )
  end

  test "does not count an unused reference definition" do
    create_test_note("unused.md", "[photo]: images/photo.png\n")

    assert_equal({}, @service.build_index)
  end

  test "counts duplicate reference uses once per note" do
    create_test_note(
      "duplicates.md",
      <<~MARKDOWN
        ![first][photo]
        [second][  PHOTO ]
        ![photo][]
        [photo]
        [photo]: images/photo.png
      MARKDOWN
    )

    assert_equal({ "images/photo.png" => [ "duplicates.md" ] }, @service.build_index)
  end

  test "ignores plain text, unrelated URL substrings, and references inside code" do
    content = <<~MARKDOWN
      Plain mention: images/mentioned.png
      [external](https://example.test/notes/images/external.png)
      [near match](notimages/near.png)
      #{ "\x60" }![inline](images/inline-code.png)#{ "\x60" }

      #{ "\x60" * 3 }markdown
      ![fenced](images/fenced-code.png)
      <source src="videos/fenced-code.mp4">
      ![fenced reference][fenced]
      [fenced]: images/fenced-reference.png
      #{ "\x60" * 3 }

      <!-- <img src="images/commented-out.png"> -->
    MARKDOWN
    create_test_note("examples.md", content)

    assert_equal({}, @service.build_index)
  end

  test "resolves note-relative destinations and rejects paths outside the notes root" do
    create_test_note(
      "nested/page.md",
      <<~MARKDOWN
        ![photo](../images/photo.png)
        ![outside](../../images/outside.png)
        ![wrong root](../notes/images/wrong-root.png)
      MARKDOWN
    )

    assert_equal({ "images/photo.png" => [ "nested/page.md" ] }, @service.build_index)
  end

  test "ignores hidden notes and symlinked Markdown files" do
    create_test_note(".hidden/hidden.md", "![hidden](images/hidden.png)")
    create_test_note("visible.md", "![visible](images/visible.png)")

    outside = @test_notes_dir.parent.join("media_usage_outside_#{SecureRandom.hex(6)}.md")
    File.write(outside, "![outside](images/outside.png)")
    File.symlink(outside, @test_notes_dir.join("linked.md"))

    assert_equal({ "images/visible.png" => [ "visible.md" ] }, @service.build_index)
  ensure
    FileUtils.rm_f(outside) if outside
  end

  test "raises instead of returning a partial index when a note cannot be read" do
    create_test_note("readable.md", "![photo](images/photo.png)")
    create_test_note("unreadable.md", "![other](images/other.png)")
    Pathname.any_instance.stubs(:read).raises(Errno::EACCES)

    error = assert_raises(MediaUsageService::ScanError) { @service.build_index }

    assert_match(/Could not read Markdown note/, error.message)
  end
end
