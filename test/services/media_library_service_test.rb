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

  private

  def write_media(relative_path, contents)
    path = @test_notes_dir.join(relative_path)
    FileUtils.mkdir_p(path.dirname)
    File.binwrite(path, contents)
    path
  end
end
