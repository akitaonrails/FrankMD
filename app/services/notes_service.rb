# frozen_string_literal: true

require "digest"

class NotesService
  class NotFoundError < StandardError; end
  class InvalidPathError < StandardError; end
  class AlreadyExistsError < InvalidPathError; end

  MAX_SEARCH_FILE_BYTES = 5 * 1024 * 1024
  SEARCH_REGEX_TIMEOUT = 0.5
  FILESYSTEM_LOCK_FILENAME = ".frankmd-filesystem.lock"

  def initialize(base_path: nil)
    @base_path = Pathname.new(base_path || ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    FileUtils.mkdir_p(@base_path) unless @base_path.exist?
  end

  def list_tree
    with_filesystem_lock(File::LOCK_SH) { build_tree(@base_path) }
  end

  def read(path)
    full_path = safe_path(path)
    raise NotFoundError, "Note not found: #{path}" unless full_path.file?

    full_path.read
  end

  def write(path, content)
    with_filesystem_lock do
      full_path = safe_path(path, must_exist: false)
      FileUtils.mkdir_p(full_path.dirname)
      atomic_write(full_path, content)
    end
    true
  end

  # Create a note without replacing a file another request created first.
  # The temporary file and final path share a filesystem, and hard-linking the
  # completed temporary file makes the destination appear atomically only when
  # it does not already exist.
  def create(path, content)
    with_filesystem_lock do
      full_path = safe_path(path, must_exist: false)
      FileUtils.mkdir_p(full_path.dirname)
      raise AlreadyExistsError, "Destination already exists: #{path}" if path_exists?(full_path)

      atomic_create(full_path, content)
    end
    true
  end

  # Update an existing note without creating missing parent directories. This
  # keeps stale autosave requests from recreating a moved or deleted note.
  def update(path, content)
    with_filesystem_lock do
      full_path = safe_path(path)
      raise NotFoundError, "Note not found: #{path}" unless full_path.file?

      atomic_write(full_path, content)
    end
    true
  end

  def delete(path)
    with_filesystem_lock do
      full_path = safe_path(path)
      raise NotFoundError, "Note not found: #{path}" unless full_path.file?

      full_path.delete
    end
    true
  end

  def rename(old_path, new_path)
    with_filesystem_lock do
      old_full = safe_path(old_path)
      new_full = safe_path(new_path, must_exist: false)

      raise NotFoundError, "Note not found: #{old_path}" unless old_full.exist?
      raise AlreadyExistsError, "Destination already exists: #{new_path}" if path_exists?(new_full)

      FileUtils.mkdir_p(new_full.dirname)
      begin
        # The destination check and move run under a lock shared by every
        # FrankMD instance using this NOTES_PATH. FileUtils.mv preserves the
        # atomic same-filesystem rename and its copy/remove fallback for EXDEV.
        FileUtils.mv(old_full, new_full)
      rescue Errno::EEXIST, Errno::ENOTEMPTY, Errno::EISDIR
        raise AlreadyExistsError, "Destination already exists: #{new_path}"
      end
    end
    true
  end

  def create_folder(path)
    with_filesystem_lock do
      full_path = safe_path(path, must_exist: false)
      raise AlreadyExistsError, "Destination already exists: #{path}" if path_exists?(full_path)

      FileUtils.mkdir_p(full_path.dirname)
      begin
        Dir.mkdir(full_path)
      rescue Errno::EEXIST
        raise AlreadyExistsError, "Destination already exists: #{path}"
      end
    end
    true
  end

  def delete_folder(path)
    with_filesystem_lock do
      full_path = safe_path(path)
      raise NotFoundError, "Folder not found: #{path}" unless full_path.directory?

      if full_path.children.any?
        raise InvalidPathError, "Folder not empty: #{path}"
      end

      full_path.rmdir
    end
    true
  end

  def exists?(path)
    full_path = safe_path(path, must_exist: false)
    full_path.exist?
  end

  def file?(path)
    full_path = safe_path(path, must_exist: false)
    full_path.file?
  end

  def directory?(path)
    full_path = safe_path(path, must_exist: false)
    full_path.directory?
  end

  # Search file contents for a pattern (text or regex)
  # Returns an array of matches with context, sorted by file modification time (newest first)
  def search_content(query, context_lines: 3, max_results: 50)
    return [] if query.blank?

    # Try to compile as regex, fall back to escaped literal.
    regex = begin
      Regexp.new(query, Regexp::IGNORECASE, timeout: SEARCH_REGEX_TIMEOUT)
    rescue Regexp::TimeoutError
      return []
    rescue RegexpError
      Regexp.new(Regexp.escape(query), Regexp::IGNORECASE, timeout: SEARCH_REGEX_TIMEOUT)
    end

    results = []
    # Use unsorted file collection for faster search (skip mtime stat on all files)
    collect_markdown_files_unsorted(@base_path) do |file_path|
      break if results.size >= max_results

      relative_path = file_path.relative_path_from(@base_path).to_s
      file_matches = search_file(file_path, regex, context_lines, max_results - results.size)

      # Only stat files that have matches (much cheaper than all files)
      mtime = file_matches.any? ? file_path.mtime : nil

      file_matches.each do |match|
        results << match.merge(
          path: relative_path,
          name: file_path.basename(".md").to_s,
          mtime: mtime
        )
      end
    end

    # Sort results by file modification time (newest first)
    results.sort_by { |r| -r[:mtime].to_i }
  end

  private

  # Write atomically: write to a temp file in the same directory, then rename it
  # over the target. A failed or partial write (e.g. ENOSPC / disk full) never
  # leaves the existing note truncated — the original stays intact until the
  # atomic rename succeeds. The temp file is on the same filesystem as the
  # target, so File.rename is atomic.
  def atomic_write(full_path, content)
    tmp = full_path.dirname.join(".#{full_path.basename}.#{SecureRandom.hex(6)}.tmp")
    begin
      tmp.write(content)
      # A fresh temp file gets a umask-derived mode (e.g. 0644). Renaming it over
      # an existing note would silently reset a mode the operator had changed, so
      # copy the existing note's permission bits onto the temp before the swap.
      File.chmod(full_path.stat.mode & 0o777, tmp.to_s) if full_path.exist?
      File.rename(tmp.to_s, full_path.to_s)
    rescue StandardError
      tmp.delete if tmp.exist?
      raise
    end
  end

  def atomic_create(full_path, content)
    tmp = full_path.dirname.join(".#{full_path.basename}.#{SecureRandom.hex(6)}.tmp")
    begin
      File.open(tmp.to_s, File::WRONLY | File::CREAT | File::EXCL, 0o666) do |file|
        file.write(content)
      end
      begin
        link_without_replacing(tmp, full_path)
      rescue Errno::EPERM, Errno::EOPNOTSUPP, Errno::ENOTSUP, Errno::EXDEV
        # Some filesystems prohibit hard links. The shared NOTES_PATH lock
        # keeps cooperating FrankMD instances from racing this atomic rename.
        rename_without_replacing(tmp, full_path)
      end
    ensure
      tmp.delete if tmp.exist?
    end
  end

  def link_without_replacing(source, destination)
    File.link(source.to_s, destination.to_s)
  rescue Errno::EEXIST
    raise AlreadyExistsError, "Destination already exists: #{destination.relative_path_from(@base_path)}"
  end

  def rename_without_replacing(source, destination)
    if path_exists?(destination)
      raise AlreadyExistsError, "Destination already exists: #{destination.relative_path_from(@base_path)}"
    end

    File.rename(source.to_s, destination.to_s)
  rescue Errno::EEXIST, Errno::ENOTEMPTY, Errno::EISDIR
    raise AlreadyExistsError, "Destination already exists: #{destination.relative_path_from(@base_path)}"
  end

  def path_exists?(path)
    path.exist? || path.symlink?
  end

  # Serialize filesystem mutations and tree reads across cooperating FrankMD
  # instances that share NOTES_PATH. The hidden lock file lives there so
  # instances with different Rails tmp directories still coordinate. If the
  # notes directory is read-only, tree reads fall back to a per-app tmp lock;
  # mutations against that directory will fail at their filesystem operation.
  # External sync tools and writers that ignore advisory locks do not coordinate.
  def with_filesystem_lock(mode = File::LOCK_EX)
    notes_root = @base_path.realpath.to_s
    lock = open_filesystem_lock(shared_filesystem_lock_path(notes_root), mode)
    lock ||= open_local_filesystem_lock(notes_root)
    with_locked_file(lock, mode) { yield }
  end

  def shared_filesystem_lock_path(notes_root)
    Pathname.new(notes_root).join(FILESYSTEM_LOCK_FILENAME)
  end

  def open_filesystem_lock(path, mode = File::LOCK_EX)
    flags = File::RDWR | File::CREAT
    flags |= File::NOFOLLOW if File.const_defined?(:NOFOLLOW)
    File.open(path, flags, 0o600)
  rescue Errno::EACCES, Errno::EROFS
    return nil unless mode == File::LOCK_SH

    flags = File::RDONLY
    flags |= File::NOFOLLOW if File.const_defined?(:NOFOLLOW)
    begin
      File.open(path, flags)
    rescue Errno::EACCES, Errno::EROFS, Errno::ENOENT
      nil
    end
  end

  def open_local_filesystem_lock(notes_root)
    lock_id = Digest::SHA256.hexdigest(notes_root)
    lock_dir = local_lock_root.join("frankmd_filesystem_locks", lock_id)
    FileUtils.mkdir_p(lock_dir, mode: 0o700)

    flags = File::RDWR | File::CREAT
    flags |= File::NOFOLLOW if File.const_defined?(:NOFOLLOW)
    File.open(lock_dir.join("notes.lock"), flags, 0o600)
  end

  def local_lock_root
    Rails.root.join("tmp")
  end

  def with_locked_file(lock, mode)
    locked = false
    begin
      lock.flock(mode)
      locked = true
      yield
    ensure
      begin
        lock.flock(File::LOCK_UN) if locked
      ensure
        lock.close
      end
    end
  end

  # Collect files sorted by modification time (for file finder/tree display)
  def collect_markdown_files(dir)
    files = []
    return files unless dir.directory?

    dir.children.reject(&:symlink?).sort_by { |p| -p.mtime.to_i }.each do |entry|
      next if entry.basename.to_s.start_with?(".")

      if entry.directory?
        files.concat(collect_markdown_files(entry))
      elsif entry.extname == ".md"
        files << entry
      end
    end

    files
  end

  # Collect files without sorting - faster for search (no mtime stat calls)
  # Uses block for early termination when max results reached
  def collect_markdown_files_unsorted(dir, &block)
    return unless dir.directory?

    dir.children.each do |entry|
      next if entry.symlink?
      next if entry.basename.to_s.start_with?(".")

      if entry.directory?
        collect_markdown_files_unsorted(entry, &block)
      elsif entry.extname == ".md"
        yield entry
      end
    end
  end

  def search_file(file_path, regex, context_lines, max_matches)
    return [] if file_path.size > MAX_SEARCH_FILE_BYTES

    matches = []
    # scrub replaces invalid UTF-8 bytes with the replacement character, so a
    # single Latin-1/binary .md file cannot raise "invalid byte sequence in
    # UTF-8" from line.match? and take down the entire content search.
    lines = file_path.readlines(chomp: true).map(&:scrub)

    lines.each_with_index do |line, index|
      next unless line.match?(regex)
      break if matches.size >= max_matches

      # Calculate context range
      start_line = [ 0, index - context_lines ].max
      end_line = [ lines.size - 1, index + context_lines ].min

      # Extract context with line numbers
      context = (start_line..end_line).map do |i|
        { line_number: i + 1, content: lines[i], is_match: i == index }
      end

      matches << {
        line_number: index + 1,
        match_text: line,
        context: context
      }
    end

    matches
  rescue SystemCallError, Regexp::TimeoutError
    # File vanished between listing and read (TOCTOU), or another I/O error —
    # skip this file rather than failing the whole search.
    []
  end

  def safe_path(path, must_exist: true)
    full_path = PathSafety.contain(@base_path, path)
    raise InvalidPathError, "Invalid path: #{path}" if full_path.nil?

    if must_exist && !full_path.exist?
      raise NotFoundError, "Path not found: #{path}"
    end

    full_path
  end

  def build_tree(dir, relative_base = @base_path)
    # Keep folders in stable alphabetical order so drag/drop updates inside a folder
    # do not reorder it in the Explorer due to mtime changes.
    # Skip broken symlinks (exist? follows links and returns false when the target is missing)
    # so a single dangling link does not take the whole tree down.
    entries = dir.children.reject(&:symlink?).select(&:exist?).sort_by do |p|
      if p.directory?
        [ 0, p.basename.to_s.downcase ]
      else
        [ 1, -p.mtime.to_i ]
      end
    end

    entries.filter_map do |entry|
      basename = entry.basename.to_s
      relative_path = entry.relative_path_from(relative_base).to_s

      # Skip hidden files.
      if basename.start_with?(".")
        next
      elsif entry.directory?
        {
          name: basename,
          path: relative_path,
          type: "folder",
          children: build_tree(entry, relative_base)
        }
      elsif entry.extname == ".md"
        {
          name: entry.basename(".md").to_s,
          path: relative_path,
          type: "file",
          file_type: "markdown",
          mtime: entry.mtime.to_i
        }
      end
    end
  end
end
