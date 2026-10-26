# frozen_string_literal: true

require "test_helper"

class RecentFilesControllerTest < ActionDispatch::IntegrationTest
  setup { setup_test_notes_dir }
  teardown { teardown_test_notes_dir }

  test "shared history records opens renders escaped paths and clears" do
    create_test_note("docs/<sample>.md")
    post recent_files_url, params: { path: "docs/<sample>.md" }, as: :json
    assert_response :no_content
    get recent_files_url
    assert_response :success
    assert_select 'a[data-path="docs/<sample>.md"]', text: /<sample>/
    refute_includes response.body, "<sample>"
    delete recent_files_url, as: :json
    assert_response :no_content
    assert_empty RecentFilesService.new.entries
  end

  test "index answers the HTML panel regardless of accept header" do
    create_test_note("plain.md")
    post recent_files_url, params: { path: "plain.md" }, as: :json

    get recent_files_url, as: :json
    assert_response :success
    assert_includes response.content_type, "text/html"
    assert_select 'a[data-path="plain.md"]'
  end

  test "recent files initially show five notes with a button only when more are available" do
    get recent_files_url
    assert_select '[data-home-target="showMore"]', count: 0
    assert_select '[data-home-target="showLess"]', count: 0

    10.times do |index|
      create_test_note("note-#{index}.md")
      RecentFilesService.new.record("note-#{index}.md")
      next unless [ 4, 5, 9 ].include?(index)

      get recent_files_url
      assert_response :success
      assert_select ".home-recent-list li:not([hidden])", count: 5
      assert_select ".home-recent-list li[hidden]", count: index - 4
      assert_select '[data-home-target="showMore"][aria-controls="home-recent-files"][aria-expanded="false"]', count: index > 4 ? 1 : 0
      assert_select '[data-home-target="showLess"][aria-controls="home-recent-files"][aria-expanded="true"][hidden]', count: index > 4 ? 1 : 0
      assert_select ".home-recent-list a", count: index + 1
    end
  end

  test "opening age and machine-readable timestamp render with a fallback for malformed dates" do
    create_test_note("timed.md")
    freeze_time do
      timestamp = 10.minutes.ago.iso8601
      Config.new.set("recent_files", [ { "path" => "timed.md", "opened_at" => timestamp } ])
      get recent_files_url
      assert_response :success
      assert_select ".home-file-details .home-file-name", text: "timed"
      assert_select "time.home-file-time[datetime='#{timestamp}']", text: "10 minutes ago"

      Config.new.set("recent_files", [ { "path" => "timed.md", "opened_at" => "broken" } ])
      get recent_files_url
      assert_response :success
      assert_select "time", count: 0
      assert_select ".home-file-time", text: "Unknown time"
    end
  end

  test "missing notes cannot be recorded and config state is not user-writable" do
    post recent_files_url, params: { path: "missing.md" }, as: :json
    assert_response :not_found
    patch config_url, params: { recent_files: "[]" }, as: :json
    assert_response :unprocessable_entity
    refute @test_notes_dir.join("missing.md").exist?
  end

  test "history failure reports unavailable without a successful response" do
    RecentFilesService.any_instance.stubs(:record).returns(false)
    post recent_files_url, params: { path: "safe.md" }, as: :json
    assert_response :service_unavailable
  end

  test "config lock cannot be downloaded or changed as a note" do
    Config.new
    get note_url(path: Config::LOCK_FILE)
    assert_response :not_found
    assert_raises(NotesService::InvalidPathError) { NotesService.new.write(Config::LOCK_FILE, "unsafe") }
  end
end
