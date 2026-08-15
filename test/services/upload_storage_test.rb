# frozen_string_literal: true

require "test_helper"

class UploadStorageTest < ActiveSupport::TestCase
  Uploaded = Struct.new(:original_filename, :size, :read_body, keyword_init: true) do
    def read = read_body
  end

  def setup
    @config_stub = stub("config")
    @config_stub.stubs(:get).returns(nil)
    @config_stub.stubs(:upload_extensions).with("image_upload_extensions").returns([ ".png", ".jpg" ])
    Config.stubs(:new).returns(@config_stub)
  end

  # === validate_extension! ===

  test "validate_extension! returns the normalized extension for an allowed file" do
    ext = UploadStorage.validate_extension!(Uploaded.new(original_filename: "a.PNG"), "image_upload_extensions", "image")
    assert_equal ".png", ext
  end

  test "validate_extension! raises RejectedError for a disallowed extension" do
    err = assert_raises(UploadStorage::RejectedError) do
      UploadStorage.validate_extension!(Uploaded.new(original_filename: "evil.html"), "image_upload_extensions", "image")
    end
    assert_includes err.message, ".html"
    assert_includes err.message, "not an accepted image type"
  end

  test "validate_extension! raises for a file with no extension" do
    err = assert_raises(UploadStorage::RejectedError) do
      UploadStorage.validate_extension!(Uploaded.new(original_filename: "README"), "image_upload_extensions", "image")
    end
    assert_includes err.message, "no extension"
  end

  test "validate_extension! is not fooled by a double extension" do
    err = assert_raises(UploadStorage::RejectedError) do
      UploadStorage.validate_extension!(Uploaded.new(original_filename: "evil.png.html"), "image_upload_extensions", "image")
    end
    assert_includes err.message, ".html"
  end

  # === enforce_size! ===

  test "enforce_size! raises when the file exceeds the cap" do
    big = Uploaded.new(original_filename: "big.png", size: UploadStorage::MAX_UPLOAD_BYTES + 1)
    err = assert_raises(UploadStorage::RejectedError) { UploadStorage.enforce_size!(big) }
    assert_includes err.message, "too large"
  end

  test "enforce_size! allows a file at the cap" do
    ok = Uploaded.new(original_filename: "ok.png", size: UploadStorage::MAX_UPLOAD_BYTES)
    assert_nil UploadStorage.enforce_size!(ok)
  end

  # === dest_filename ===

  test "dest_filename strips path separators and traversal, keeping a timestamp prefix" do
    name = UploadStorage.dest_filename("../../etc/pa ss!.mp4")
    refute_includes name, "/"
    refute_includes name, " "
    refute_includes name, "!"
    assert_match(/\A\d{8}_\d{6}_/, name)
    assert name.end_with?(".mp4")
  end

  test "dest_filename is unique for uploads with the same name in the same second" do
    Time.stubs(:now).returns(Time.utc(2026, 1, 1, 12, 0, 0))

    refute_equal UploadStorage.dest_filename("video.mp4"), UploadStorage.dest_filename("video.mp4")
  end

  # === sanitize_s3_key ===

  test "sanitize_s3_key keeps nested prefixes" do
    assert_equal "blog/2026/hero", UploadStorage.sanitize_s3_key("blog/2026/hero")
  end

  test "sanitize_s3_key strips traversal, leading and doubled slashes" do
    assert_equal "etc/passwd", UploadStorage.sanitize_s3_key("../../etc/passwd")
    assert_equal "a/b", UploadStorage.sanitize_s3_key("/a//b/")
    assert_equal "a/b", UploadStorage.sanitize_s3_key("a/./b")
  end

  test "sanitize_s3_key replaces unsafe characters per segment" do
    assert_equal "my_folder/a_b", UploadStorage.sanitize_s3_key("my folder/a b")
  end

  test "sanitize_s3_key returns empty string when nothing survives" do
    assert_equal "", UploadStorage.sanitize_s3_key("../..")
    assert_equal "", UploadStorage.sanitize_s3_key(nil)
  end

  # === s3_key ===

  test "s3_key builds the default frankmd/YYYY/MM/<filename> when no custom value" do
    assert_match %r{\Afrankmd/\d{4}/\d{2}/photo-[0-9a-f]{16}\.png\z}, UploadStorage.s3_key("photo.png")
  end

  test "s3_key sanitizes the filename in the default path" do
    key = UploadStorage.s3_key("../ev il.png")
    assert_match %r{\Afrankmd/\d{4}/\d{2}/}, key
    assert_match(%r{/.._ev_il-[0-9a-f]{16}\.png\z}, key)
  end

  test "s3_key makes a custom key unique while preserving its prefix and extension" do
    key = UploadStorage.s3_key("photo.png", custom_key: "blog/2026/hero.png", custom_prefix: "ignored")
    refute_equal "blog/2026/hero.png", key
    assert_match(%r{\Ablog/2026/hero-[0-9a-f]{16}\.png\z}, key)
  end

  test "s3_key appends the safe filename to a custom_prefix" do
    assert_match %r{\Ablog/2026/photo-[0-9a-f]{16}\.png\z}, UploadStorage.s3_key("photo.png", custom_prefix: "blog/2026")
  end

  test "s3_key blocks traversal in a custom_key" do
    key = UploadStorage.s3_key("photo.png", custom_key: "../../etc/passwd")
    assert_match(%r{\Aetc/passwd-[0-9a-f]{16}\.png\z}, key)
  end

  test "s3_key falls back to the default when a custom value sanitizes to empty" do
    assert_match %r{\Afrankmd/\d{4}/\d{2}/photo-[0-9a-f]{16}\.png\z}, UploadStorage.s3_key("photo.png", custom_key: "../..")
    assert_match %r{\Afrankmd/\d{4}/\d{2}/photo-[0-9a-f]{16}\.png\z}, UploadStorage.s3_key("photo.png", custom_prefix: "///")
  end

  # === with_temp_copy ===

  test "with_temp_copy writes to a random name (not the client filename) and cleans up" do
    uploaded = Uploaded.new(original_filename: "../../evil.png", size: 3, read_body: "abc")
    seen = nil

    UploadStorage.with_temp_copy(uploaded, ".png") do |temp_path|
      seen = temp_path
      assert File.exist?(temp_path)
      refute_includes File.basename(temp_path.to_s), "evil"
      refute_includes temp_path.to_s, ".."
      assert temp_path.to_s.end_with?(".png")
    end

    refute File.exist?(seen), "temp file must be removed after the block"
  end
end
