# frozen_string_literal: true

require "test_helper"
require "aws-sdk-s3"

class S3MediaLibraryServiceTest < ActiveSupport::TestCase
  def setup
    @config = stub("config")
    @config.stubs(:get).with("aws_s3_bucket").returns("bucket")
    @config.stubs(:get).with("aws_region").returns("us-east-1")
    @config.stubs(:get).with("aws_s3_endpoint").returns(nil)
    @config.stubs(:get).with("aws_s3_force_path_style").returns(false)
    @config.stubs(:upload_extensions).with("image_upload_extensions").returns(%w[.png .jpg])
    @config.stubs(:upload_extensions).with("video_upload_extensions").returns(%w[.mp4 .webm])
    @client = mock("s3")
    Config.stubs(:new).returns(@config)
    @service = S3MediaLibraryService.new(config: @config, client: @client)
  end

  test "lists only supported objects below the FrankMD prefix across pages" do
    first = Aws::S3::Types::ListObjectsV2Output.new(
      contents: [ object("frankmd/2026/photo.png", 12), object("foreign/photo.png", 9), object("frankmd/readme.txt", 5) ],
      is_truncated: true, next_continuation_token: "next"
    )
    second = Aws::S3::Types::ListObjectsV2Output.new(contents: [ object("frankmd/2026/clip.mp4", 20) ], is_truncated: false)
    @client.expects(:list_objects_v2).with(bucket: "bucket", prefix: "frankmd/", continuation_token: nil).returns(first)
    @client.expects(:list_objects_v2).with(bucket: "bucket", prefix: "frankmd/", continuation_token: "next").returns(second)

    result = @service.list

    assert_equal [ "frankmd/2026/photo.png" ], result[:images].pluck(:path)
    assert_equal [ "frankmd/2026/clip.mp4" ], result[:videos].pluck(:path)
    assert_equal "s3", result[:images].first[:provider]
    assert_match %r{https://bucket\.s3\.us-east-1\.amazonaws\.com/frankmd/2026/photo\.png}, result[:images].first[:url]
  end

  test "delete rejects foreign and unsupported keys without calling S3" do
    @client.expects(:delete_object).never

    refute @service.delete("foreign/photo.png")
    refute @service.delete("frankmd/../../photo.png")
    refute @service.delete("frankmd/readme.txt")
  end

  test "delete removes an exact managed key" do
    @client.expects(:delete_object).with(bucket: "bucket", key: "frankmd/2026/photo.png")

    assert @service.delete("frankmd/2026/photo.png")
  end

  test "rename copies to a free sibling key before deleting the source" do
    sequence = sequence("rename")
    @client.expects(:head_object).in_sequence(sequence).with(bucket: "bucket", key: "frankmd/2026/renamed.png")
      .raises(Aws::S3::Errors::NotFound.new(nil, "missing"))
    @client.expects(:copy_object).with(
      bucket: "bucket", key: "frankmd/2026/renamed.png", copy_source: "bucket/frankmd/2026/photo.png"
    ).in_sequence(sequence)
    @client.expects(:delete_object).in_sequence(sequence).with(bucket: "bucket", key: "frankmd/2026/photo.png")

    result = @service.rename("frankmd/2026/photo.png", "renamed.png")

    assert_equal "frankmd/2026/renamed.png", result[:path]
    assert_equal "renamed.png", result[:name]
  end

  test "rename rejects traversal, unsupported types, and collisions without mutation" do
    @client.expects(:copy_object).never
    @client.expects(:delete_object).never
    assert_nil @service.rename("frankmd/2026/photo.png", "../outside.png")
    assert_nil @service.rename("frankmd/2026/photo.png", "readme.txt")
    assert_nil @service.rename("frankmd/2026/photo.png", "#{'a' * 1_100}.png")

    @client.expects(:head_object).with(bucket: "bucket", key: "frankmd/2026/existing.png").returns(Object.new)
    assert_nil @service.rename("frankmd/2026/photo.png", "existing.png")
  end

  private

  def object(key, size)
    Aws::S3::Types::Object.new(key: key, size: size, last_modified: Time.utc(2026, 10, 16))
  end
end
