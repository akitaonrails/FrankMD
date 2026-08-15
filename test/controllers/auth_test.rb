# frozen_string_literal: true

require "test_helper"

class AuthTest < ActionDispatch::IntegrationTest
  def setup
    setup_test_notes_dir
    @auth_token = "a" * 32
    @config_stub = mock
    @config_stub.stubs(:get).returns(nil)
    @config_stub.stubs(:get).with("auth_token").returns(@auth_token)
    @config_stub.stubs(:config_file_path).returns(@test_notes_dir.join(".fed"))
    @config_stub.stubs(:ui_settings).returns({})
    @config_stub.stubs(:feature_available?).returns(false)
    Config.stubs(:new).returns(@config_stub)
    @cache = ActiveSupport::Cache::MemoryStore.new
    Rails.stubs(:cache).returns(@cache)
  end

  def teardown
    teardown_test_notes_dir
  end

  test "blank auth token preserves legacy access" do
    @config_stub.stubs(:get).with("auth_token").returns(nil)

    get root_url

    assert_response :success
    assert_includes response.body, 'id="app-loading"'
    assert_match(/integrity="sha384-/, response.body)
  end

  test "configured auth redirects HTML requests to login" do
    get root_url

    assert_redirected_to login_path
  end

  test "login page is available without authentication" do
    get login_path

    assert_response :success
    refute_includes response.body, 'id="app-loading"'
  end

  test "successful login permits subsequent HTML requests" do
    post login_path, params: { password: @auth_token }

    assert_redirected_to root_path
    follow_redirect!
    assert_response :success
  end

  test "wrong login token returns unauthorized" do
    post login_path, params: { password: "wrong-token" }

    assert_response :unauthorized
  end

  test "logout clears the authenticated session" do
    post login_path, params: { password: @auth_token }
    delete logout_path

    assert_redirected_to login_path
    get root_url
    assert_redirected_to login_path
  end

  test "anonymous JSON requests are rejected when token authentication is enabled" do
    get "/notes/search", params: { q: "test" }, as: :json

    assert_response :unauthorized
    assert_equal({ "error" => "unauthorized" }, JSON.parse(response.body))
  end

  test "Bearer token authenticates API requests" do
    get "/notes/search", params: { q: "test" }, as: :json,
        headers: { "Authorization" => "Bearer #{@auth_token}" }

    assert_response :success
  end

  test "rotating the token revokes existing sessions while allowing a new login" do
    post login_path, params: { password: @auth_token }
    assert_redirected_to root_path

    rotated_token = "b" * 32
    @config_stub.stubs(:get).with("auth_token").returns(rotated_token)

    get root_url
    assert_redirected_to login_path

    post login_path, params: { password: rotated_token }
    assert_redirected_to root_path
  end

  test "short configured tokens fail closed" do
    @config_stub.stubs(:get).with("auth_token").returns("too-short")

    get root_url
    assert_response :service_unavailable

    post login_path, params: { password: "too-short" }
    assert_response :service_unavailable
  end

  test "failed logins are throttled and a successful login clears failures" do
    9.times { post login_path, params: { password: "wrong-token" } }
    assert_response :unauthorized

    post login_path, params: { password: @auth_token }
    assert_redirected_to root_path

    delete logout_path
    10.times { post login_path, params: { password: "wrong-token" } }
    assert_response :unauthorized
    post login_path, params: { password: "wrong-token" }
    assert_response :too_many_requests
  end

  test "IP throttling survives a fresh session but does not affect other IPs" do
    blocked_ip = "203.0.113.10"
    other_ip = "203.0.113.11"

    10.times do
      post login_path, params: { password: "wrong-token" }, env: { "REMOTE_ADDR" => blocked_ip }
      assert_response :unauthorized
    end

    reset!
    post login_path, params: { password: "wrong-token" }, env: { "REMOTE_ADDR" => blocked_ip }
    assert_response :too_many_requests

    reset!
    post login_path, params: { password: "wrong-token" }, env: { "REMOTE_ADDR" => other_ip }
    assert_response :unauthorized
  end

  test "valid auth headers bypass CSRF protection but invalid headers cannot mutate notes" do
    original_forgery_setting = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true

    post create_note_url(path: "header-auth.md"), params: { content: "created" }, as: :json,
      headers: { "Authorization" => "Bearer #{@auth_token}" }
    assert_response :created

    patch update_note_url(path: "header-auth.md"), params: { content: "updated" }, as: :json,
      headers: { "X-Auth-Token" => @auth_token }
    assert_response :success
    assert_equal "updated", File.read(@test_notes_dir.join("header-auth.md"))

    patch update_note_url(path: "header-auth.md"), params: { content: "wrong" }, as: :json,
      headers: { "Authorization" => "Bearer wrong-token" }
    assert_response :unprocessable_entity
    assert_equal "updated", File.read(@test_notes_dir.join("header-auth.md"))

    patch update_note_url(path: "header-auth.md"), params: { content: "missing" }, as: :json
    assert_response :unprocessable_entity
    assert_equal "updated", File.read(@test_notes_dir.join("header-auth.md"))
  ensure
    ActionController::Base.allow_forgery_protection = original_forgery_setting
  end

  test "health check remains available without a token" do
    get rails_health_check_url

    assert_response :success
  end
end
