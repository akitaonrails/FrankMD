# frozen_string_literal: true

require "cgi"
require "set"
require "uri"

# Builds a reverse index of local Library media references in Markdown notes.
class MediaUsageService
  MEDIA_ROOTS = %w[images videos].freeze
  CACHE_LOCK = Mutex.new
  INDEX_CACHE = {}
  MAX_CACHED_ROOTS = 8
  MARKDOWN_DESTINATION = /(?<!\\)\[(?:\\.|[^\]\r\n])*\]\([ \t]*(?:<([^>\r\n]*)>|((?:\\.|[^)\s])+))/m
  REFERENCE_DEFINITION = /\A {0,3}\[([^\]\r\n]+)\]:[ \t]*(?:<([^>\r\n]*)>|([^\s]+))/
  REFERENCE_USE = /(?<!\\)!\[((?:\\.|[^\]\r\n])*)\](?:\[([^\]\r\n]*)\])?|(?<![\\!])\[((?:\\.|[^\]\r\n])*)\](?:\[([^\]\r\n]*)\])?/
  HTML_SOURCE = /<(?:img|video|audio|source|track|embed|object)\b[^>]*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/im

  class ScanError < StandardError; end

  def initialize(base_path: nil)
    @base_path = Pathname.new(base_path || UploadStorage.notes_path).expand_path
  end

  # Returns a sorted { "images/photo.png" => ["notes/example.md"] } index.
  # Each Markdown note is read once when its filesystem signature changes. A
  # read failure aborts the scan so callers cannot mistake a partial index for
  # a complete one.
  def build_index
    files = markdown_files
    fingerprint = files.map do |file_path|
      stat = file_path.stat
      [ file_path.relative_path_from(@base_path).to_s, stat.dev, stat.ino, stat.size, stat.mtime.to_r, stat.ctime.to_r ]
    end

    self.class.cached_index(@base_path.to_s, fingerprint) do
      build_index_from(files)
    end
  rescue SystemCallError, IOError => error
    raise ScanError, "Could not inspect Markdown notes: #{error.message}", cause: error
  end

  def self.cached_index(root, fingerprint)
    CACHE_LOCK.synchronize do
      cached = INDEX_CACHE[root]
      return cached[:index] if cached && cached[:fingerprint] == fingerprint

      index = yield
      index.each do |media_path, note_paths|
        media_path.freeze
        note_paths.freeze
      end
      index.freeze
      INDEX_CACHE[root] = { fingerprint: fingerprint, index: index }
      INDEX_CACHE.shift while INDEX_CACHE.size > MAX_CACHED_ROOTS
      index
    end
  end

  private

  def build_index_from(files)
    usage = Hash.new { |index, media_path| index[media_path] = Set.new }

    files.each do |file_path|
      note_path = file_path.relative_path_from(@base_path).to_s
      begin
        content = file_path.read.force_encoding(Encoding::UTF_8).scrub
      rescue SystemCallError, IOError => error
        raise ScanError, "Could not read Markdown note #{note_path}: #{error.message}", cause: error
      end

      references_in(content).each do |reference|
        media_path = canonical_media_path(reference, note_path)
        usage[media_path].add(note_path) if media_path
      end
    end

    usage.keys.sort.each_with_object({}) do |media_path, result|
      result[media_path] = usage.fetch(media_path).to_a.sort
    end
  end

  def markdown_files
    files = []
    collect_markdown_files(@base_path) { |file_path| files << file_path }
    files
  end

  def collect_markdown_files(directory, &block)
    return unless directory.directory?

    directory.children.sort_by(&:to_s).each do |entry|
      next if entry.basename.to_s.start_with?(".") || entry.symlink?

      if entry.directory?
        collect_markdown_files(entry, &block)
      elsif entry.file? && entry.extname == ".md"
        yield entry
      end
    end
  end

  def references_in(content)
    source = markdown_without_code(content)
    definitions, source = extract_reference_definitions(source)
    markdown_references = source.scan(MARKDOWN_DESTINATION).map { |angle, bare| angle || bare }
    reference_references = reference_destinations(source, definitions)
    html_references = source.scan(HTML_SOURCE).map { |quoted, single_quoted, unquoted| quoted || single_quoted || unquoted }
    markdown_references + reference_references + html_references
  end

  def extract_reference_definitions(content)
    definitions = {}
    content_without_definitions = content.lines.map do |line|
      match = line.match(REFERENCE_DEFINITION)
      unless match
        next line
      end

      label = normalize_reference_label(match[1])
      definitions[label] ||= match[2] || match[3]
      mask_line(line)
    end.join

    [ definitions, content_without_definitions ]
  end

  def reference_destinations(content, definitions)
    destinations = []
    cursor = 0

    while (match = REFERENCE_USE.match(content, cursor))
      cursor = match.begin(0) + 1
      first_label = match[1] || match[3]
      second_label = match[2] || match[4]

      if second_label.nil?
        following_text = content[match.end(0)..]
        next if following_text&.match?(/\A[ \t]*\(/)
      end

      label = second_label.nil? || second_label.empty? ? first_label : second_label
      destinations << definitions[normalize_reference_label(label)]
    end

    destinations.compact
  end

  # Remove fenced code blocks, inline code, and HTML comments before scanning
  # destinations so examples do not count as media use.
  def markdown_without_code(content)
    fence = nil
    without_fences = content.lines.map do |line|
      marker = line.match(/\A {0,3}(\x60{3,}|~{3,})/)&.captures&.first

      if fence
        closing = line.match(/\A {0,3}(\x60+|~+)[ \t]*(?:\r?\n)?\z/)&.captures&.first
        fence = nil if closing && closing[0] == fence[0] && closing.length >= fence.length
        mask_line(line)
      elsif marker
        fence = marker
        mask_line(line)
      else
        line
      end
    end.join

    without_fences
      .gsub(/<!--[\s\S]*?-->/) { |comment| mask_line(comment) }
      .gsub(/(?<!\\)(\x60+).*?\1/m) { |code| code.gsub(/[^\r\n]/, " ") }
  end

  def mask_line(line)
    line.gsub(/[^\r\n]/, " ")
  end

  def normalize_reference_label(label)
    CGI.unescapeHTML(label.to_s)
      .gsub(/\\([[:punct:]])/) { Regexp.last_match(1) }
      .strip
      .gsub(/[[:space:]]+/, " ")
      .downcase
  end

  def canonical_media_path(reference, note_path)
    path = CGI.unescapeHTML(reference.to_s.strip)
    path = path.gsub(/\\([[:punct:]])/) { Regexp.last_match(1) }
    return nil if path.empty? || path.match?(%r{\A(?:[a-z][a-z0-9+.-]*:|//)}i)

    path = path.split(/[?#]/, 2).first.to_s
    absolute = path.start_with?("/")
    raw_segments = path.split("/")
    raw_segments.shift if absolute
    raw_segments.shift if absolute && raw_segments.first == "notes"

    segments = if absolute
      []
    else
      File.dirname(note_path).then { |directory| directory == "." ? [] : directory.split("/") }
    end

    raw_segments.each do |raw_segment|
      return nil if raw_segment.empty?

      segment = URI::DEFAULT_PARSER.unescape(raw_segment)
      return nil if segment.include?("/") || segment.include?("\\")

      case segment
      when ".", ""
        next
      when ".."
        return nil if segments.empty?
        segments.pop
      else
        segments << segment
      end
    end

    return nil unless MEDIA_ROOTS.include?(segments.first) && segments.length > 1

    segments.join("/")
  rescue ArgumentError, EncodingError
    nil
  end
end
