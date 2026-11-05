ENV["RAILS_ENV"] ||= "test"
ENV["FRANKMD_LOCALE"] ||= "en"  # Force English locale for tests

# SimpleCov must be loaded before any application code
require "simplecov"
SimpleCov.start "rails" do
  skip "/test/"
  skip "/config/"
  skip "/db/"
  enable_coverage :branch
  # Support for parallel tests
  command_name "minitest-#{$$}"
  minimum_coverage 0
end

require_relative "../config/environment"
require "rails/test_help"
require "fileutils"
require "mocha/minitest"
require "webmock/minitest"

# Allow real network connections in tests by default
WebMock.allow_net_connect!

# Ensure tests run with English locale
I18n.default_locale = :en
I18n.locale = :en

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # ApplicationController#set_locale assigns the global I18n.locale on every
    # request, so a controller test that configures a non-English locale leaves
    # it set for whatever test runs next in the same worker. A model test that
    # asserts on an English error message then fails, depending on ordering.
    # Restore the locale after every test so no test can leak it.
    teardown do
      I18n.locale = I18n.default_locale
    end

    # Create a temporary notes directory for each test
    def setup_test_notes_dir
      @original_notes_path = ENV["NOTES_PATH"]
      @test_notes_dir = Rails.root.join("tmp", "test_notes_#{SecureRandom.hex(8)}")
      FileUtils.mkdir_p(@test_notes_dir)
      ENV["NOTES_PATH"] = @test_notes_dir.to_s
    end

    def teardown_test_notes_dir
      FileUtils.rm_rf(@test_notes_dir) if @test_notes_dir&.exist?
      ENV["NOTES_PATH"] = @original_notes_path
    end

    # Helper to create a test note
    def create_test_note(path, content = "# Test\n\nContent")
      full_path = @test_notes_dir.join(path)
      FileUtils.mkdir_p(full_path.dirname)
      File.write(full_path, content)
      full_path
    end

    # Helper to create a test folder
    def create_test_folder(path)
      full_path = @test_notes_dir.join(path)
      FileUtils.mkdir_p(full_path)
      full_path
    end

    # Small magic-valid payloads for upload tests. Content validation must not
    # rely on attacker-controlled filenames or declared MIME types.
    def tiny_png
      [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ].pack("C*")
    end

    def tiny_jpeg
      "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00".b
    end

    def tiny_mp4
      "\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2".b
    end

    def tiny_webm
      "\x1A\x45\xDF\xA3\x9F\x42\x86\x81\x01\x42\xF7\x81\x01\x42\xF2\x81\x04".b +
        "\x42\xF3\x81\x08\x42\x82\x84webm".b
    end
  end
end
