# frozen_string_literal: true

class NotesService
  class NotFoundError < StandardError; end
  class InvalidPathError < StandardError; end

  def initialize(base_path: nil)
    @base_path = Pathname.new(base_path || ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    FileUtils.mkdir_p(@base_path) unless @base_path.exist?
  end

  def list_tree
    build_tree(@base_path)
  end

  def read(path)
    full_path = safe_path(path)
    raise NotFoundError, "Note not found: #{path}" unless full_path.file?

    full_path.read
  end

  def write(path, content)
    full_path = safe_path(path, must_exist: false)
    FileUtils.mkdir_p(full_path.dirname)
    atomic_write(full_path, content)
    true
  end

  def delete(path)
    full_path = safe_path(path)
    raise NotFoundError, "Note not found: #{path}" unless full_path.file?

    full_path.delete
    true
  end

  def rename(old_path, new_path)
    old_full = safe_path(old_path)
    new_full = safe_path(new_path, must_exist: false)

    raise NotFoundError, "Note not found: #{old_path}" unless old_full.exist?

    FileUtils.mkdir_p(new_full.dirname)
    FileUtils.mv(old_full, new_full)
    true
  end

  def create_folder(path)
    full_path = safe_path(path, must_exist: false)
    FileUtils.mkdir_p(full_path)
    true
  end

  def delete_folder(path)
    full_path = safe_path(path)
    raise NotFoundError, "Folder not found: #{path}" unless full_path.directory?

    if full_path.children.any?
      raise InvalidPathError, "Folder not empty: #{path}"
    end

    full_path.rmdir
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

    # Try to compile as regex, fall back to escaped literal
    regex = begin
      Regexp.new(query, Regexp::IGNORECASE)
    rescue RegexpError
      Regexp.new(Regexp.escape(query), Regexp::IGNORECASE)
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

  # Collect files sorted by modification time (for file finder/tree display)
  def collect_markdown_files(dir)
    files = []
    return files unless dir.directory?

    dir.children.sort_by { |p| -p.mtime.to_i }.each do |entry|
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
      next if entry.basename.to_s.start_with?(".")

      if entry.directory?
        collect_markdown_files_unsorted(entry, &block)
      elsif entry.extname == ".md"
        yield entry
      end
    end
  end

  def search_file(file_path, regex, context_lines, max_matches)
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
  rescue SystemCallError
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

  # Special files that are shown even though they start with a dot
  VISIBLE_DOTFILES = %w[.fed].freeze

  def build_tree(dir, relative_base = @base_path)
    # Keep folders in stable alphabetical order so drag/drop updates inside a folder
    # do not reorder it in the Explorer due to mtime changes.
    # Skip broken symlinks (exist? follows links and returns false when the target is missing)
    # so a single dangling link does not take the whole tree down.
    entries = dir.children.select(&:exist?).sort_by do |p|
      if p.directory?
        [ 0, p.basename.to_s.downcase ]
      else
        [ 1, -p.mtime.to_i ]
      end
    end

    entries.filter_map do |entry|
      basename = entry.basename.to_s
      relative_path = entry.relative_path_from(relative_base).to_s

      # Skip hidden files except for special ones
      if basename.start_with?(".")
        # Allow specific dotfiles at the root level
        next unless dir == @base_path && VISIBLE_DOTFILES.include?(basename)

        # Show .fed as a config file
        {
          name: basename,
          path: relative_path,
          type: "file",
          file_type: "config",
          mtime: entry.mtime.to_i
        }
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
