# frozen_string_literal: true

require "test_helper"

class MediaLibraryServiceTest < ActiveSupport::TestCase
  def setup
    setup_test_notes_dir
    @config = stub("config")
    @config.stubs(:upload_extensions).with("image_upload_extensions").returns(%w[.png .jpg])
    @config.stubs(:upload_extensions).with("video_upload_extensions").returns(%w[.mp4 .webm])
    @service = MediaLibraryService.new(base_path: @test_notes_dir, config: @config)
  end

  def teardown
    teardown_test_notes_dir
  end

  test "list returns supported images and videos with note asset preview paths" do
    write_media("images/photo.png", "image")
    write_media("images/not-supported.svg", "unsupported image")
    write_media("videos/clip.mp4", "video")
    write_media("videos/nested/clip.webm", "nested video")
    write_media("videos/readme.txt", "unsupported video")

    result = @service.list

    assert_equal [ "images/photo.png" ], result[:images].map { |item| item[:path] }.sort
    assert_equal [ "videos/clip.mp4", "videos/nested/clip.webm" ], result[:videos].map { |item| item[:path] }.sort
    image = result[:images].first
    assert_equal "photo.png", image[:name]
    assert_equal "image", result[:images].first[:type]
    assert_equal "video", result[:videos].first[:type]
    assert_equal "/notes/images/photo.png", image[:preview_url]
    assert_equal "image".bytesize, image[:size]
    assert_kind_of String, image[:mtime]
  end

  test "list ignores symlinked media files and directories" do
    outside = @test_notes_dir.parent.join("outside_media_#{SecureRandom.hex(6)}.png")
    write_media("images/real.png", "real")
    File.write(outside, "outside")
    File.symlink(outside, @test_notes_dir.join("images/linked.png"))
    File.symlink(outside.dirname, @test_notes_dir.join("images/external"))

    assert_equal [ "images/real.png" ], @service.list[:images].map { |item| item[:path] }
  ensure
    FileUtils.rm_f(outside) if outside
  end

  test "delete removes a supported file from a managed media directory" do
    path = write_media("images/nested/photo.png", "image")

    assert @service.delete("images/nested/photo.png")
    refute path.exist?
  end

  test "delete rejects traversal, absolute paths, and paths outside managed roots" do
    outside = @test_notes_dir.parent.join("library_delete_outside_#{SecureRandom.hex(6)}.png")
    File.write(outside, "outside")
    write_media("notes.png", "note")
    write_media("attachments/photo.png", "attachment")

    refute @service.delete("images/../#{outside.basename}")
    refute @service.delete(outside.to_s)
    refute @service.delete("notes.png")
    refute @service.delete("attachments/photo.png")
    assert outside.exist?
    assert @test_notes_dir.join("notes.png").exist?
    assert @test_notes_dir.join("attachments/photo.png").exist?
  ensure
    FileUtils.rm_f(outside) if outside
  end

  test "delete rejects unsupported extensions" do
    path = write_media("images/readme.md", "note content")

    refute @service.delete("images/readme.md")
    assert path.exist?
  end

  test "delete resolves paths containing null bytes to not-found instead of raising" do
    write_media("images/photo.png", "image")

    refute @service.delete("images/a\0b.png")
    refute @service.delete("images/nested/a\0b.png")
    refute @service.delete("images/\0")
    assert @test_notes_dir.join("images/photo.png").exist?
  end

  test "delete rejects symlinks in nested directories and leaves their targets intact" do
    outside = @test_notes_dir.parent.join("library_symlink_target_#{SecureRandom.hex(6)}.png")
    File.write(outside, "outside")
    FileUtils.mkdir_p(@test_notes_dir.join("images"))
    File.symlink(outside.dirname, @test_notes_dir.join("images/external"))

    refute @service.delete("images/external/#{outside.basename}")
    assert outside.exist?
    assert File.symlink?(@test_notes_dir.join("images/external"))
  ensure
    FileUtils.rm_f(outside) if outside
  end

  test "delete rejects a symlinked leaf file and leaves its target intact" do
    outside = @test_notes_dir.parent.join("library_symlink_leaf_target_#{SecureRandom.hex(6)}.png")
    File.write(outside, "outside")
    FileUtils.mkdir_p(@test_notes_dir.join("images"))
    File.symlink(outside, @test_notes_dir.join("images/linked.png"))

    refute @service.delete("images/linked.png")
    assert outside.exist?
    assert File.symlink?(@test_notes_dir.join("images/linked.png"))
  ensure
    FileUtils.rm_f(outside) if outside
  end

  test "delete reports filesystem errors to its caller" do
    path = write_media("images/protected.png", "image")
    File.stubs(:delete).with(path).raises(Errno::EACCES)

    assert_raises(Errno::EACCES) { @service.delete("images/protected.png") }
    assert path.exist?
  end

  private

  def write_media(relative_path, contents)
    path = @test_notes_dir.join(relative_path)
    FileUtils.mkdir_p(path.dirname)
    File.binwrite(path, contents)
    path
  end
end
