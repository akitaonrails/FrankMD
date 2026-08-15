# frozen_string_literal: true

require "securerandom"

# Shared helpers for drag-and-drop file uploads (images and videos).
#
# Centralizes the security-sensitive parts — extension allow-listing, filename
# sanitizing, size limits, and safe temp handling — in ONE place so the image
# and video upload paths cannot drift apart. They previously did: the video
# path validated the extension while the image path did not, which let an HTML
# file be stored under the notes directory and served inline (stored XSS).
module UploadStorage
  # Characters permitted in a stored filename; everything else becomes "_".
  # Note this turns "/" and "\" into "_", so path separators in a client
  # supplied name can never produce directory traversal in the destination.
  SANITIZE_RE = /[^a-zA-Z0-9._-]/

  # Cap upload size to avoid unbounded disk/memory use. Videos are large, so
  # this is generous; it exists to stop pathological/abusive uploads, not to
  # enforce a product limit.
  MAX_UPLOAD_BYTES = 512 * 1024 * 1024 # 512 MB

  S3_KEY_PREFIX = "frankmd"
  DEFAULT_S3_REGION = "us-east-1"

  # Raised when an upload is rejected for a user-correctable reason (bad
  # extension, too large). Services rescue it and return { error: message }.
  class RejectedError < StandardError; end

  module_function

  # Validate the uploaded file's extension against the configured allow-list.
  # Returns the normalized (downcased) extension, or raises RejectedError with
  # a user-facing message. `kind` is "image" or "video" for the message.
  def validate_extension!(uploaded_file, config_key, kind)
    validate_filename!(uploaded_file.original_filename.to_s, config_key, kind)
  end

  # Same allow-list check for a bare filename string — for uploads that have no
  # UploadedFile object (e.g. base64 / AI-generated images). Returns the
  # normalized (downcased) extension, or raises RejectedError.
  def validate_filename!(filename, config_key, kind)
    extension = File.extname(filename.to_s).downcase
    allowed = Config.new.upload_extensions(config_key)
    unless allowed.include?(extension)
      shown = extension.presence || "no extension"
      raise RejectedError, "#{shown} is not an accepted #{kind} type. Accepted: #{allowed.join(', ')}"
    end
    extension
  end

  # Reject uploads larger than MAX_UPLOAD_BYTES before we read them into memory
  # or copy them to disk.
  def enforce_size!(uploaded_file)
    size = uploaded_file.size if uploaded_file.respond_to?(:size)
    enforce_bytes!(size)
  end

  # Same cap for an already-known byte size (e.g. decoded base64 content).
  def enforce_bytes!(size)
    return unless size && size > MAX_UPLOAD_BYTES

    raise RejectedError, "File is too large (max #{MAX_UPLOAD_BYTES / (1024 * 1024)} MB)."
  end

  # Base64 adds four encoded bytes for every three decoded bytes. The small
  # allowance keeps this guard compatible with harmless transport decoration.
  def max_base64_encoded_bytes
    ((MAX_UPLOAD_BYTES + 2) / 3) * 4 + 1024
  end

  def enforce_base64_size!(size)
    return unless size > max_base64_encoded_bytes

    raise RejectedError, "File is too large (max #{MAX_UPLOAD_BYTES / (1024 * 1024)} MB)."
  end

  # Collision-resistant, sanitized destination filename: "<timestamp>_<random>_<safe>".
  def dest_filename(original_filename)
    safe = original_filename.to_s.gsub(SANITIZE_RE, "_")
    "#{Time.now.strftime('%Y%m%d_%H%M%S')}_#{SecureRandom.hex(4)}_#{safe}"
  end

  # Stream the uploaded bytes to a private temp file whose name is RANDOM (never
  # the client-supplied name — that could contain "../"), yield the path, and
  # always clean up. Streams rather than reading the whole file into memory.
  def with_temp_copy(uploaded_file, extension)
    require "securerandom"
    require "fileutils"

    temp_dir = Rails.root.join("tmp", "uploads")
    FileUtils.mkdir_p(temp_dir)
    temp_path = temp_dir.join("#{SecureRandom.hex(16)}#{extension}")

    source = uploaded_file.respond_to?(:tempfile) ? uploaded_file.tempfile : uploaded_file
    if source.respond_to?(:path) && source.path && File.exist?(source.path)
      IO.copy_stream(source, temp_path)
    else
      File.binwrite(temp_path, uploaded_file.read)
    end

    yield temp_path
  ensure
    FileUtils.rm_f(temp_path) if temp_path
  end

  # Base notes directory. NOTES_PATH is the app's root data path (not a
  # per-folder Config SCHEMA value); Config itself reads it the same way.
  def notes_path
    Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
  end

  def s3_region
    Config.new.get("aws_region").presence || DEFAULT_S3_REGION
  end

  # Build the S3 object key for an upload.
  #
  # - custom_key: treated as a sanitized prefix/base and made unique server-side.
  # - custom_prefix: the user typed only the folder (external/AI/video flows,
  #   where the server owns the filename). Sanitized, then the safe filename is
  #   appended.
  # - neither: the default "frankmd/YYYY/MM/<filename>".
  #
  # Custom values that sanitize down to nothing fall back to the default rather
  # than producing a bare or malformed key.
  def s3_key(original_filename, custom_key: nil, custom_prefix: nil)
    key = sanitize_s3_key(custom_key)
    return unique_s3_key(key, original_filename) if key.present?

    safe = original_filename.to_s.gsub(SANITIZE_RE, "_")
    prefix = sanitize_s3_key(custom_prefix)
    prefix = "#{S3_KEY_PREFIX}/#{Time.current.strftime('%Y/%m')}" if prefix.blank?
    unique_s3_key("#{prefix}/#{safe}", original_filename)
  end

  # Sanitize a user-supplied key or prefix. Unlike SANITIZE_RE alone (which
  # turns "/" into "_"), this keeps "/" so nested prefixes work, while dropping
  # empty, "." and ".." segments so a client can't produce a leading slash,
  # "//", or "../" traversal in the destination.
  def sanitize_s3_key(value)
    value.to_s.split("/").filter_map do |segment|
      next if segment.empty? || segment == "." || segment == ".."
      segment.gsub(SANITIZE_RE, "_")
    end.join("/")
  end

  def unique_s3_key(key, original_filename)
    extension = File.extname(key)
    extension = File.extname(original_filename.to_s) if extension.blank?
    base = extension.present? && key.end_with?(extension) ? key.delete_suffix(extension) : key
    "#{base}-#{SecureRandom.hex(8)}#{extension}"
  end

  def s3_url(bucket, region, key)
    encoded = key.split("/").map { |part| ERB::Util.url_encode(part) }.join("/")
    "https://#{bucket}.s3.#{region}.amazonaws.com/#{encoded}"
  end
end
