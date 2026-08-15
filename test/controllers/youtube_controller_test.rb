# frozen_string_literal: true

require "test_helper"

class YoutubeControllerTest < ActionDispatch::IntegrationTest
  test "config returns enabled false when no API key" do
    ENV.delete("YOUTUBE_API_KEY")

    get "/youtube/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal false, data["enabled"]
  end

  test "config returns enabled true when API key is set" do
    original_key = ENV["YOUTUBE_API_KEY"]
    ENV["YOUTUBE_API_KEY"] = "test_api_key"

    get "/youtube/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
  ensure
    if original_key
      ENV["YOUTUBE_API_KEY"] = original_key
    else
      ENV.delete("YOUTUBE_API_KEY")
    end
  end

  test "search returns error when no API key" do
    ENV.delete("YOUTUBE_API_KEY")

    get "/youtube/search", params: { q: "test" }, as: :json
    assert_response :service_unavailable

    data = JSON.parse(response.body)
    assert_includes data["error"], "not configured"
  end

  test "search returns error when query is blank" do
    get "/youtube/search", params: { q: "" }, as: :json
    assert_response :bad_request

    data = JSON.parse(response.body)
    assert_includes data["error"], "required"
  end
end

class YoutubeControllerSearchTest < ActionDispatch::IntegrationTest
  def setup
    @original_key = ENV["YOUTUBE_API_KEY"]
    ENV["YOUTUBE_API_KEY"] = "test_youtube_key"

    @youtube_api_response = {
      "items" => [
        {
          "id" => { "videoId" => "abc123" },
          "snippet" => {
            "title" => "Test Video Title",
            "channelTitle" => "Test Channel",
            "thumbnails" => {
              "medium" => { "url" => "https://i.ytimg.com/vi/abc123/mqdefault.jpg" }
            }
          }
        },
        {
          "id" => { "videoId" => "def456" },
          "snippet" => {
            "title" => "Another Video",
            "channelTitle" => "Another Channel",
            "thumbnails" => {
              "default" => { "url" => "https://i.ytimg.com/vi/def456/default.jpg" }
            }
          }
        }
      ]
    }

    WebMock.disable_net_connect!(allow_localhost: true)

    stub_request(:get, /googleapis\.com\/youtube\/v3\/search/)
      .to_return(
        status: 200,
        body: @youtube_api_response.to_json,
        headers: { "Content-Type" => "application/json" }
      )
  end

  def teardown
    if @original_key
      ENV["YOUTUBE_API_KEY"] = @original_key
    else
      ENV.delete("YOUTUBE_API_KEY")
    end
    WebMock.reset!
    WebMock.allow_net_connect!
  end

  test "search returns videos as JSON" do
    get "/youtube/search", params: { q: "rails tutorial" }, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal 2, data["videos"].length

    video = data["videos"].first
    assert_equal "abc123", video["id"]
    assert_equal "Test Video Title", video["title"]
    assert_equal "Test Channel", video["channel"]
    assert_equal "https://i.ytimg.com/vi/abc123/mqdefault.jpg", video["thumbnail"]
  end

  test "search falls back to default thumbnail when medium is missing" do
    get "/youtube/search", params: { q: "test" }, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    second_video = data["videos"][1]
    assert_equal "https://i.ytimg.com/vi/def456/default.jpg", second_video["thumbnail"]
  end

  test "HTML search results use the thumbnail error action without inline handlers" do
    get "/youtube/search", params: { q: "test" }

    assert_response :success
    assert_includes response.body, 'data-action="error->video-dialog#thumbnailError"'
    assert_not_includes response.body, "onerror="
  end

  test "search passes query to YouTube API" do
    get "/youtube/search", params: { q: "ruby on rails" }, as: :json
    assert_response :success

    assert_requested :get, /googleapis\.com\/youtube\/v3\/search/,
      query: hash_including("q" => "ruby on rails", "type" => "video", "maxResults" => "6")
  end

  test "search handles YouTube API error" do
    stub_request(:get, /googleapis\.com\/youtube\/v3\/search/)
      .to_return(status: 403, body: '{"error": {"message": "quotaExceeded"}}')

    get "/youtube/search", params: { q: "test" }, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal [], data["videos"]
    assert data["error"].present?
  end

  test "search handles YouTube API returning empty items" do
    stub_request(:get, /googleapis\.com\/youtube\/v3\/search/)
      .to_return(
        status: 200,
        body: { "items" => [] }.to_json,
        headers: { "Content-Type" => "application/json" }
      )

    get "/youtube/search", params: { q: "obscure query" }, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal [], data["videos"]
  end
end
