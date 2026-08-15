# frozen_string_literal: true

class ImagesService
  SUPPORTED_EXTENSIONS = %w[.jpg .jpeg .png .gif .webp .svg .bmp].freeze
  MAX_RESULTS = 10

  # Cap external-image downloads so a hostile (but public) URL can't OOM the
  # server with a multi-GB body. Enforced on both Content-Length and the
  # streamed byte count.
  MAX_EXTERNAL_IMAGE_BYTES = 25 * 1024 * 1024 # 25 MB
  MAX_EXTERNAL_IMAGE_REDIRECTS = 5
  MAX_EXTERNAL_IMAGE_SECONDS = 30

  class << self
    def enabled?
      resolved_images_path.present?
    end

    def s3_enabled?
      cfg = Config.new
      [
        cfg.get("aws_access_key_id"),
        cfg.get("aws_secret_access_key"),
        cfg.get("aws_s3_bucket")
      ].all?(&:present?)
    end

    def images_path
      return nil unless enabled?
      Pathname.new(resolved_images_path).expand_path
    end

    def list(search: nil)
      return [] unless enabled?
      return [] unless images_path.exist?

      files = find_images(search)
        .sort_by { |f| -f.mtime.to_i }  # Most recent first
        .first(MAX_RESULTS)

      files.map do |file|
        relative_path = file.relative_path_from(images_path).to_s
        dimensions = get_image_dimensions(file)
        {
          name: file.basename.to_s,
          path: relative_path,
          full_path: file.to_s,
          mtime: file.mtime.iso8601,
          size: file.size,
          width: dimensions[:width],
          height: dimensions[:height]
        }
      end
    end

    def get_image_dimensions(path)
      require "open3"

      # Use ImageMagick identify to get dimensions
      stdout, stderr, status = Open3.capture3(*imagemagick_cmd("identify"), "-format", "%wx%h", path.to_s)

      if status.success? && stdout.present?
        match = stdout.strip.match(/(\d+)x(\d+)/)
        if match
          return { width: match[1].to_i, height: match[2].to_i }
        end
      end

      { width: nil, height: nil }
    rescue StandardError => e
      Rails.logger.debug "Could not get dimensions for #{path}: #{e.message}"
      { width: nil, height: nil }
    end

    def find_image(path)
      return nil unless enabled?

      full_path = safe_path(path)
      return nil unless full_path&.exist? && full_path&.file?
      return nil unless upload_extensions.include?(full_path.extname.downcase)

      full_path
    end

    def upload_to_s3(path, resize: nil, custom_key: nil)
      return nil unless s3_enabled?

      full_path = find_image(path)
      return nil unless full_path

      require "aws-sdk-s3"

      cfg = Config.new
      region = UploadStorage.s3_region
      client = Aws::S3::Client.new(
        access_key_id: cfg.get("aws_access_key_id"),
        secret_access_key: cfg.get("aws_secret_access_key"),
        region: region
      )

      # Process image if resize ratio provided
      if resize
        file_content, content_type, filename = resize_and_compress(full_path, nil, resize)
      else
        file_content = full_path.binread
        content_type = content_type_for(full_path)
        filename = full_path.basename.to_s
      end

      bucket = cfg.get("aws_s3_bucket")
      key = UploadStorage.s3_key(filename, custom_key: custom_key)

      # Upload without ACL first (works with buckets that have ACLs disabled)
      begin
        client.put_object(
          bucket: bucket,
          key: key,
          body: file_content,
          content_type: content_type,
          if_none_match: "*"
        )
      rescue Aws::S3::Errors::AccessControlListNotSupported
        # Bucket has ACLs disabled, which is fine for public buckets with policies
        # The object was still uploaded successfully
      rescue Aws::S3::Errors::PreconditionFailed
        return nil
      end

      UploadStorage.s3_url(bucket, region, key)
    end

    # Upload a file from browser (local folder picker)
    # Saves to notes/images/ directory or uploads to S3
    def upload_file(uploaded_file, resize: nil, upload_to_s3: false, s3_key: nil)
      return { error: "No file provided" } unless uploaded_file

      # Enforce the same allow-list + size cap as video uploads. Without this,
      # an HTML/SVG file dropped here would be stored under the notes directory
      # and served inline by NotesController#serve_asset (stored XSS), since
      # that endpoint sets Content-Type from the file extension. See
      # UploadStorage for the shared, single-source-of-truth checks.
      UploadStorage.enforce_size!(uploaded_file)
      extension = UploadStorage.validate_extension!(uploaded_file, "image_upload_extensions", "image")

      UploadStorage.with_temp_copy(uploaded_file, extension) do |temp_path|
        if upload_to_s3 && s3_enabled?
          upload_temp_to_s3(temp_path, uploaded_file.original_filename, resize: resize, custom_key: s3_key)
        else
          save_to_notes_directory(temp_path, uploaded_file.original_filename, resize: resize)
        end
      end
    rescue UploadStorage::RejectedError => e
      { error: e.message }
    end

    # Upload base64 encoded image data (e.g., from AI image generation)
    def upload_base64_data(base64_data, mime_type: nil, filename: nil, upload_to_s3: false, s3_prefix: nil)
      require "base64"
      require "securerandom"
      require "fileutils"

      UploadStorage.enforce_base64_size!(base64_data.bytesize)

      # Decode base64 data
      begin
        file_content = Base64.strict_decode64(base64_data)
      rescue ArgumentError => e
        return { error: "Invalid base64 data: #{e.message}" }
      end

      # Determine content type and extension
      mime_type = mime_type.presence || "image/png"
      extension = extension_for_content_type(mime_type)

      # Generate filename if not provided
      filename = filename.presence || "ai_generated_#{SecureRandom.hex(8)}#{extension}"
      # Ensure filename has correct extension
      unless filename.match?(/\.\w+$/)
        filename = "#{filename}#{extension}"
      end

      # Enforce the same allow-list + size cap as the multipart upload path. This
      # route previously skipped both, so mime_type=image/svg+xml (-> .svg) or a
      # caller-supplied .html filename could be stored under the notes dir and
      # served inline by NotesController#serve_asset (stored XSS). See UploadStorage.
      UploadStorage.enforce_bytes!(file_content.bytesize)
      UploadStorage.validate_filename!(filename, "image_upload_extensions", "image")

      # Create temp file
      temp_dir = Rails.root.join("tmp", "uploads")
      FileUtils.mkdir_p(temp_dir)
      temp_path = temp_dir.join("#{SecureRandom.hex(8)}_#{filename}")
      File.binwrite(temp_path, file_content)

      begin
        if upload_to_s3 && s3_enabled?
          upload_temp_to_s3(temp_path, filename, resize: nil, custom_prefix: s3_prefix)
        else
          save_to_notes_directory(temp_path, filename, resize: nil)
        end
      ensure
        FileUtils.rm_f(temp_path)
      end
    rescue UploadStorage::RejectedError => e
      { error: e.message }
    end

    def download_and_upload_to_s3(url, resize: nil, custom_prefix: nil)
      return nil unless s3_enabled?

      require "aws-sdk-s3"
      require "net/http"
      require "securerandom"
      require "tempfile"

      # Fetch the client-supplied URL through the SSRF guard (EgressPolicy),
      # following redirects with per-hop re-validation and a streamed size cap.
      result = fetch_external_image(url)
      return nil unless result

      file_content = result[:body]
      content_type = result[:content_type]
      source_uri = result[:uri]

      # Generate filename from URL or use random name
      extension = extension_for_content_type(content_type)
      original_name = File.basename(source_uri.path).gsub(/[^a-zA-Z0-9._-]/, "_")
      if original_name.blank? || original_name == "_" || !original_name.match?(/\.\w+$/)
        original_name = "#{SecureRandom.hex(8)}#{extension}"
      end

      # Process image if resize ratio provided
      if resize
        # Write to temp file for ImageMagick processing
        temp_file = Tempfile.new([ "frankmd", extension ])
        begin
          temp_file.binmode
          temp_file.write(file_content)
          temp_file.close

          file_content, content_type, original_name = resize_and_compress(Pathname.new(temp_file.path), original_name, resize)
        ensure
          temp_file.unlink
        end
      end

      cfg = Config.new
      bucket = cfg.get("aws_s3_bucket")
      region = UploadStorage.s3_region

      client = Aws::S3::Client.new(
        access_key_id: cfg.get("aws_access_key_id"),
        secret_access_key: cfg.get("aws_secret_access_key"),
        region: region
      )

      key = UploadStorage.s3_key(original_name, custom_prefix: custom_prefix)

      begin
        client.put_object(
          bucket: bucket,
          key: key,
          body: file_content,
          content_type: content_type,
          if_none_match: "*"
        )
      rescue Aws::S3::Errors::AccessControlListNotSupported
        # Bucket has ACLs disabled, which is fine
      rescue Aws::S3::Errors::PreconditionFailed
        return nil
      end

      UploadStorage.s3_url(bucket, region, key)
    rescue EgressPolicy::BlockedError => e
      Rails.logger.warn "Refused to fetch external image: #{e.message}"
      nil
    end

    private

    def resolved_images_path
      # Config handles: .fed file > IMAGES_PATH env > default (nil)
      # XDG/Pictures fallbacks are handled by the initializer setting IMAGES_PATH
      Config.new.get("images_path")
    end

    def find_images(search)
      pattern = images_path.join("**", "*")
      Pathname.glob(pattern).select do |file|
        next false unless file.file?
        next false unless SUPPORTED_EXTENSIONS.include?(file.extname.downcase)
        next false if search.present? && !file.basename.to_s.downcase.include?(search.downcase)
        true
      end
    end

    def safe_path(path)
      return nil if path.blank?

      PathSafety.contain(images_path, path)
    end

    def upload_extensions
      config = Config.new
      config.upload_extensions("image_upload_extensions") + config.upload_extensions("video_upload_extensions")
    end

    def content_type_for(path)
      case path.extname.downcase
      when ".jpg", ".jpeg" then "image/jpeg"
      when ".png" then "image/png"
      when ".gif" then "image/gif"
      when ".webp" then "image/webp"
      when ".svg" then "image/svg+xml"
      when ".bmp" then "image/bmp"
      else "application/octet-stream"
      end
    end

    def extension_for_content_type(content_type)
      case content_type.to_s.split(";").first.strip.downcase
      when "image/jpeg" then ".jpg"
      when "image/png" then ".png"
      when "image/gif" then ".gif"
      when "image/webp" then ".webp"
      when "image/svg+xml" then ".svg"
      when "image/bmp" then ".bmp"
      else ".jpg"
      end
    end

    def resize_and_compress(source_path, original_name = nil, ratio = 0.5)
      require "tempfile"
      require "open3"
      require "fileutils"

      original_name ||= source_path.basename.to_s
      resize_arg = imagemagick_resize_arg(ratio)

      # Change extension to .jpg for compressed output
      base_name = File.basename(original_name, ".*")
      output_name = "#{base_name}.jpg"

      # Use internal temp files to avoid passing user-controlled paths to ImageMagick.
      source_file = Tempfile.new([ "frankmd_source", source_path.extname.presence || ".img" ])
      output_file = Tempfile.new([ "frankmd_resized", ".jpg" ])
      begin
        source_file.close
        output_file.close

        FileUtils.cp(source_path.to_s, source_file.path)

        cmd = [
          *imagemagick_cmd("convert"),
          source_file.path,
          "-resize", resize_arg,
          "-quality", "95",
          "-strip",
          output_file.path
        ]

        stdout, stderr, status = Open3.capture3(*cmd)

        unless status.success?
          Rails.logger.error "ImageMagick resize failed: #{stderr}"
          # Fall back to original file
          return [ source_path.binread, content_type_for(source_path), original_name ]
        end

        file_content = File.binread(output_file.path)
        [ file_content, "image/jpeg", output_name ]
      rescue Errno::ENOENT => e
        # No ImageMagick binary at all — degrade to the original file instead of
        # failing the whole upload (same fallback as a failed resize).
        Rails.logger.error "ImageMagick not available, skipping resize: #{e.message}"
        [ source_path.binread, content_type_for(source_path), original_name ]
      ensure
        source_file.unlink
        output_file.unlink
      end
    end

    # Save uploaded file to notes/images/ directory
    def save_to_notes_directory(temp_path, original_filename, resize: nil)
      require "fileutils"

      notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
      images_dir = notes_path.join("images")
      FileUtils.mkdir_p(images_dir)

      safe_name = original_filename.gsub(/[^a-zA-Z0-9._-]/, "_")

      if resize.present? && resize.to_f > 0
        # Resize and save - output is always jpg
        base_name = File.basename(safe_name, ".*")
        dest_filename = UploadStorage.dest_filename("#{base_name}.jpg")
        resized_data, _content_type, _new_filename = resize_and_compress(Pathname.new(temp_path), dest_filename, resize.to_f)
        dest_path = images_dir.join(dest_filename)
        File.binwrite(dest_path, resized_data)
        { url: "images/#{dest_filename}" }
      else
        # Copy as-is
        dest_filename = UploadStorage.dest_filename(safe_name)
        dest_path = images_dir.join(dest_filename)
        FileUtils.cp(temp_path, dest_path)
        { url: "images/#{dest_filename}" }
      end
    end

    # ImageMagick 7 replaced the separate `convert` / `identify` binaries with a
    # single `magick` entrypoint, and several IM7 packages (Homebrew, recent
    # Debian) ship no `convert` at all — invoking it raises Errno::ENOENT and
    # breaks image resizing. Resolve the right invocation at call time: prefer
    # IM7 (`magick`, with `magick identify` for the sub-tool) and fall back to
    # the IM6 names when only those are installed.
    def imagemagick_cmd(tool)
      return [ tool ] unless executable_on_path?("magick")

      tool == "convert" ? [ "magick" ] : [ "magick", tool ]
    end

    def executable_on_path?(name)
      ENV.fetch("PATH", "").split(File::PATH_SEPARATOR).any? do |dir|
        next false if dir.empty?

        candidate = File.join(dir, name)
        File.file?(candidate) && File.executable?(candidate)
      end
    end

    def imagemagick_resize_arg(ratio)
      case ratio.to_s
      when "0.25", "0.250", "25", "25%" then "25%"
      when "0.33", "0.333", "33", "33%" then "33%"
      when "0.5", "0.50", "50", "50%", "true" then "50%"
      when "0.67", "0.666", "0.667", "67", "67%" then "67%"
      when "0.75", "0.750", "75", "75%" then "75%"
      when "1", "1.0", "1.00", "100", "100%" then "100%"
      else "50%"
      end
    end

    # Fetch a client-supplied image URL safely: every hop (including redirects)
    # is validated by EgressPolicy and the connection is pinned to the validated
    # IP; the body is streamed with a hard size cap. Returns { body:, content_type: }
    # or nil. EgressPolicy::BlockedError propagates (the controller renders it).
    def fetch_external_image(url)
      require "net/http"

      current = url
      deadline = monotonic_time + MAX_EXTERNAL_IMAGE_SECONDS
      (MAX_EXTERNAL_IMAGE_REDIRECTS + 1).times do
        return nil if deadline_exceeded?(deadline)

        uri, pinned_ip = EgressPolicy.checked_target(current)

        http = Net::HTTP.new(uri.host, uri.port)
        http.ipaddr = pinned_ip # connect to the validated IP (no DNS re-resolution)
        http.use_ssl = uri.scheme == "https"
        http.open_timeout = 10
        http.read_timeout = 30

        request = Net::HTTP::Get.new(uri)
        request["User-Agent"] = "Mozilla/5.0 (compatible; FrankMD/1.0)"

        # Net::HTTP#request with a block returns the response, not the block's
        # value, so capture what we need in these outer variables instead.
        fetched = nil
        redirect_to = nil
        http.start do |conn|
          conn.request(request) do |response|
            next if deadline_exceeded?(deadline)

            if response.is_a?(Net::HTTPRedirection) && response["location"].present?
              # Re-validate the redirect target on the next loop iteration.
              redirect_to = URI.join(uri, response["location"]).to_s
            elsif !response.is_a?(Net::HTTPSuccess)
              Rails.logger.error "Failed to download image: #{response.code}"
            elsif response.content_length && response.content_length > MAX_EXTERNAL_IMAGE_BYTES
              Rails.logger.error "External image exceeds size cap (Content-Length)"
            else
              body = "".b
              oversized = deadline_exceeded?(deadline)
              response.read_body do |chunk|
                body << chunk
                if body.bytesize > MAX_EXTERNAL_IMAGE_BYTES || deadline_exceeded?(deadline)
                  oversized = true
                  break
                end
              end
              fetched = { body: body, content_type: response["Content-Type"] || "image/jpeg", uri: uri } unless oversized
            end
          end
        end

        return fetched if fetched
        return nil unless redirect_to

        current = redirect_to
      end

      Rails.logger.error "External image exceeded #{MAX_EXTERNAL_IMAGE_REDIRECTS} redirects"
      nil
    end

    def monotonic_time
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    def deadline_exceeded?(deadline)
      monotonic_time >= deadline
    end

    # Upload a temp file to S3
    def upload_temp_to_s3(temp_path, original_filename, resize: nil, custom_key: nil, custom_prefix: nil)
      require "aws-sdk-s3"

      cfg = Config.new
      bucket = cfg.get("aws_s3_bucket")
      region = UploadStorage.s3_region

      client = Aws::S3::Client.new(
        access_key_id: cfg.get("aws_access_key_id"),
        secret_access_key: cfg.get("aws_secret_access_key"),
        region: region
      )

      # Process image if resize ratio provided
      if resize
        file_content, content_type, filename = resize_and_compress(Pathname.new(temp_path), original_filename, resize)
      else
        file_content = File.binread(temp_path)
        content_type = content_type_for(Pathname.new(temp_path))
        filename = original_filename
      end

      key = UploadStorage.s3_key(filename, custom_key: custom_key, custom_prefix: custom_prefix)

      begin
        client.put_object(
          bucket: bucket,
          key: key,
          body: file_content,
          content_type: content_type,
          if_none_match: "*"
        )
      rescue Aws::S3::Errors::AccessControlListNotSupported
        # Bucket has ACLs disabled, which is fine
      rescue Aws::S3::Errors::PreconditionFailed
        return nil
      end

      { url: UploadStorage.s3_url(bucket, region, key) }
    end
  end
end
