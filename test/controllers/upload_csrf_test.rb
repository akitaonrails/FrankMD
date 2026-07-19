# frozen_string_literal: true

require "test_helper"

# The upload endpoints used to `skip_forgery_protection`, which — combined with
# the editable S3 destination key (#117) — let a cross-site POST target any key
# in the configured bucket. They now inherit CSRF protection like every other
# mutating action; the in-app clients already send the token via @rails/request.js.
class UploadCsrfTest < ActionDispatch::IntegrationTest
  # Integration tests disable forgery protection globally; turn it back on so we
  # exercise the real check instead of the test-env bypass.
  setup do
    @forgery_was = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
  end

  teardown do
    ActionController::Base.allow_forgery_protection = @forgery_was
  end

  PROTECTED_POSTS = [
    "/images/upload",
    "/images/upload_to_s3",
    "/images/upload_external_to_s3",
    "/images/upload_base64",
    "/media/upload",
    "/ai/fix_grammar",
    "/ai/generate_image"
  ].freeze

  PROTECTED_POSTS.each do |path|
    test "#{path} rejects a POST without a CSRF token" do
      post path
      assert_response :unprocessable_entity,
        "#{path} must enforce CSRF protection"
    end
  end
end
