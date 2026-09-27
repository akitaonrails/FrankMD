# frozen_string_literal: true

require "erb"
require "time"

# Lists and deletes the local media managed by FrankMD under NOTES_PATH.
# Existing paths stay rooted at images/ and videos/ for Markdown compatibility.
class MediaLibraryService
  MEDIA_DIRECTORIES = {
    "images" => { type: "image", extension_key: "image_upload_extensions" },
    "videos" => { type: "video", extension_key: "video_upload_extensions" }
  }.freeze

  def initialize(base_path: nil, config: Config.new)
    @base_path = Pathname.new(base_path || UploadStorage.notes_path).expand_path
    @config = config
  end

  def list
    MEDIA_DIRECTORIES.each_with_object({}) do |(directory, media), collections|
      collections[directory.to_sym] = list_directory(directory, media)
    end
  end

  # Delete one supported media file from its managed root. The path is always
  # relative to NOTES_PATH, matching the paths used by existing Markdown notes.
  # Return false for missing or invalid paths so callers cannot use this method
  # to probe or mutate files outside the two managed media directories.
  def delete(path)
    file = safe_media_file(path)
    return false unless file

    File.delete(file)
    true
  rescue Errno::ENOENT, Errno::ENOTDIR
    false
  end

  private

  def list_directory(directory, media)
    root = @base_path.join(directory)
    return [] unless root.directory? && !root.symlink?

    extensions = allowed_extensions(media)
    media_files(root).filter_map do |file|
      next unless extensions.include?(file.extname.downcase)

      relative_path = file.relative_path_from(@base_path).to_s
      next unless PathSafety.contain(@base_path, relative_path) == file

      stat = file.stat
      name = file.basename.to_s

      {
        name: name,
        path: relative_path,
        size: stat.size,
        mtime: stat.mtime.iso8601,
        preview_url: "/notes/#{relative_path.split('/').map { |part| ERB::Util.url_encode(part) }.join('/')}",
        type: media[:type],
        _sort_mtime: stat.mtime.to_f
      }
    rescue SystemCallError
      # Media can be removed while the Library is being read. Skip vanished or
      # unreadable entries instead of failing the whole listing.
      next
    end.sort_by { |item| [ -item[:_sort_mtime], item[:path].downcase ] }
      .map { |item| item.except(:_sort_mtime) }
  end

  def media_files(directory)
    return [] if directory.symlink? || !directory.directory?

    directory.children.flat_map do |entry|
      next [] if entry.symlink? || entry.basename.to_s.start_with?(".")
      next media_files(entry) if entry.directory?

      entry.file? ? [ entry ] : []
    end
  end

  def allowed_extensions(media)
    @config.upload_extensions(media[:extension_key])
  end

  def safe_media_file(path)
    segments = path.to_s.split("/", -1)
    return nil if segments.length < 2 || segments.any? { |segment| segment.blank? || segment == "." || segment == ".." || segment.include?("\\") }

    directory = segments.first
    media = MEDIA_DIRECTORIES[directory]
    return nil unless media
    return nil unless allowed_extensions(media).include?(File.extname(segments.last).downcase)

    relative_path = segments.join("/")
    file = PathSafety.contain(@base_path, relative_path)
    return nil unless file && file == @base_path.join(relative_path).cleanpath

    managed_root = @base_path.join(directory)
    return nil unless PathSafety.contain(managed_root, segments.drop(1).join("/")) == file

    # Reject symlinks in the managed root, intermediate directories, or leaf.
    # PathSafety also checks real-path containment, while lstat ensures an
    # in-tree symlink cannot be used to redirect deletion to another entry.
    current = @base_path
    segments.each_with_index do |segment, index|
      current = current.join(segment)
      stat = current.lstat
      return nil if stat.symlink?
      return nil if index < segments.length - 1 && !stat.directory?
      return nil if index == segments.length - 1 && !stat.file?
    end

    file
  rescue Errno::ENOENT, Errno::ENOTDIR, Errno::ELOOP
    nil
  end
end
