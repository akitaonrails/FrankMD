# frozen_string_literal: true

require "test_helper"

class LogsControllerTest < ActionDispatch::IntegrationTest
  # Serialize this class across parallel test worker processes. These tests
  # mutate the shared log/<env>.log — one even renames it away — which races
  # sibling tests running in other forked processes. That race was the source
  # of a long-standing intermittent CI failure: the controller's missing-file
  # branch has no "environment" key, so the reader test saw nil whenever the
  # rename test held the file hostage mid-request.
  LOCK_FILE = Rails.root.join("tmp", "logs_controller_test.lock")

  def setup
    FileUtils.mkdir_p(LOCK_FILE.dirname)
    @lock = File.open(LOCK_FILE, File::CREAT | File::RDWR)
    @lock.flock(File::LOCK_EX)

    @log_file = Rails.root.join("log", "#{Rails.env}.log")
    @original_content = File.read(@log_file) if File.exist?(@log_file)
  end

  def teardown
    # Restore original log content
    if @original_content
      File.write(@log_file, @original_content)
    end
  ensure
    if @lock
      @lock.flock(File::LOCK_UN)
      @lock.close
    end
  end

  test "tail returns JSON with environment and file info" do
    FileUtils.touch(@log_file) unless File.exist?(@log_file)
    get logs_tail_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal Rails.env, data["environment"]
    assert_equal "#{Rails.env}.log", data["file"]
    assert data.key?("lines")
    assert_instance_of Array, data["lines"]
  end

  test "tail respects lines parameter" do
    # This test verifies the lines parameter limits output count
    # Use default 100 lines to see actual log content
    get logs_tail_url, params: { lines: 5 }, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    # Should return at most 5 lines (may be fewer if log is short)
    assert data["lines"].length <= 5,
           "Expected at most 5 lines but got #{data['lines'].length}"
  end

  test "tail limits lines to 500 max" do
    # Request more than max
    get logs_tail_url, params: { lines: 1000 }, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    # Should be capped at 500
    assert data["lines"].length <= 500
  end

  test "tail handles empty log file" do
    # Flush the log then write empty
    Rails.logger.flush if Rails.logger.respond_to?(:flush)
    File.write(@log_file, "")

    get logs_tail_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    # Lines should be an array (may have a few lines from the request itself)
    assert_instance_of Array, data["lines"]
  end

  test "tail handles missing log file" do
    # Temporarily rename the log file
    backup_path = "#{@log_file}.backup"
    File.rename(@log_file, backup_path) if File.exist?(@log_file)

    begin
      get logs_tail_url, as: :json
      assert_response :success

      data = JSON.parse(response.body)
      # Note: Rails may recreate the log file during the request itself,
      # so we accept either "file not found" or an empty/minimal log
      if data["error"]
        assert_equal "Log file not found", data["error"]
        assert_equal [], data["lines"]
      else
        # File was recreated by Rails during request - lines should be minimal
        assert_instance_of Array, data["lines"]
      end
    ensure
      File.rename(backup_path, @log_file) if File.exist?(backup_path)
    end
  end

  test "tail handles invalid lines parameter" do
    get logs_tail_url, params: { lines: -5 }, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    # Should use default (100) but be capped by actual file size
    assert_instance_of Array, data["lines"]
  end

  # -- Config endpoint tests --

  test "config returns JSON with config file info and entries" do
    get logs_config_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert data.key?("config_file")
    assert data.key?("config_file_exists")
    assert data.key?("ai_configured_in_file")
    assert_equal Rails.env, data["environment"]
    assert_instance_of Array, data["entries"]
  end

  test "config entries include all SCHEMA keys" do
    get logs_config_url, as: :json
    data = JSON.parse(response.body)

    keys = data["entries"].map { |e| e["key"] }
    Config::SCHEMA.keys.each do |schema_key|
      assert_includes keys, schema_key, "Missing config key: #{schema_key}"
    end
  end

  test "config entries have expected fields" do
    get logs_config_url, as: :json
    data = JSON.parse(response.body)

    entry = data["entries"].first
    assert entry.key?("key")
    assert entry.key?("value")
    assert entry.key?("source")
    assert entry.key?("env_var")
    assert entry.key?("sensitive")
    assert_includes %w[file env default], entry["source"]
  end

  test "config masks sensitive values" do
    get logs_config_url, as: :json
    data = JSON.parse(response.body)

    sensitive_entries = data["entries"].select { |e| e["sensitive"] }
    sensitive_entries.each do |entry|
      next if entry["value"].nil?
      # Masked values should contain asterisks
      assert_match(/\*/, entry["value"], "Sensitive key #{entry['key']} should be masked")
    end
  end

  test "config source reflects ENV when ENV is set" do
    ENV["YOUTUBE_API_KEY"] = "test-yt-key-12345678"
    begin
      get logs_config_url, as: :json
      data = JSON.parse(response.body)

      yt_entry = data["entries"].find { |e| e["key"] == "youtube_api_key" }
      # Source should be env (unless overridden by .fed file)
      assert_includes %w[file env], yt_entry["source"]
    ensure
      ENV.delete("YOUTUBE_API_KEY")
    end
  end

  test "tail returns lines as array of strings" do
    # Write some content
    lines = [ "Line A", "Line B", "Line C" ]
    File.write(@log_file, lines.join("\n") + "\n")

    get logs_tail_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    data["lines"].each do |line|
      assert_instance_of String, line
    end
  end
end
