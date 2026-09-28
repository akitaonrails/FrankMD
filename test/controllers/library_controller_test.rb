# frozen_string_literal: true

require "test_helper"

class LibraryControllerTest < ActionDispatch::IntegrationTest
  def setup
    setup_test_notes_dir
    @config = stub("config")
    @config.stubs(:get).returns(nil)
    @config.stubs(:upload_extensions).with("image_upload_extensions").returns(%w[.png .jpg])
    @config.stubs(:upload_extensions).with("video_upload_extensions").returns(%w[.mp4 .webm])
    Config.stubs(:new).returns(@config)
  end

  def teardown
    teardown_test_notes_dir
  end

  test "index returns supported image and video groups with metadata" do
    write_media("images/Photo.png", "image")
    write_media("videos/clip.mp4", "video")
    write_media("images/ignored.svg", "not allowed")

    get "/library", as: :json

    assert_response :success
    data = JSON.parse(response.body)
    assert_equal [ "Photo.png" ], data.dig("images").map { |item| item["name"] }
    assert_equal [ "clip.mp4" ], data.dig("videos").map { |item| item["name"] }
    assert_equal "images/Photo.png", data.dig("images", 0, "path")
    assert_equal "/notes/images/Photo.png", data.dig("images", 0, "preview_url")
    assert_equal "image", data.dig("images", 0, "type")
  end

  test "index excludes symlinked media without exposing their targets" do
    outside = @test_notes_dir.parent.join("library_outside_#{SecureRandom.hex(6)}.png")
    File.write(outside, "outside")
    FileUtils.mkdir_p(@test_notes_dir.join("images"))
    File.symlink(outside, @test_notes_dir.join("images/linked.png"))

    get "/library", as: :json

    assert_response :success
    assert_empty JSON.parse(response.body).dig("images")
    assert outside.exist?
  ensure
    FileUtils.rm_f(outside) if outside
  end

  test "usage returns distinct counts without sending the reverse index" do
    create_test_note(
      "first.md",
      "![first](images/photo.png)\n[again](images/photo.png)\n[clip](videos/clip.mp4)"
    )
    create_test_note("nested/second.md", "![photo](../images/photo.png)")
    write_media("images/unused.png", "unused")

    get "/library/usage", as: :json

    assert_response :success
    usage_counts = JSON.parse(response.body).fetch("usage_counts")
    assert_equal 2, usage_counts.fetch("images/photo.png")
    assert_equal 1, usage_counts.fetch("videos/clip.mp4")
    refute usage_counts.key?("images/unused.png")

    refute JSON.parse(response.body).key?("usage_notes")
  end

  test "usage returns note paths only for the requested media item" do
    create_test_note("first.md", "![photo](images/photo.png)\n[clip](videos/clip.mp4)")
    create_test_note("second.md", "![photo](images/photo.png)")

    get "/library/usage", params: { path: "images/photo.png" }, as: :json

    assert_response :success
    data = JSON.parse(response.body)
    assert_equal [ "first.md", "second.md" ], data.fetch("usage_notes")
    refute data.key?("usage_counts")
  end

  test "usage counts repeated references from one note once" do
    create_test_note("repeated.md", "![first](images/photo.png)\n![second](images/photo.png)")

    get "/library/usage", as: :json

    assert_response :success
    data = JSON.parse(response.body)
    assert_equal({ "images/photo.png" => 1 }, data.fetch("usage_counts"))
    refute data.key?("usage_notes")
  end

  test "usage builds the index once per request" do
    MediaUsageService.any_instance.expects(:build_index).once.returns({ "images/photo.png" => [ "note.md" ] })

    get "/library/usage", as: :json

    assert_response :success
    data = JSON.parse(response.body)
    assert_equal({ "images/photo.png" => 1 }, data.fetch("usage_counts"))
    refute data.key?("usage_notes")
  end

  test "usage returns no partial map and a localized error when the note scan fails" do
    MediaUsageService.any_instance.expects(:build_index).once.raises(MediaUsageService::ScanError, "read failed")

    get "/library/usage", as: :json

    assert_response :service_unavailable
    data = JSON.parse(response.body)
    assert_equal I18n.t("library.usage_scan_failed"), data.fetch("error")
    refute data.key?("usage_counts")
    refute data.key?("usage_notes")
  end

  test "usage returns a localized error when a notes directory cannot be scanned" do
    MediaUsageService.any_instance.expects(:build_index).once.raises(Errno::EACCES)

    get "/library/usage", as: :json

    assert_response :service_unavailable
    assert_equal I18n.t("library.usage_scan_failed"), JSON.parse(response.body).fetch("error")
  end

  test "destroy removes a supported media file" do
    path = write_media("images/photo.png", "image")

    delete "/library/file/images/photo.png", as: :json

    assert_response :no_content
    refute path.exist?
  end

  test "destroy rejects traversal, unrelated roots, and unsupported files" do
    outside = @test_notes_dir.parent.join("library_controller_outside_#{SecureRandom.hex(6)}.png")
    File.write(outside, "outside")
    unrelated = write_media("attachments/photo.png", "attachment")
    unsupported = write_media("images/readme.md", "note")

    delete "/library/file/images/../#{outside.basename}", as: :json
    assert_response :not_found
    assert outside.exist?

    delete "/library/file/attachments/photo.png", as: :json
    assert_response :not_found
    assert unrelated.exist?

    delete "/library/file/images/readme.md", as: :json
    assert_response :not_found
    assert unsupported.exist?
  ensure
    FileUtils.rm_f(outside) if outside
  end

  test "destroy returns a clear error when the filesystem rejects deletion" do
    write_media("images/protected.png", "image")
    MediaLibraryService.any_instance.stubs(:delete).raises(Errno::EACCES)

    delete "/library/file/images/protected.png", as: :json

    assert_response :unprocessable_entity
    assert_equal I18n.t("library.delete_failed"), JSON.parse(response.body)["error"]
  end

  private

  def write_media(relative_path, contents)
    path = @test_notes_dir.join(relative_path)
    FileUtils.mkdir_p(path.dirname)
    File.binwrite(path, contents)
    path
  end
end
