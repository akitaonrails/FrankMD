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
  end
end
