# frozen_string_literal: true

require "test_helper"

class ImageLibraryPickerTest < ActionDispatch::IntegrationTest
  setup do
    setup_test_notes_dir
    @server = @test_notes_dir.join("server")
    FileUtils.mkdir_p(@server)
    Config.new.set("images_path", @server.to_s)
    ImagesService.stubs(:get_image_dimensions).returns(width: nil, height: nil)
  end

  teardown do
    teardown_test_notes_dir
  end

  def picker(**params)
    get "/library/picker", params: params, headers: { "Accept" => "text/vnd.turbo-stream.html" }
  end

  test "picker defaults to managed images and renders escaped markup with local references" do
    create_test_note("images/a <photo>.png", "image")
    create_test_note("videos/clip.mp4", "video")
    @server.join("server.png").write("server")
    picker
    assert_response :success
    assert_equal "text/vnd.turbo-stream.html", response.media_type
    assert_select 'turbo-stream[action="replace"][target="image-picker-library-results"]'
    assert_includes response.body, "images/a &lt;photo&gt;.png"
    assert_includes response.body, "/notes/images/a%20%3Cphoto%3E.png"
    refute_includes response.body, "server.png"
    refute_includes response.body, "clip.mp4"
  end

  test "server collection uses existing preview URLs without exposing filesystem paths" do
    @server.join("server photo.png").write("server")
    picker(collection: "server")
    assert_response :success
    assert_includes response.body, "/images/preview/server%20photo.png"
    assert_includes response.body, 'data-collection="server"'
    refute_includes response.body, @server.to_s
  end

  test "managed images support search and bounded pagination" do
    3.times { |index| create_test_note("images/photo#{index}.png", "image") }
    create_test_note("images/other.png", "image")
    picker(search: "PHOTO", limit: 2, offset: 0)
    assert_response :success
    assert_includes response.body, 'data-total="3"'
    assert_equal 2, response.body.scan('data-action="click->local-images#select"').length
    picker(search: "PHOTO", limit: 2, offset: 2)
    assert_equal 1, response.body.scan('data-action="click->local-images#select"').length
  end

  test "managed images remain browsable with S3 selected and its credentials missing" do
    create_test_note("images/photo.png", "image")
    @test_notes_dir.join(".fed").write("media_storage_provider = s3\n")
    picker
    assert_response :success
    assert_includes response.body, 'data-url="images/photo.png"'
  end

  test "unconfigured or missing server folders produce a useful empty state" do
    Config.new.set("images_path", @test_notes_dir.join("missing").to_s)
    picker(collection: "server")
    assert_response :success
    assert_includes response.body, I18n.t("dialogs.image_picker.local_path_required")
    Config.new.set("images_path", "")
    picker(collection: "server")
    assert_response :success
  end

  test "managed collection omits symlinks and unsupported files" do
    create_test_note("images/photo.png", "image")
    create_test_note("images/unsafe.svg", "svg")
    File.symlink(@test_notes_dir.join("images/photo.png"), @test_notes_dir.join("images/link.png"))
    picker
    assert_response :success
    refute_includes response.body, "unsafe.svg"
    refute_includes response.body, "link.png"
  end

  test "unknown collections are rejected without accessing S3" do
    picker(collection: "s3")
    assert_response :bad_request
  end

  test "filesystem access failures are reported without exposing paths" do
    ImageLibraryService.any_instance.stubs(:list).raises(Errno::EACCES)
    picker
    assert_response :unprocessable_entity
    refute_includes response.body, @test_notes_dir.to_s
  end
end
