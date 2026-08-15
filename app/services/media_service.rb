# frozen_string_literal: true

# Handles drag-and-drop video uploads.
# Saves to notes/videos/ (served via NotesController#serve_asset) or to S3.
# Unlike images, videos are never resized/re-encoded.
#
# Security-sensitive steps (extension allow-list, size cap, safe temp handling,
# filename sanitizing) live in UploadStorage, shared with ImagesService.
class MediaService
  SUBDIR = "videos"

  VIDEO_MIME_TYPES = {
    ".mp4"  => "video/mp4",
    ".webm" => "video/webm",
    ".mkv"  => "video/x-matroska",
    ".mov"  => "video/quicktime",
    ".avi"  => "video/x-msvideo",
    ".m4v"  => "video/x-m4v",
    ".ogv"  => "video/ogg"
  }.freeze

  class << self
    # Save an uploaded video file locally or to S3.
    # Returns { url: "..." } on success or { error: "..." } on failure.
    def save_upload(uploaded_file, upload_to_s3: false, s3_prefix: nil)
      return { error: "No file provided" } unless uploaded_file

      UploadStorage.enforce_size!(uploaded_file)
      extension = UploadStorage.validate_extension!(uploaded_file, "video_upload_extensions", "video")

      UploadStorage.with_temp_copy(uploaded_file, extension) do |temp_path|
        if upload_to_s3 && ImagesService.s3_enabled?
          store_s3(temp_path, uploaded_file.original_filename, custom_prefix: s3_prefix)
        else
          store_local(temp_path, uploaded_file.original_filename)
        end
      end
    rescue UploadStorage::RejectedError => e
      { error: e.message }
    end

    private

    def store_local(temp_path, original_filename)
      require "fileutils"

      videos_dir = UploadStorage.notes_path.join(SUBDIR)
      FileUtils.mkdir_p(videos_dir)

      dest_filename = UploadStorage.dest_filename(original_filename)
      FileUtils.cp(temp_path, videos_dir.join(dest_filename))

      { url: "#{SUBDIR}/#{dest_filename}" }
    end

    def store_s3(temp_path, original_filename, custom_prefix: nil)
      require "aws-sdk-s3"

      cfg = Config.new
      bucket = cfg.get("aws_s3_bucket")
      region = UploadStorage.s3_region

      client = Aws::S3::Client.new(
        access_key_id: cfg.get("aws_access_key_id"),
        secret_access_key: cfg.get("aws_secret_access_key"),
        region: region
      )

      key = UploadStorage.s3_key(original_filename, custom_prefix: custom_prefix)
      content_type = VIDEO_MIME_TYPES[File.extname(key).downcase] || "application/octet-stream"

      File.open(temp_path, "rb") do |io|
        client.put_object(bucket: bucket, key: key, body: io, content_type: content_type, if_none_match: "*")
      end

      { url: UploadStorage.s3_url(bucket, region, key) }
    rescue Aws::S3::Errors::PreconditionFailed
      { error: "Video upload failed" }
    end
  end
end
