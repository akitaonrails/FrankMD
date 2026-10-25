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
