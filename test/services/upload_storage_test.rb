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
