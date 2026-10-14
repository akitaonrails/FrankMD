# frozen_string_literal: true

require "test_helper"
require "aws-sdk-s3"

class ImageImportTest < ActionDispatch::IntegrationTest
  setup do
    setup_test_notes_dir
    @images = @test_notes_dir.join("server")
    FileUtils.mkdir_p(@images)
    @config = Config.new
    @config.set("images_path", @images.to_s)
    EgressPolicy.stubs(:resolve).returns([ IPAddr.new("93.184.216.34") ])
    WebMock.disable_net_connect!(allow_localhost: true)
  end

  teardown do
    WebMock.reset!
    WebMock.allow_net_connect!
    teardown_test_notes_dir
  end

  def use_s3
    @config.update("aws_access_key_id" => "key", "aws_secret_access_key" => "secret", "aws_s3_bucket" => "bucket")
    assert @config.set("media_storage_provider", "s3")
  end

  def external_image(url = "https://example.com/image.png")
    stub_request(:get, url).to_return(body: "image bytes", headers: { "Content-Type" => "image/png" })
  end

  test "external URL is saved locally without requiring a server image folder" do
    @config.set("images_path", "")
    external_image
    post "/images/import", params: { url: "https://example.com/image.png" }, as: :json
    assert_response :success
    assert_match %r{\Aimages/}, response.parsed_body["url"]
    assert_equal "image bytes", @test_notes_dir.join(response.parsed_body["url"]).binread
  end

  test "external and server images are saved to S3 without local media copies" do
    use_s3
    external_image
    @images.join("photo.png").binwrite("image bytes")
    client = stub("s3")
    client.expects(:put_object).twice.with { |args| args[:bucket] == "bucket" && args[:key].start_with?("chosen/") && args[:if_none_match] == "*" }
    Aws::S3::Client.stubs(:new).returns(client)
    [ { url: "https://example.com/image.png" }, { path: "photo.png" } ].each do |source|
      post "/images/import", params: source.merge(s3_prefix: "chosen"), as: :json
      assert_response :success
      assert_match %r{\Ahttps://bucket}, response.parsed_body["url"]
    end
    refute @test_notes_dir.join("images").exist?
  end

  test "server images can be copied locally without changing the original" do
    @images.join("photo.png").binwrite("original")
    post "/images/import", params: { path: "photo.png" }, as: :json
    assert_response :success
    assert_equal "original", @test_notes_dir.join(response.parsed_body["url"]).binread
    assert_equal "original", @images.join("photo.png").binread
  end

  test "exactly one string source is required" do
    [ {}, { url: "https://example.com/a.png", path: "a.png" }, { url: [ "https://example.com/a.png" ] } ].each do |source|
      post "/images/import", params: source, as: :json
      assert_response :unprocessable_entity
    end
  end

  test "server import rejects traversal symlinks and nonimages" do
    outside = @test_notes_dir.join("outside.png")
    outside.write("outside")
    File.symlink(outside, @images.join("link.png"))
    @images.join("script.html").write("<script>alert(1)</script>")
    [ "../outside.png", "link.png", "script.html" ].each do |path|
      post "/images/import", params: { path: path }, as: :json
      assert_response :unprocessable_entity
    end
    refute @test_notes_dir.join("images").exist?
  end

  test "external import rejects HTML and SVG content" do
    %w[text/html image/svg+xml].each do |content_type|
      stub_request(:get, "https://example.com/image.png").to_return(body: "unsafe", headers: { "Content-Type" => content_type })
      post "/images/import", params: { url: "https://example.com/image.png" }, as: :json
      assert_response :unprocessable_entity
    end
    refute @test_notes_dir.join("images").exist?
  end

  test "external import rejects oversized responses" do
    stub_request(:get, "https://example.com/image.png").to_return(headers: { "Content-Length" => (ImagesService::MAX_EXTERNAL_IMAGE_BYTES + 1).to_s })
    post "/images/import", params: { url: "https://example.com/image.png" }, as: :json
    assert_response :unprocessable_entity
    refute @test_notes_dir.join("images").exist?
  end

  test "external import follows redirects and rejects private targets" do
    stub_request(:get, "https://example.com/start").to_return(status: 302, headers: { "Location" => "/image.png" })
    external_image
    post "/images/import", params: { url: "https://example.com/start" }, as: :json
    assert_response :success

    EgressPolicy.stubs(:resolve).returns([ IPAddr.new("127.0.0.1") ])
    post "/images/import", params: { url: "https://example.com/image.png" }, as: :json
    assert_response :unprocessable_entity
  end

  test "S3 failures and missing credentials never create local media" do
    use_s3
    external_image
    client = stub("s3")
    client.expects(:put_object).raises(Aws::S3::Errors::ServiceError.new(nil, "private provider details"))
    Aws::S3::Client.stubs(:new).returns(client)
    post "/images/import", params: { url: "https://example.com/image.png" }, as: :json
    assert_response :unprocessable_entity
    refute_includes response.body, "private provider details"
    @config.set("aws_access_key_id", "")
    post "/images/import", params: { url: "https://example.com/image.png" }, as: :json
    assert_response :unprocessable_entity
    refute @test_notes_dir.join("images").exist?
  end

  test "legacy S3 endpoints reject an active local provider" do
    @config.update("aws_access_key_id" => "key", "aws_secret_access_key" => "secret", "aws_s3_bucket" => "bucket")
    post "/images/upload_to_s3", params: { path: "photo.png" }, as: :json
    assert_response :unprocessable_entity
    post "/images/upload_external_to_s3", params: { url: "https://example.com/image.png" }, as: :json
    assert_response :unprocessable_entity
  end
end
