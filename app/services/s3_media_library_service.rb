# frozen_string_literal: true

require "erb"
require "time"

# Lists and mutates FrankMD-owned objects in the configured S3 bucket.
# Objects outside the frankmd/ prefix are intentionally never exposed.
class S3MediaLibraryService
  PREFIX = "#{UploadStorage::S3_KEY_PREFIX}/"
  MAX_OBJECTS = 5_000

  def initialize(config: Config.new, client: nil)
    @config = config
    @client = client || UploadStorage.s3_client(config)
    @bucket = config.get("aws_s3_bucket")
  end

  def list
    collections = { images: [], videos: [] }
    objects.each do |object|
      media = media_for(object.key)
      next unless media

      collections[media[:collection]] << item(object.key, object.size, object.last_modified, media[:type])
    end
    collections.transform_values { |items| items.sort_by { |entry| [ -Time.iso8601(entry[:mtime]).to_f, entry[:path] ] } }
  end

  def delete(key)
    return false unless media_for(key)

    @client.delete_object(bucket: @bucket, key: key)
    true
  end

  def rename(key, new_name)
    media = media_for(key)
    return nil unless media && valid_new_name?(new_name, media[:extension_key])

    destination = File.join(File.dirname(key), new_name)
    return nil unless valid_key?(destination)
    return nil if destination == key || object_exists?(destination)

    @client.copy_object(bucket: @bucket, key: destination, copy_source: encoded_copy_source(key))
    @client.delete_object(bucket: @bucket, key: key)
    { name: new_name, path: destination, url: object_url(destination) }
  end

  private

  def objects
    results = []
    token = nil
    loop do
      response = @client.list_objects_v2(bucket: @bucket, prefix: PREFIX, continuation_token: token)
      results.concat(response.contents)
      raise UploadStorage::RejectedError, "S3 Library contains too many objects" if results.length > MAX_OBJECTS
      break unless response.is_truncated

      token = response.next_continuation_token
      raise UploadStorage::RejectedError, "S3 Library pagination failed" if token.blank?
    end
    results
  end

  def media_for(key)
    return nil unless valid_key?(key)

    extension = File.extname(key).downcase
    return { collection: :images, type: "image", extension_key: "image_upload_extensions" } if @config.upload_extensions("image_upload_extensions").include?(extension)
    { collection: :videos, type: "video", extension_key: "video_upload_extensions" } if @config.upload_extensions("video_upload_extensions").include?(extension)
  end

  def valid_key?(key)
    return false unless key.is_a?(String) && key.start_with?(PREFIX) && key.bytesize <= 1_024

    segments = key.split("/", -1)
    segments.length > 1 && segments.all? { |segment| segment.present? && segment != "." && segment != ".." && !segment.include?("\\") && !segment.include?("\0") }
  end

  def valid_new_name?(name, extension_key)
    return false unless name.is_a?(String) && name == File.basename(name) && name == name.gsub(UploadStorage::SANITIZE_RE, "_")

    UploadStorage.validate_filename!(name, extension_key, "media")
    true
  rescue UploadStorage::RejectedError
    false
  end

  def object_exists?(key)
    @client.head_object(bucket: @bucket, key: key)
    true
  rescue Aws::S3::Errors::NotFound
    false
  end

  def encoded_copy_source(key)
    ([ @bucket ] + key.split("/")).map { |part| ERB::Util.url_encode(part) }.join("/")
  end

  def item(key, size, modified_at, type)
    {
      name: File.basename(key), path: key, size: size, mtime: modified_at.iso8601,
      preview_url: object_url(key), url: object_url(key), type: type, provider: "s3"
    }
  end

  def object_url(key)
    UploadStorage.s3_url(@bucket, UploadStorage.s3_region, key)
  end
end
