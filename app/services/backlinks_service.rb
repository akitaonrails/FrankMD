# frozen_string_literal: true

class BacklinksService
  def initialize(base_path: nil)
    @base_path = Pathname.new(base_path || ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
  end

  # Find all notes that link to the given target path.
  # Returns an array of hashes matching the search_content format:
  #   { path:, name:, line_number:, match_text:, context: }
  def find_backlinks(target_path, context_lines: 3)
    target_path = target_path.to_s
    target_name = File.basename(target_path, ".md")
    target_path_without_ext = target_path.delete_suffix(".md")

    patterns = build_patterns(target_name, target_path_without_ext)
    combined = Regexp.union(patterns)

    results = []
    collect_markdown_files(@base_path) do |file_path|
      relative_path = file_path.relative_path_from(@base_path).to_s

      # Skip the target file itself
      next if relative_path == target_path || relative_path == "#{target_path_without_ext}.md"

      file_matches = search_file(file_path, combined, context_lines)
      file_matches.each do |match|
        results << match.merge(
          path: relative_path,
          name: file_path.basename(".md").to_s
        )
      end
    end

    results
  end

  private

  def build_patterns(target_name, target_path_without_ext)
    escaped_name = Regexp.escape(target_name)
    escaped_path = Regexp.escape(target_path_without_ext)

    [
      # Wikilink by exact name: [[Note Name]] or [[Note Name.md]]
      /\[\[#{escaped_name}(\.md)?\]\]/i,
      # Wikilink by path: [[folder/Note Name]] or [[folder/Note Name.md]]
      /\[\[#{escaped_path}(\.md)?\]\]/i,
      # Standard markdown link by path: [text](folder/Note Name.md) or [text](folder/Note Name)
      /\[[^\]]*\]\([^)]*#{escaped_path}(\.md)?[^)]*\)/i
    ]
  end

  def collect_markdown_files(dir, &block)
    return unless dir.directory?

    dir.children.each do |entry|
      next if entry.basename.to_s.start_with?(".")

      if entry.directory?
        collect_markdown_files(entry, &block)
      elsif entry.extname == ".md"
        yield entry
      end
    end
  end

  def search_file(file_path, regex, context_lines)
    matches = []
    lines = file_path.readlines(chomp: true)

    lines.each_with_index do |line, index|
      next unless line.match?(regex)

      start_line = [ 0, index - context_lines ].max
      end_line = [ lines.size - 1, index + context_lines ].min

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
  end
end
