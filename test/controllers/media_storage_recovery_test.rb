# frozen_string_literal: true

require "test_helper"
require "aws-sdk-s3"

class MediaStorageRecoveryTest < ActionDispatch::IntegrationTest
  setup do
    setup_test_notes_dir
    @config = Config.new
    @server_images = @test_notes_dir.join("server")
    FileUtils.mkdir_p(@server_images)
    @server_images.join("photo.png").write("image bytes")
    @config.set("images_path", @server_images.to_s)
    select_s3
  end

  teardown do
    teardown_test_notes_dir
  end

  def select_s3
    @config.update("aws_access_key_id" => "key", "aws_secret_access_key" => "secret", "aws_s3_bucket" => "bucket", "aws_s3_endpoint" => "")
    assert @config.set("media_storage_provider", "s3")
  end

  def image_file
    Rack::Test::UploadedFile.new(StringIO.new("image bytes"), "image/png", original_filename: "photo.png")
  end

  def upload_params(endpoint)
    case endpoint
    when "/images/upload" then { file: image_file }
    when "/images/upload_base64" then { data: Base64.strict_encode64("image bytes"), mime_type: "image/png", filename: "photo.png" }
    when "/images/import" then { path: "photo.png" }
    when "/media/upload" then { file: Rack::Test::UploadedFile.new(StringIO.new("video bytes"), "video/mp4", original_filename: "clip.mp4") }
    end
  end

  %w[aws_access_key_id aws_secret_access_key aws_s3_bucket].each do |key|
    test "configuration refresh persists Local after #{key} is removed and warns once" do
      @config.set(key, "")
      get "/config", as: :json
      assert_response :success
      assert_equal "local", response.parsed_body.dig("settings", "media_storage_provider")
      assert_equal true, response.parsed_body["media_storage_fallback"]
      assert_equal "local", Config.new.get("media_storage_provider")
      get "/config", as: :json
      assert_equal false, response.parsed_body["media_storage_fallback"]
    end
  end

  test "invalid endpoints recover but S3-compatible endpoints remain valid" do
    [ "not a URL", "ftp://s3.example.com", "https:///" ].each do |endpoint|
      select_s3
      @config.set("aws_s3_endpoint", endpoint)
      get "/config", as: :json
      assert_equal "local", response.parsed_body.dig("settings", "media_storage_provider")
      assert_equal true, response.parsed_body["media_storage_fallback"]
    end
    select_s3
    @config.set("aws_s3_endpoint", "http://minio.local:9000")
    get "/config", as: :json
    assert_equal "s3", response.parsed_body.dig("settings", "media_storage_provider")
    assert_equal false, response.parsed_body["media_storage_fallback"]
  end

  test "page loads warn after recovery and image config preserves the warning for shared controls" do
    @config.set("aws_s3_bucket", "")
    get "/images/config", as: :json
    assert_equal "local", response.parsed_body["media_storage_provider"]
    assert_equal true, response.parsed_body["media_storage_fallback"]
    get root_url
    assert_response :success
    assert_select '[data-media-storage-provider-value="local"][data-media-storage-fallback-value="true"]'
    assert_select 'dialog[role="alertdialog"][data-media-storage-target="warningDialog"]'
    get root_url
    assert_select '[data-media-storage-fallback-value="false"]'
  end

  %w[/images/upload /images/upload_base64 /images/import /media/upload].each do |endpoint|
    test "#{endpoint} recovers missing settings before writing and can be retried locally" do
      @config.set("aws_access_key_id", "")
      post endpoint, params: upload_params(endpoint)
      assert_response :unprocessable_entity
      assert_equal true, response.parsed_body["media_storage_fallback"]
      assert_equal "local", Config.new.get("media_storage_provider")
      refute @test_notes_dir.join("images").exist?
      refute @test_notes_dir.join("videos").exist?
      post endpoint, params: upload_params(endpoint)
      assert_response :success
      assert @test_notes_dir.join(response.parsed_body["url"]).file?
    end

    test "#{endpoint} recovers an invalid SDK region without retrying the upload" do
      @config.set("aws_region", "bad_region")
      post endpoint, params: upload_params(endpoint)
      assert_response :unprocessable_entity
      assert_equal true, response.parsed_body["media_storage_fallback"]
      assert_equal "local", Config.new.get("media_storage_provider")
      refute @test_notes_dir.join("images").exist?
      refute @test_notes_dir.join("videos").exist?
      get "/config", as: :json
      assert_equal true, response.parsed_body["media_storage_fallback"]
      post endpoint, params: upload_params(endpoint)
      assert_response :success
      assert @test_notes_dir.join(response.parsed_body["url"]).file?
    end

    test "#{endpoint} recovers rejected S3 credentials without retrying the upload" do
      client = stub("s3")
      client.expects(:put_object).once.raises(Aws::S3::Errors::InvalidAccessKeyId.new(nil, "invalid credentials"))
      Aws::S3::Client.stubs(:new).returns(client)
      post endpoint, params: upload_params(endpoint)
      assert_response :unprocessable_entity
      assert_equal true, response.parsed_body["media_storage_fallback"]
      assert_equal "local", Config.new.get("media_storage_provider")
      refute @test_notes_dir.join("images").exist?
      refute @test_notes_dir.join("videos").exist?
      get "/config", as: :json
      assert_equal true, response.parsed_body["media_storage_fallback"]
      get "/config", as: :json
      assert_equal false, response.parsed_body["media_storage_fallback"]
    end
  end

  test "legacy S3 endpoints also recover missing settings without importing" do
    %w[/images/upload_to_s3 /images/upload_external_to_s3].each do |endpoint|
      select_s3
      @config.set("aws_secret_access_key", "")
      post endpoint, params: { path: "photo.png", url: "https://example.com/photo.png" }
      assert_response :unprocessable_entity
      assert_equal true, response.parsed_body["media_storage_fallback"]
      assert_equal "local", Config.new.get("media_storage_provider")
      refute @test_notes_dir.join("images").exist?
    end
  end

  test "temporary failures do not change the provider or claim recovery" do
    [ Aws::S3::Errors::SlowDown, Aws::S3::Errors::InternalError, Seahorse::Client::NetworkingError ].each do |error_class|
      client = stub("s3")
      error = error_class == Seahorse::Client::NetworkingError ? error_class.new(Timeout::Error.new("timeout")) : error_class.new(nil, "temporary failure")
      client.expects(:put_object).raises(error)
      Aws::S3::Client.stubs(:new).returns(client)
      post "/media/upload", params: upload_params("/media/upload")
      assert_response :unprocessable_entity
      assert_equal "s3", Config.new.get("media_storage_provider")
      refute response.parsed_body["media_storage_fallback"]
      refute @test_notes_dir.join("videos").exist?
    end
  end

  test "restoring S3 before a pending warning is displayed does not claim Local is active" do
    @config.set("aws_s3_bucket", "")
    get "/images/config", as: :json
    assert_equal true, response.parsed_body["media_storage_fallback"]
    select_s3
    get "/config", as: :json
    assert_equal "s3", response.parsed_body.dig("settings", "media_storage_provider")
    assert_equal false, response.parsed_body["media_storage_fallback"]
  end

  test "failed preference persistence leaves S3 selected and never claims recovery" do
    @config.set("aws_s3_bucket", "")
    Config.any_instance.stubs(:set).with("media_storage_provider", "local").returns(false)
    get "/config", as: :json
    assert_equal "s3", response.parsed_body.dig("settings", "media_storage_provider")
    assert_equal false, response.parsed_body["media_storage_fallback"]
    post "/media/upload", params: upload_params("/media/upload")
    assert_response :unprocessable_entity
    refute response.parsed_body["media_storage_fallback"]
    refute @test_notes_dir.join("videos").exist?
  end

  test "a failed recovery save after credential rejection retains S3" do
    Config.any_instance.stubs(:set).with("media_storage_provider", "local").returns(false)
    client = stub("s3")
    client.expects(:put_object).raises(Aws::S3::Errors::AccessDenied.new(nil, "denied"))
    Aws::S3::Client.stubs(:new).returns(client)
    post "/media/upload", params: upload_params("/media/upload")
    assert_response :unprocessable_entity
    assert_equal "s3", Config.new.get("media_storage_provider")
    refute response.parsed_body["media_storage_fallback"]
  end
end
