# frozen_string_literal: true

require "test_helper"

class MediaServiceTest < ActiveSupport::TestCase
  DEFAULT_VIDEO_EXTENSIONS = %w[.mp4 .webm .mkv .mov .avi .m4v .ogv].freeze

  def setup
    @config_stub = stub("config")
    @config_stub.stubs(:get).returns(nil)
    @config_stub.stubs(:upload_extensions).with("video_upload_extensions").returns(DEFAULT_VIDEO_EXTENSIONS)
    Config.stubs(:new).returns(@config_stub)

    @notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
  end

  def uploaded(filename, content = "fake video bytes")
    Rack::Test::UploadedFile.new(StringIO.new(content), "video/mp4", original_filename: filename)
  end

  test "save_upload returns error when no file provided" do
    result = MediaService.save_upload(nil)
    assert result[:error]
  end

  test "save_upload writes an allowed video to notes/videos" do
    result = MediaService.save_upload(uploaded("clip.mp4"))

    assert result[:url], "expected a url, got #{result.inspect}"
    assert result[:url].start_with?("videos/")
    assert result[:url].include?("clip")

    saved = @notes_path.join(result[:url])
    assert saved.exist?
    FileUtils.rm_f(saved)
  end

  test "save_upload rejects a disallowed extension with a reason" do
    result = MediaService.save_upload(uploaded("notes.txt"))

    assert_nil result[:url]
    assert_includes result[:error], ".txt"
    assert_includes result[:error], "not an accepted video type"
  end

  test "save_upload rejects a file with no extension" do
    result = MediaService.save_upload(uploaded("README"))

    assert_nil result[:url]
    assert_includes result[:error], "no extension"
  end

  test "save_upload sanitizes the stored filename" do
    result = MediaService.save_upload(uploaded("my cool clip!.mp4"))

    assert result[:url]
    refute_includes result[:url], " "
    refute_includes result[:url], "!"

    FileUtils.rm_f(@notes_path.join(result[:url]))
  end

  test "save_upload neutralizes path traversal in the filename" do
    result = MediaService.save_upload(uploaded("../../../etc/evil.mp4"))

    assert result[:url], "expected a url, got #{result.inspect}"
    assert result[:url].start_with?("videos/")
    # Path separators are stripped, so the sanitized name is a single flat
    # filename — the "../" segments can't escape the videos directory.
    assert_equal "videos", File.dirname(result[:url]), "must be a flat name under videos/"

    saved = @notes_path.join(result[:url]).cleanpath
    assert saved.to_s.start_with?(@notes_path.join("videos").to_s + "/")
    assert saved.exist?
    FileUtils.rm_f(saved)
  end
end

# S3 branch (with mocks)
class MediaServiceS3Test < ActiveSupport::TestCase
  require "aws-sdk-s3"

  DEFAULT_VIDEO_EXTENSIONS = %w[.mp4 .webm .mkv .mov .avi .m4v .ogv].freeze

  def setup
    @config_stub = stub("config")
    @config_stub.stubs(:get).returns(nil)
    @config_stub.stubs(:get).with("aws_access_key_id").returns("test-key")
    @config_stub.stubs(:get).with("aws_secret_access_key").returns("test-secret")
    @config_stub.stubs(:get).with("aws_s3_bucket").returns("test-bucket")
    @config_stub.stubs(:get).with("aws_region").returns("us-east-1")
    @config_stub.stubs(:upload_extensions).with("video_upload_extensions").returns(DEFAULT_VIDEO_EXTENSIONS)
    Config.stubs(:new).returns(@config_stub)

    WebMock.disable_net_connect!(allow_localhost: true)
  end

  def teardown
    WebMock.reset!
    WebMock.allow_net_connect!
  end

  def uploaded(filename, content = "fake video bytes")
    Rack::Test::UploadedFile.new(StringIO.new(content), "video/mp4", original_filename: filename)
  end

  test "save_upload uploads to S3 with the correct video mime type" do
    mock_client = stub
    mock_client.expects(:put_object).with { |args| args[:content_type] == "video/webm" }.returns(nil)
    Aws::S3::Client.stubs(:new).returns(mock_client)

    result = MediaService.save_upload(uploaded("movie.webm"), upload_to_s3: true)

    assert result[:url]
    assert_match %r{^https://test-bucket\.s3\.us-east-1\.amazonaws\.com/frankmd/\d{4}/\d{2}/movie\.webm$}, result[:url]
  end

  test "save_upload falls back to local storage when S3 not configured" do
    @config_stub.stubs(:get).with("aws_access_key_id").returns(nil)

    result = MediaService.save_upload(uploaded("local.mp4"), upload_to_s3: true)

    assert result[:url].start_with?("videos/")
    FileUtils.rm_f(Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes"))).join(result[:url]))
  end
end
