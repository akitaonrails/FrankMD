# frozen_string_literal: true

require "test_helper"

class ImagesControllerTest < ActionDispatch::IntegrationTest
  # === config ===

  test "config returns enabled and s3 status" do
    get images_config_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_includes [ true, false ], data["enabled"]
    assert_includes [ true, false ], data["s3_enabled"]
    assert_includes [ true, false ], data["web_search_enabled"]
    assert_includes [ true, false ], data["google_enabled"]
    assert_includes [ true, false ], data["pinterest_enabled"]
  end

  test "config exposes accepted upload extensions" do
    get images_config_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_includes data["image_extensions"], ".png"
    assert_includes data["video_extensions"], ".mp4"
  end

  # === Web Search ===

  test "search_web returns error when query is blank" do
    get "/images/search_web", params: { q: "" }, as: :json
    assert_response :bad_request

    data = JSON.parse(response.body)
    assert_includes data["error"], "required"
  end

  # === Google Images Search ===

  test "search_google returns error when no API key" do
    ENV.delete("GOOGLE_API_KEY")
    ENV.delete("GOOGLE_CSE_ID")

    get "/images/search_google", params: { q: "test" }, as: :json
    assert_response :service_unavailable

    data = JSON.parse(response.body)
    assert_includes data["error"], "not configured"
  end

  test "search_google returns error when query is blank" do
    get "/images/search_google", params: { q: "" }, as: :json
    assert_response :bad_request

    data = JSON.parse(response.body)
    assert_includes data["error"], "required"
  end

  # === Pinterest Search ===

  test "search_pinterest returns error when query is blank" do
    get "/images/search_pinterest", params: { q: "" }, as: :json
    assert_response :bad_request

    data = JSON.parse(response.body)
    assert_includes data["error"], "required"
  end

  # === Upload (from browser folder picker) ===

  test "upload returns error when no file provided" do
    post "/images/upload"
    assert_response :unprocessable_entity

    data = JSON.parse(response.body)
    assert_includes data["error"], "No file"
  end

  # Tests that require images to be configured
  class WithImagesConfigured < ActionDispatch::IntegrationTest
    def setup
      @temp_dir = Rails.root.join("tmp", "test_images_#{SecureRandom.hex(8)}")
      FileUtils.mkdir_p(@temp_dir)

      # Stub Config to return our test images path
      @config_stub = stub("config")
      @config_stub.stubs(:get).returns(nil)
      @config_stub.stubs(:get).with("images_path").returns(@temp_dir.to_s)
      @config_stub.stubs(:feature_available?).returns(false)
      @config_stub.stubs(:feature_available?).with(:local_images).returns(true)
      @config_stub.stubs(:feature_available?).with(:s3_upload).returns(false)
      @config_stub.stubs(:ui_settings).returns({})
      @config_stub.stubs(:upload_extensions).returns([ ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" ])
      Config.stubs(:new).returns(@config_stub)
    end

    def teardown
      FileUtils.rm_rf(@temp_dir) if @temp_dir&.exist?
    end

    def create_test_image(name)
      path = @temp_dir.join(name)
      FileUtils.mkdir_p(path.dirname)
      png_data = [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ].pack("C*")
      File.binwrite(path, png_data)
      path
    end

    test "config returns enabled when configured" do
      get images_config_url, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_equal true, data["enabled"]
    end

    test "index returns list of images" do
      create_test_image("photo1.jpg")
      create_test_image("photo2.png")

      get images_url, as: :json
      assert_response :success

      images = JSON.parse(response.body)
      assert_equal 2, images.length
    end

    test "index filters by search" do
      create_test_image("cat.jpg")
      create_test_image("dog.jpg")

      get images_url, params: { search: "cat" }, as: :json
      assert_response :success

      images = JSON.parse(response.body)
      assert_equal 1, images.length
      assert_equal "cat.jpg", images[0]["name"]
    end

    test "preview serves image file" do
      create_test_image("test.png")

      get "/images/preview/test.png"
      assert_response :success
    end

    test "preview returns 404 for non-existent image" do
      get image_preview_url(path: "nonexistent.jpg")
      assert_response :not_found
    end

    test "upload saves file to notes/images directory" do
      # Create a test image file
      png_data = [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ].pack("C*")

      file = Rack::Test::UploadedFile.new(
        StringIO.new(png_data),
        "image/png",
        original_filename: "test_upload.png"
      )

      # Set up notes path for this test
      notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
      images_dir = notes_path.join("images")

      post "/images/upload", params: { file: file }
      assert_response :success

      data = JSON.parse(response.body)
      assert data["url"].start_with?("images/")
      assert data["url"].include?("test_upload")

      # Clean up
      created_file = notes_path.join(data["url"])
      FileUtils.rm_f(created_file) if created_file.exist?
    end

    test "upload rejects a disallowed extension and stores nothing (stored-XSS guard)" do
      # An HTML file served inline by NotesController#serve_asset would be a
      # stored XSS. The upload endpoint must reject it server-side, regardless
      # of the client-side accept= filter.
      file = Rack::Test::UploadedFile.new(
        StringIO.new("<script>alert(1)</script>"),
        "text/html",
        original_filename: "evil.html"
      )

      notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
      images_dir = notes_path.join("images")

      post "/images/upload", params: { file: file }

      assert_response :unprocessable_entity
      data = JSON.parse(response.body)
      assert_includes data["error"], "not an accepted image type"

      # No .html file may have been written. (Checked by extension rather than a
      # total-count diff so it can't race with other upload tests writing .png
      # files to this shared directory in parallel.)
      html_files = Dir.glob(images_dir.join("*.html"))
      assert_empty html_files, "the rejected HTML upload must not be stored"
    end

    test "upload returns error for S3 when not configured" do
      png_data = [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ].pack("C*")

      file = Rack::Test::UploadedFile.new(
        StringIO.new(png_data),
        "image/png",
        original_filename: "test.png"
      )

      # S3 is not configured in this test class
      post "/images/upload", params: { file: file, upload_to_s3: "true" }

      # Should still succeed by falling back to local storage
      # because upload_to_s3 only works when s3_enabled? is true
      assert_response :success
      data = JSON.parse(response.body)
      assert data["url"].start_with?("images/")

      # Clean up
      notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
      created_file = notes_path.join(data["url"])
      FileUtils.rm_f(created_file) if created_file.exist?
    end

    test "upload_base64 saves base64 image data to notes/images" do
      # 1x1 PNG image encoded as base64
      png_data = [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ].pack("C*")
      base64_data = Base64.strict_encode64(png_data)

      notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))

      post "/images/upload_base64", params: {
        data: base64_data,
        mime_type: "image/png",
        filename: "ai_test.png"
      }, as: :json

      assert_response :success
      data = JSON.parse(response.body)
      assert data["url"].start_with?("images/")
      assert data["url"].include?("ai_test")

      # Clean up
      created_file = notes_path.join(data["url"])
      FileUtils.rm_f(created_file) if created_file.exist?
    end

    test "upload_base64 returns error when no data provided" do
      post "/images/upload_base64", params: { data: "" }, as: :json
      assert_response :bad_request

      data = JSON.parse(response.body)
      assert_includes data["error"], "No image data"
    end

    test "upload_base64 returns error for invalid base64" do
      post "/images/upload_base64", params: {
        data: "not valid base64!!!",
        mime_type: "image/png"
      }, as: :json

      assert_response :unprocessable_entity
      data = JSON.parse(response.body)
      assert_includes data["error"], "Invalid base64"
    end

    test "upload_base64 generates filename when not provided" do
      png_data = [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ].pack("C*")
      base64_data = Base64.strict_encode64(png_data)

      notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))

      post "/images/upload_base64", params: {
        data: base64_data,
        mime_type: "image/png"
      }, as: :json

      assert_response :success
      data = JSON.parse(response.body)
      assert data["url"].start_with?("images/")
      assert data["url"].include?("ai_generated_")

      # Clean up
      created_file = notes_path.join(data["url"])
      FileUtils.rm_f(created_file) if created_file.exist?
    end
  end

  # Tests for S3 upload actions (require S3 + images configured)
  class WithS3Configured < ActionDispatch::IntegrationTest
    require "aws-sdk-s3"

    def setup
      @temp_dir = Rails.root.join("tmp", "test_images_#{SecureRandom.hex(8)}")
      FileUtils.mkdir_p(@temp_dir)

      @config_stub = stub("config")
      @config_stub.stubs(:get).returns(nil)
      @config_stub.stubs(:get).with("images_path").returns(@temp_dir.to_s)
      @config_stub.stubs(:get).with("aws_access_key_id").returns("test-key")
      @config_stub.stubs(:get).with("aws_secret_access_key").returns("test-secret")
      @config_stub.stubs(:get).with("aws_s3_bucket").returns("test-bucket")
      @config_stub.stubs(:get).with("aws_region").returns("us-west-2")
      @config_stub.stubs(:feature_available?).returns(false)
      @config_stub.stubs(:feature_available?).with(:local_images).returns(true)
      @config_stub.stubs(:feature_available?).with(:s3_upload).returns(true)
      @config_stub.stubs(:ui_settings).returns({})
      @config_stub.stubs(:upload_extensions).returns([ ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" ])
      Config.stubs(:new).returns(@config_stub)

      @mock_s3_client = stub("s3_client")
      @mock_s3_client.stubs(:put_object).returns(nil)
      Aws::S3::Client.stubs(:new).returns(@mock_s3_client)

      WebMock.disable_net_connect!(allow_localhost: true)
    end

    def teardown
      FileUtils.rm_rf(@temp_dir) if @temp_dir&.exist?
      WebMock.reset!
      WebMock.allow_net_connect!
    end

    def create_test_image(name)
      path = @temp_dir.join(name)
      FileUtils.mkdir_p(path.dirname)
      png_data = [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ].pack("C*")
      File.binwrite(path, png_data)
      path
    end

    test "upload_to_s3 uploads local image and returns S3 URL" do
      create_test_image("s3_test.png")

      post "/images/upload_to_s3", params: { path: "s3_test.png" }, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_match %r{^https://test-bucket\.s3\.us-west-2\.amazonaws\.com/frankmd/}, data["url"]
    end

    test "upload_to_s3 returns error when S3 not configured" do
      @config_stub.stubs(:get).with("aws_access_key_id").returns(nil)

      post "/images/upload_to_s3", params: { path: "test.png" }, as: :json
      assert_response :unprocessable_entity

      data = JSON.parse(response.body)
      assert_includes data["error"], "S3"
    end

    test "upload_external_to_s3 downloads image and uploads to S3" do
      stub_request(:get, "https://example.com/photo.jpg")
        .to_return(
          status: 200,
          body: "fake image bytes",
          headers: { "Content-Type" => "image/jpeg" }
        )

      post "/images/upload_external_to_s3", params: { url: "https://example.com/photo.jpg" }, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_match %r{^https://test-bucket\.s3\.us-west-2\.amazonaws\.com/frankmd/}, data["url"]
    end

    test "upload_external_to_s3 returns error when URL is blank" do
      post "/images/upload_external_to_s3", params: { url: "" }, as: :json
      assert_response :bad_request

      data = JSON.parse(response.body)
      assert_includes data["error"], "required"
    end

    test "upload_external_to_s3 returns error when S3 not configured" do
      @config_stub.stubs(:get).with("aws_access_key_id").returns(nil)

      post "/images/upload_external_to_s3", params: { url: "https://example.com/photo.jpg" }, as: :json
      assert_response :unprocessable_entity

      data = JSON.parse(response.body)
      assert_includes data["error"], "S3"
    end
  end

  # Tests for image search actions with mocked HTTP
  class SearchActionsTest < ActionDispatch::IntegrationTest
    def setup
      @temp_dir = Rails.root.join("tmp", "test_images_search_#{SecureRandom.hex(8)}")
      FileUtils.mkdir_p(@temp_dir)

      @config_stub = stub("config")
      @config_stub.stubs(:get).returns(nil)
      @config_stub.stubs(:get).with("images_path").returns(@temp_dir.to_s)
      @config_stub.stubs(:get).with("google_api_key").returns("test-google-key")
      @config_stub.stubs(:get).with("google_cse_id").returns("test-cse-id")
      @config_stub.stubs(:feature_available?).returns(false)
      @config_stub.stubs(:feature_available?).with(:local_images).returns(true)
      @config_stub.stubs(:ui_settings).returns({})
      @config_stub.stubs(:upload_extensions).returns([ ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" ])
      Config.stubs(:new).returns(@config_stub)

      WebMock.disable_net_connect!(allow_localhost: true)
    end

    def teardown
      FileUtils.rm_rf(@temp_dir) if @temp_dir&.exist?
      WebMock.reset!
      WebMock.allow_net_connect!
    end

    test "search_web returns images from DuckDuckGo" do
      # Stub the initial page request to get vqd token
      stub_request(:get, /duckduckgo\.com\/\?/)
        .to_return(status: 200, body: 'vqd="12345-67890"')

      # Stub the image search API
      stub_request(:get, /duckduckgo\.com\/i\.js/)
        .to_return(
          status: 200,
          body: {
            "results" => [
              {
                "image" => "https://example.com/cat.jpg",
                "thumbnail" => "https://example.com/cat_thumb.jpg",
                "title" => "A cute cat",
                "source" => "example.com",
                "width" => 800,
                "height" => 600
              }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      get "/images/search_web", params: { q: "cats" }, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_equal 1, data["images"].length
      assert_equal "https://example.com/cat.jpg", data["images"][0]["url"]
      assert_equal "A cute cat", data["images"][0]["title"]
    end

    test "search_web handles missing vqd token gracefully" do
      stub_request(:get, /duckduckgo\.com\/\?/)
        .to_return(status: 200, body: "<html>no token here</html>")

      get "/images/search_web", params: { q: "test" }, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_equal [], data["images"]
    end

    test "search_google returns images from Google CSE API" do
      stub_request(:get, /googleapis\.com\/customsearch\/v1/)
        .to_return(
          status: 200,
          body: {
            "items" => [
              {
                "link" => "https://example.com/photo.jpg",
                "title" => "Beautiful photo",
                "displayLink" => "example.com",
                "image" => {
                  "thumbnailLink" => "https://example.com/photo_thumb.jpg",
                  "width" => 1920,
                  "height" => 1080
                }
              }
            ],
            "searchInformation" => { "totalResults" => "42" }
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      get "/images/search_google", params: { q: "landscape" }, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_equal 1, data["images"].length
      assert_equal "https://example.com/photo.jpg", data["images"][0]["url"]
      assert_equal "Beautiful photo", data["images"][0]["title"]
      assert_equal 42, data["total"]
    end

    test "search_google handles API error response" do
      stub_request(:get, /googleapis\.com\/customsearch\/v1/)
        .to_return(
          status: 403,
          body: { "error" => { "message" => "quotaExceeded", "errors" => [ { "reason" => "dailyLimitExceeded" } ] } }.to_json
        )

      get "/images/search_google", params: { q: "test" }, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_equal [], data["images"]
      assert_includes data["error"], "quotaExceeded"
    end

    test "search_pinterest uses DuckDuckGo with site filter" do
      stub_request(:get, /duckduckgo\.com\/\?/)
        .to_return(status: 200, body: 'vqd="99999-11111"')

      stub_request(:get, /duckduckgo\.com\/i\.js/)
        .to_return(
          status: 200,
          body: {
            "results" => [
              {
                "image" => "https://pinterest.com/pin/123.jpg",
                "thumbnail" => "https://pinterest.com/pin/123_thumb.jpg",
                "title" => "Pinterest Pin",
                "source" => "pinterest.com"
              }
            ]
          }.to_json,
          headers: { "Content-Type" => "application/json" }
        )

      get "/images/search_pinterest", params: { q: "home decor" }, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_equal 1, data["images"].length
      assert_equal "Pinterest Pin", data["images"][0]["title"]
    end
  end

  # Tests for parse_resize_ratio private method
  class ParseResizeRatioTest < ActionDispatch::IntegrationTest
    def setup
      @controller = ImagesController.new
    end

    test "parse_resize_ratio returns 0.5 for legacy true value" do
      assert_equal 0.5, @controller.send(:parse_resize_ratio, true)
      assert_equal 0.5, @controller.send(:parse_resize_ratio, "true")
    end

    test "parse_resize_ratio returns nil for blank or false" do
      assert_nil @controller.send(:parse_resize_ratio, nil)
      assert_nil @controller.send(:parse_resize_ratio, "")
      assert_nil @controller.send(:parse_resize_ratio, "false")
      assert_nil @controller.send(:parse_resize_ratio, false)
    end

    test "parse_resize_ratio parses valid ratio values" do
      assert_equal 0.25, @controller.send(:parse_resize_ratio, "0.25")
      assert_equal 0.5, @controller.send(:parse_resize_ratio, "0.5")
      assert_equal 0.67, @controller.send(:parse_resize_ratio, "0.67")
      assert_equal 1.0, @controller.send(:parse_resize_ratio, "1.0")
    end

    test "parse_resize_ratio rejects out-of-range values" do
      assert_nil @controller.send(:parse_resize_ratio, "0")
      assert_nil @controller.send(:parse_resize_ratio, "-0.5")
      assert_nil @controller.send(:parse_resize_ratio, "1.5")
    end
  end

  # Tests for disabled state
  class WithImagesDisabled < ActionDispatch::IntegrationTest
    def setup
      # Stub Config to return nil for images_path (disabled)
      @config_stub = stub("config")
      @config_stub.stubs(:get).returns(nil)
      @config_stub.stubs(:feature_available?).returns(false)
      @config_stub.stubs(:ui_settings).returns({})
      @config_stub.stubs(:upload_extensions).returns([ ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" ])
      Config.stubs(:new).returns(@config_stub)
    end

    test "config returns disabled" do
      get images_config_url, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      assert_equal false, data["enabled"]
    end

    test "index returns 404 when images disabled" do
      get images_url, as: :json
      assert_response :not_found
    end

    test "preview returns 404 when images disabled" do
      get image_preview_url(path: "test.jpg")
      assert_response :not_found
    end
  end
end
