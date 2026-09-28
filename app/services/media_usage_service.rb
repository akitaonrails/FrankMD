# frozen_string_literal: true

require "cgi"
require "set"
require "uri"

# Builds a reverse index of local Library media references in Markdown notes.
class MediaUsageService
  MEDIA_ROOTS = %w[images videos].freeze
  MARKDOWN_DESTINATION = /(?<!\\)\[(?:\\.|[^\]\r\n])*\]\([ \t]*(?:<([^>\r\n]*)>|((?:\\.|[^)\s])+))/m
  HTML_SOURCE = /<(?:img|video|audio|source|track|embed|object)\b[^>]*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/im

  class ScanError < StandardError; end

  def initialize(base_path: nil)
    @base_path = Pathname.new(base_path || UploadStorage.notes_path).expand_path
  end

  # Returns a sorted { "images/photo.png" => ["notes/example.md"] } index.
  # Each Markdown note is read once. A read failure aborts the scan so callers
  # cannot mistake a partial index for a complete one.
  def build_index
    usage = Hash.new { |index, media_path| index[media_path] = Set.new }

    collect_markdown_files(@base_path) do |file_path|
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

  private

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
    markdown_references = source.scan(MARKDOWN_DESTINATION).map { |angle, bare| angle || bare }
    html_references = source.scan(HTML_SOURCE).map { |quoted, single_quoted, unquoted| quoted || single_quoted || unquoted }
    markdown_references + html_references
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

  def canonical_media_path(reference, note_path)
    path = CGI.unescapeHTML(reference.to_s.strip)
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
