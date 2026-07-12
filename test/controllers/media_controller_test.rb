# frozen_string_literal: true

require "test_helper"

class MediaControllerTest < ActionDispatch::IntegrationTest
  def video_file(filename, content = "fake video bytes")
    Rack::Test::UploadedFile.new(StringIO.new(content), "video/mp4", original_filename: filename)
  end

  test "upload returns error when no file provided" do
    post "/media/upload"
    assert_response :unprocessable_entity

    data = JSON.parse(response.body)
    assert_includes data["error"], "No file"
  end

  test "upload saves an allowed video to notes/videos" do
    post "/media/upload", params: { file: video_file("clip.mp4") }
    assert_response :success

    data = JSON.parse(response.body)
    assert data["url"].start_with?("videos/")
    assert data["url"].include?("clip")

    notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    created = notes_path.join(data["url"])
    FileUtils.rm_f(created) if created.exist?
  end

  test "upload rejects a disallowed extension with a reason" do
    post "/media/upload", params: { file: video_file("notes.txt") }
    assert_response :unprocessable_entity

    data = JSON.parse(response.body)
    assert_includes data["error"], "not an accepted video type"
  end
end
