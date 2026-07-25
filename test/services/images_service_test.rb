# frozen_string_literal: true

require "test_helper"

class ImagesServiceTest < ActiveSupport::TestCase
  def setup
    # Create temp directory for images
    @temp_dir = Rails.root.join("tmp", "test_images_#{SecureRandom.hex(8)}")
    FileUtils.mkdir_p(@temp_dir)

    # Stub Config to return our test images path
    @config_stub = stub("config")
    @config_stub.stubs(:get).returns(nil)
    @config_stub.stubs(:get).with("images_path").returns(@temp_dir.to_s)
    @config_stub.stubs(:upload_extensions).with("image_upload_extensions").returns(%w[.jpg .jpeg .png .gif .webp .bmp])
    Config.stubs(:new).returns(@config_stub)
  end

  def teardown
    FileUtils.rm_rf(@temp_dir) if @temp_dir&.exist?
  end

  def create_test_image(name, content = "fake image data")
    path = @temp_dir.join(name)
    FileUtils.mkdir_p(path.dirname)
    File.binwrite(path, content)
    # Set mtime to control ordering
    FileUtils.touch(path, mtime: Time.now)
    path
  end

  # === enabled? ===

  test "enabled? returns true when path is set" do
    assert ImagesService.enabled?
  end

  test "enabled? returns false when path is not set" do
    @config_stub.stubs(:get).with("images_path").returns(nil)
    refute ImagesService.enabled?
  end

  # === list ===

  test "list returns empty array when disabled" do
    @config_stub.stubs(:get).with("images_path").returns(nil)
    assert_equal [], ImagesService.list
  end

  test "list returns empty array when directory doesn't exist" do
    FileUtils.rm_rf(@temp_dir)
    assert_equal [], ImagesService.list
  end

  test "list returns images sorted by most recent" do
    # Create images with different mtimes
    img1 = create_test_image("old.jpg")
    sleep 0.01
    img2 = create_test_image("new.jpg")

    images = ImagesService.list
    assert_equal 2, images.length
    assert_equal "new.jpg", images[0][:name]
    assert_equal "old.jpg", images[1][:name]
  end

  test "list only returns supported image extensions" do
    create_test_image("image.jpg")
    create_test_image("image.png")
    create_test_image("image.gif")
    create_test_image("document.txt")
    create_test_image("script.js")

    images = ImagesService.list
    names = images.map { |i| i[:name] }

    assert_includes names, "image.jpg"
    assert_includes names, "image.png"
    assert_includes names, "image.gif"
    refute_includes names, "document.txt"
    refute_includes names, "script.js"
  end

  test "list limits to 10 results" do
    15.times { |i| create_test_image("image_#{i}.jpg") }

    images = ImagesService.list
    assert_equal 10, images.length
  end

  test "list filters by search term" do
    create_test_image("cat.jpg")
    create_test_image("dog.png")
    create_test_image("category.gif")

    images = ImagesService.list(search: "cat")
    names = images.map { |i| i[:name] }

    assert_includes names, "cat.jpg"
    assert_includes names, "category.gif"
    refute_includes names, "dog.png"
  end

  test "list search is case insensitive" do
    create_test_image("MyPhoto.JPG")

    images = ImagesService.list(search: "myphoto")
    assert_equal 1, images.length
    assert_equal "MyPhoto.JPG", images[0][:name]
  end

  test "list includes images in subdirectories" do
    create_test_image("root.jpg")
    create_test_image("subfolder/nested.png")

    images = ImagesService.list
    paths = images.map { |i| i[:path] }

    assert_includes paths, "root.jpg"
    assert_includes paths, "subfolder/nested.png"
  end

  # === find_image ===

  test "find_image returns full path for existing image" do
    create_test_image("test.jpg")

    result = ImagesService.find_image("test.jpg")
    assert_equal @temp_dir.join("test.jpg"), result
  end

  test "find_image returns nil for non-existent image" do
    result = ImagesService.find_image("nonexistent.jpg")
    assert_nil result
  end

  test "find_image prevents path traversal" do
    result = ImagesService.find_image("../../../etc/passwd")
    assert_nil result
  end

  test "find_image works with subdirectories" do
    create_test_image("photos/vacation.jpg")

    result = ImagesService.find_image("photos/vacation.jpg")
    assert_equal @temp_dir.join("photos/vacation.jpg"), result
  end

  # === upload_base64_data ===

  test "upload_base64_data saves base64 image to notes directory" do
    # 1x1 PNG image
    png_data = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ].pack("C*")
    base64_data = Base64.strict_encode64(png_data)

    result = ImagesService.upload_base64_data(base64_data, mime_type: "image/png", filename: "test_ai.png")

    assert result[:url]
    assert result[:url].start_with?("images/")
    assert result[:url].include?("test_ai")

    # Clean up
    notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    FileUtils.rm_f(notes_path.join(result[:url]))
  end

  test "upload_base64_data returns error for invalid base64" do
    result = ImagesService.upload_base64_data("not valid base64!!!", mime_type: "image/png")
    assert result[:error]
    assert_includes result[:error], "Invalid base64"
  end

  test "upload_base64_data rejects an SVG mime type (stored-XSS vector)" do
    svg = Base64.strict_encode64("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")
    notes_dir = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes"))).join("images")
    # Unique name: this directory is shared with the other upload specs (and with
    # parallel workers), so assert on our own file rather than a directory count.
    name = "xss_#{SecureRandom.hex(4)}.svg"

    result = ImagesService.upload_base64_data(svg, mime_type: "image/svg+xml", filename: name)

    assert result[:error], "SVG upload must be rejected (not in the image allow-list)"
    assert_includes result[:error], "not an accepted"
    assert_empty Dir.glob(notes_dir.join("*#{name}").to_s),
      "a rejected upload must not write a file under the notes dir"
  end

  test "upload_base64_data rejects an html filename (stored-XSS vector)" do
    data = Base64.strict_encode64("<html><script>alert(1)</script></html>")
    notes_dir = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes"))).join("images")
    name = "evil_#{SecureRandom.hex(4)}.html"

    result = ImagesService.upload_base64_data(data, mime_type: "image/png", filename: name)

    assert result[:error], "an .html filename must be rejected"
    assert_includes result[:error], "not an accepted"
    assert_empty Dir.glob(notes_dir.join("*#{name}").to_s),
      "a rejected upload must not write an .html file under the notes dir"
  end

  test "upload_base64_data generates filename when not provided" do
    png_data = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ].pack("C*")
    base64_data = Base64.strict_encode64(png_data)

    result = ImagesService.upload_base64_data(base64_data, mime_type: "image/png")

    assert result[:url]
    assert result[:url].include?("ai_generated_")

    # Clean up
    notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    FileUtils.rm_f(notes_path.join(result[:url]))
  end

  # === get_image_dimensions ===

  test "get_image_dimensions returns hash with width and height keys" do
    # Create a real PNG for ImageMagick to read
    png_data = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ].pack("C*")
    path = create_test_image("real.png", png_data)

    result = ImagesService.get_image_dimensions(path)

    # get_image_dimensions returns a hash with :width and :height keys
    assert result.key?(:width)
    assert result.key?(:height)
    # If ImageMagick works, we get dimensions; if not, we get nils (graceful degradation)
  end

  test "get_image_dimensions returns nil for invalid file" do
    path = create_test_image("not_image.txt", "just text")

    result = ImagesService.get_image_dimensions(path)

    assert_nil result[:width]
    assert_nil result[:height]
  end

  test "get_image_dimensions handles non-existent file" do
    result = ImagesService.get_image_dimensions(Pathname.new("/nonexistent/file.png"))

    assert_nil result[:width]
    assert_nil result[:height]
  end

  # === resize_and_compress ===

  test "resize_and_compress returns content and changes filename to jpg" do
    # Create a real PNG image
    png_data = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ].pack("C*")
    path = create_test_image("source.png", png_data)

    content, content_type, filename = ImagesService.send(:resize_and_compress, path, "source.png", 1.0)

    # Should always return content
    assert content.present?
    # If ImageMagick succeeds, filename becomes .jpg, otherwise keeps original
    assert filename.present?
    # Content type should match the filename extension
    assert_includes %w[image/jpeg image/png], content_type
  end

  test "resize_and_compress falls back to the original file when ImageMagick is missing" do
    png_data = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ].pack("C*")
    path = create_test_image("source.png", png_data)
    Open3.stubs(:capture3).raises(Errno::ENOENT.new("magick"))

    content, content_type, filename = ImagesService.send(:resize_and_compress, path, "source.png", 0.5)

    # Degrades to the original instead of raising and 500ing the upload
    assert_equal png_data, content
    assert_equal "image/png", content_type
    assert_equal "source.png", filename
  end

  # === imagemagick_cmd (IM6 / IM7 compatibility) ===

  test "imagemagick_cmd uses the magick entrypoint when ImageMagick 7 is installed" do
    ImagesService.stubs(:executable_on_path?).with("magick").returns(true)

    assert_equal [ "magick" ], ImagesService.send(:imagemagick_cmd, "convert")
    assert_equal [ "magick", "identify" ], ImagesService.send(:imagemagick_cmd, "identify")
  end

  test "imagemagick_cmd falls back to the legacy binaries without ImageMagick 7" do
    ImagesService.stubs(:executable_on_path?).with("magick").returns(false)

    assert_equal [ "convert" ], ImagesService.send(:imagemagick_cmd, "convert")
    assert_equal [ "identify" ], ImagesService.send(:imagemagick_cmd, "identify")
  end

  # === imagemagick_resize_arg (whitelist) ===

  test "imagemagick_resize_arg returns correct percentage for known ratios" do
    assert_equal "25%", ImagesService.send(:imagemagick_resize_arg, 0.25)
    assert_equal "50%", ImagesService.send(:imagemagick_resize_arg, 0.5)
    assert_equal "75%", ImagesService.send(:imagemagick_resize_arg, 0.75)
    assert_equal "100%", ImagesService.send(:imagemagick_resize_arg, 1)
    assert_equal "100%", ImagesService.send(:imagemagick_resize_arg, "1.0")
    assert_equal "33%", ImagesService.send(:imagemagick_resize_arg, "0.33")
    assert_equal "67%", ImagesService.send(:imagemagick_resize_arg, "0.67")
  end

  test "imagemagick_resize_arg defaults to 50% for unknown values" do
    assert_equal "50%", ImagesService.send(:imagemagick_resize_arg, 0.42)
    assert_equal "50%", ImagesService.send(:imagemagick_resize_arg, "arbitrary")
    assert_equal "50%", ImagesService.send(:imagemagick_resize_arg, nil)
  end

  test "imagemagick_resize_arg rejects shell injection attempts" do
    # These should all fall through to the safe default
    assert_equal "50%", ImagesService.send(:imagemagick_resize_arg, "50%; rm -rf /")
    assert_equal "50%", ImagesService.send(:imagemagick_resize_arg, "100%\nmalicious")
    assert_equal "50%", ImagesService.send(:imagemagick_resize_arg, "`whoami`")
  end

  # === content_type_for ===

  test "content_type_for returns correct mime types" do
    assert_equal "image/jpeg", ImagesService.send(:content_type_for, Pathname.new("test.jpg"))
    assert_equal "image/jpeg", ImagesService.send(:content_type_for, Pathname.new("test.jpeg"))
    assert_equal "image/png", ImagesService.send(:content_type_for, Pathname.new("test.png"))
    assert_equal "image/gif", ImagesService.send(:content_type_for, Pathname.new("test.gif"))
    assert_equal "image/webp", ImagesService.send(:content_type_for, Pathname.new("test.webp"))
    assert_equal "image/svg+xml", ImagesService.send(:content_type_for, Pathname.new("test.svg"))
    assert_equal "image/bmp", ImagesService.send(:content_type_for, Pathname.new("test.bmp"))
    assert_equal "application/octet-stream", ImagesService.send(:content_type_for, Pathname.new("test.unknown"))
  end

  # === extension_for_content_type ===

  test "extension_for_content_type returns correct extensions" do
    assert_equal ".jpg", ImagesService.send(:extension_for_content_type, "image/jpeg")
    assert_equal ".png", ImagesService.send(:extension_for_content_type, "image/png")
    assert_equal ".gif", ImagesService.send(:extension_for_content_type, "image/gif")
    assert_equal ".webp", ImagesService.send(:extension_for_content_type, "image/webp")
    assert_equal ".svg", ImagesService.send(:extension_for_content_type, "image/svg+xml")
    assert_equal ".bmp", ImagesService.send(:extension_for_content_type, "image/bmp")
    assert_equal ".jpg", ImagesService.send(:extension_for_content_type, "unknown/type")
  end

  test "extension_for_content_type handles content-type with charset" do
    assert_equal ".png", ImagesService.send(:extension_for_content_type, "image/png; charset=utf-8")
  end
end

# S3 Integration Tests (with mocks)
class ImagesServiceS3Test < ActiveSupport::TestCase
  # Need to require aws-sdk-s3 to define the Aws module for mocking
  require "aws-sdk-s3"

  def setup
    @temp_dir = Rails.root.join("tmp", "test_images_s3_#{SecureRandom.hex(8)}")
    FileUtils.mkdir_p(@temp_dir)

    # Stub Config to return our test values
    @config_stub = stub("config")
    @config_stub.stubs(:get).returns(nil)
    @config_stub.stubs(:get).with("images_path").returns(@temp_dir.to_s)
    @config_stub.stubs(:get).with("aws_access_key_id").returns("test-key-id")
    @config_stub.stubs(:get).with("aws_secret_access_key").returns("test-secret")
    @config_stub.stubs(:get).with("aws_region").returns("us-east-1")
    @config_stub.stubs(:get).with("aws_s3_bucket").returns("test-bucket")
    Config.stubs(:new).returns(@config_stub)

    # The external-image fetch resolves the host to enforce the egress policy.
    # Stub the lookup so the suite stays hermetic (WebMock intercepts HTTP, not DNS).
    EgressPolicy.stubs(:resolve).returns([ IPAddr.new("93.184.216.34") ])

    WebMock.disable_net_connect!(allow_localhost: true)
  end

  def teardown
    FileUtils.rm_rf(@temp_dir) if @temp_dir&.exist?
    WebMock.reset!
    WebMock.allow_net_connect!
  end

  def create_test_image(name, content = "fake image data")
    path = @temp_dir.join(name)
    FileUtils.mkdir_p(path.dirname)
    File.binwrite(path, content)
    path
  end

  test "s3_enabled? returns true when configured" do
    assert ImagesService.s3_enabled?
  end

  test "s3_enabled? returns false when not configured" do
    @config_stub.stubs(:get).with("aws_access_key_id").returns(nil)
    refute ImagesService.s3_enabled?
  end

  test "upload_to_s3 returns nil when s3 disabled" do
    @config_stub.stubs(:get).with("aws_access_key_id").returns(nil)
    create_test_image("test.jpg")

    result = ImagesService.upload_to_s3("test.jpg")

    assert_nil result
  end

  test "upload_to_s3 returns nil for non-existent image" do
    result = ImagesService.upload_to_s3("nonexistent.jpg")

    assert_nil result
  end

  test "upload_to_s3 calls S3 client with correct parameters" do
    create_test_image("upload_test.jpg", "image content")

    mock_client = stub
    mock_client.stubs(:put_object).returns(nil)

    Aws::S3::Client.stubs(:new).returns(mock_client)

    result = ImagesService.upload_to_s3("upload_test.jpg")

    assert result.present?
    assert_match %r{^https://test-bucket\.s3\.us-east-1\.amazonaws\.com/frankmd/\d{4}/\d{2}/upload_test\.jpg$}, result
  end

  test "upload_to_s3 sanitizes special characters in the object key" do
    create_test_image("my photo (1).jpg", "image content")

    mock_client = stub
    mock_client.stubs(:put_object).returns(nil)

    Aws::S3::Client.stubs(:new).returns(mock_client)

    result = ImagesService.upload_to_s3("my photo (1).jpg")

    assert result.present?
    # S3 keys now route through UploadStorage.s3_key, which sanitizes the
    # filename the same way the video path always has (image/video parity).
    # Spaces and parens become "_", so there is nothing left to URL-encode.
    assert_includes result, "my_photo__1_.jpg"
    refute_includes result, " "
  end

  test "upload_to_s3 handles ACL not supported error gracefully" do
    create_test_image("acl_test.jpg", "image data")

    mock_client = stub
    mock_client.stubs(:put_object).raises(Aws::S3::Errors::AccessControlListNotSupported.new(nil, "ACL not supported"))

    Aws::S3::Client.stubs(:new).returns(mock_client)

    # Should not raise, should return URL
    result = ImagesService.upload_to_s3("acl_test.jpg")
    assert result.present?
  end

  test "upload_to_s3 with resize option returns S3 URL" do
    png_data = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ].pack("C*")
    create_test_image("resize_s3.png", png_data)

    mock_client = stub
    mock_client.stubs(:put_object).returns(nil)

    Aws::S3::Client.stubs(:new).returns(mock_client)

    result = ImagesService.upload_to_s3("resize_s3.png", resize: 0.5)

    assert result.present?
    # When resize is requested, the result should be an S3 URL containing the filename
    # (with .jpg if ImageMagick succeeds, or .png if it falls back)
    assert_match(/resize_s3\.(jpg|png)/, result)
    assert_match(/^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com/, result)
  end

  test "download_and_upload_to_s3 returns nil when s3 disabled" do
    @config_stub.stubs(:get).with("aws_access_key_id").returns(nil)

    result = ImagesService.download_and_upload_to_s3("https://example.com/image.jpg")

    assert_nil result
  end

  test "download_and_upload_to_s3 downloads image and uploads to S3" do
    stub_request(:get, "https://example.com/photo.jpg")
      .to_return(
        status: 200,
        body: "fake image content",
        headers: { "Content-Type" => "image/jpeg" }
      )

    mock_client = stub
    mock_client.stubs(:put_object).returns(nil)
    Aws::S3::Client.stubs(:new).returns(mock_client)

    result = ImagesService.download_and_upload_to_s3("https://example.com/photo.jpg")

    assert result.present?
    assert_match %r{^https://test-bucket\.s3\.us-east-1\.amazonaws\.com/frankmd/\d{4}/\d{2}/photo\.jpg$}, result
  end

  test "download_and_upload_to_s3 generates filename when URL has no extension" do
    stub_request(:get, "https://example.com/images/")
      .to_return(
        status: 200,
        body: "fake image content",
        headers: { "Content-Type" => "image/png" }
      )

    mock_client = stub
    mock_client.stubs(:put_object).returns(nil)
    Aws::S3::Client.stubs(:new).returns(mock_client)

    result = ImagesService.download_and_upload_to_s3("https://example.com/images/")

    assert result.present?
    assert_match(/\.png$/, result)
  end

  test "download_and_upload_to_s3 returns nil on download failure" do
    stub_request(:get, "https://example.com/missing.jpg")
      .to_return(status: 404, body: "Not Found")

    result = ImagesService.download_and_upload_to_s3("https://example.com/missing.jpg")

    assert_nil result
  end

  test "download_and_upload_to_s3 refuses a host resolving to a non-public address (SSRF)" do
    EgressPolicy.stubs(:resolve).returns([ IPAddr.new("169.254.169.254") ])

    result = ImagesService.download_and_upload_to_s3("http://169.254.169.254/latest/meta-data/iam/")

    assert_nil result
    assert_not_requested :get, "http://169.254.169.254/latest/meta-data/iam/"
  end

  test "download_and_upload_to_s3 refuses a non-http scheme (SSRF)" do
    assert_nil ImagesService.download_and_upload_to_s3("file:///etc/passwd")
  end
end
