# frozen_string_literal: true

# Handles drag-and-drop video uploads.
# Saves to notes/videos/ (served via NotesController#serve_asset) or to S3.
# Unlike images, videos are never resized/re-encoded.
class MediaService
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
    def save_upload(uploaded_file, upload_to_s3: false)
      return { error: "No file provided" } unless uploaded_file

      extension = File.extname(uploaded_file.original_filename.to_s).downcase
      allowed = Config.new.upload_extensions("video_upload_extensions")
      unless allowed.include?(extension)
        shown = extension.presence || "no extension"
        return { error: "#{shown} is not an accepted video type. Accepted: #{allowed.join(', ')}" }
      end

      require "securerandom"
      require "fileutils"

      temp_dir = Rails.root.join("tmp", "uploads")
      FileUtils.mkdir_p(temp_dir)
      temp_path = temp_dir.join("#{SecureRandom.hex(8)}_#{uploaded_file.original_filename}")
      File.binwrite(temp_path, uploaded_file.read)

      begin
        if upload_to_s3 && ImagesService.s3_enabled?
          upload_to_s3(temp_path, uploaded_file.original_filename)
        else
          save_to_notes_directory(temp_path, uploaded_file.original_filename)
        end
      ensure
        FileUtils.rm_f(temp_path)
      end
    end

    private

    def save_to_notes_directory(temp_path, original_filename)
      require "fileutils"

      notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
      videos_dir = notes_path.join("videos")
      FileUtils.mkdir_p(videos_dir)

      timestamp = Time.now.strftime("%Y%m%d_%H%M%S")
      safe_name = original_filename.gsub(/[^a-zA-Z0-9._-]/, "_")
      dest_filename = "#{timestamp}_#{safe_name}"
      FileUtils.cp(temp_path, videos_dir.join(dest_filename))

      { url: "videos/#{dest_filename}" }
    end

    def upload_to_s3(temp_path, original_filename)
      require "aws-sdk-s3"

      cfg = Config.new
      bucket = cfg.get("aws_s3_bucket")
      region = cfg.get("aws_region") || "us-east-1"

      client = Aws::S3::Client.new(
        access_key_id: cfg.get("aws_access_key_id"),
        secret_access_key: cfg.get("aws_secret_access_key"),
        region: region
      )

      filename = original_filename.gsub(/[^a-zA-Z0-9._-]/, "_")
      key = "frankmd/#{Time.current.strftime('%Y/%m')}/#{filename}"
      content_type = VIDEO_MIME_TYPES[File.extname(filename).downcase] || "application/octet-stream"

      begin
        client.put_object(
          bucket: bucket,
          key: key,
          body: File.binread(temp_path),
          content_type: content_type
        )
      rescue Aws::S3::Errors::AccessControlListNotSupported
        # Bucket has ACLs disabled, which is fine
      end

      encoded_key = key.split("/").map { |part| ERB::Util.url_encode(part) }.join("/")
      { url: "https://#{bucket}.s3.#{region}.amazonaws.com/#{encoded_key}" }
    end
  end
end
