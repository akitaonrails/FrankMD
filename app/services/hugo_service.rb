# frozen_string_literal: true

class HugoService
  # Map of accented characters to ASCII equivalents
  ACCENT_MAP = {
    "à" => "a", "á" => "a", "â" => "a", "ã" => "a", "ä" => "a", "å" => "a", "æ" => "ae",
    "ç" => "c", "č" => "c", "ć" => "c",
    "è" => "e", "é" => "e", "ê" => "e", "ë" => "e", "ě" => "e",
    "ì" => "i", "í" => "i", "î" => "i", "ï" => "i",
    "ð" => "d", "ď" => "d",
    "ñ" => "n", "ň" => "n",
    "ò" => "o", "ó" => "o", "ô" => "o", "õ" => "o", "ö" => "o", "ø" => "o",
    "ù" => "u", "ú" => "u", "û" => "u", "ü" => "u", "ů" => "u",
    "ý" => "y", "ÿ" => "y",
    "ž" => "z", "ź" => "z", "ż" => "z",
    "ß" => "ss", "þ" => "th",
    "š" => "s", "ś" => "s",
    "ř" => "r",
    "ł" => "l"
  }.freeze

  # Optional per-install template file at the notes root. When present, its
  # contents replace the built-in frontmatter. Hidden (dot-prefixed) so it does
  # not show up in the notes tree. Supports {{title}}, {{slug}} and {{date}}.
  TEMPLATE_FILE = ".hugo_template.md"

  # Built-in frontmatter used when no custom template is present.
  # `tags: []` is a valid empty YAML list — a bare `-` produces a null list
  # entry that breaks Hugo's parser (see issue #69).
  DEFAULT_TEMPLATE = <<~FRONTMATTER
    ---
    title: "{{title}}"
    slug: "{{slug}}"
    date: {{date}}
    draft: true
    tags: []
    ---

  FRONTMATTER

  class << self
    # Generate URL-safe slug from text
    def slugify(text)
      text.downcase
          .chars
          .map { |c| ACCENT_MAP[c] || ACCENT_MAP[c.downcase] || c }
          .join
          .gsub(/[^a-z0-9]+/, "-")
          .gsub(/^-+|-+$/, "")
          .gsub(/-+/, "-")
    end

    # Generate Hugo blog post path and content
    # Returns { path: "...", content: "frontmatter..." }
    # path_style: "dated" = YYYY/MM/DD/slug/index.md, "flat" = slug.md
    def generate_blog_post(title, parent: nil, path_style: nil)
      path_style ||= Config.new.get("hugo_path_style") || "dated"
      now = Time.current
      slug = slugify(title)

      # Build path based on style
      relative_path = if path_style == "flat"
        "#{slug}.md"
      else
        date_path = now.strftime("%Y/%m/%d")
        "#{date_path}/#{slug}/index.md"
      end
      full_path = parent.present? ? "#{parent}/#{relative_path}" : relative_path

      # Generate ISO date with timezone offset
      iso_date = now.strftime("%Y-%m-%dT%H:%M:%S%:z")

      content = render_template(template_source, title: title, slug: slug, date: iso_date)

      { path: full_path, content: content }
    end

    # Read the per-install custom template if present, else the built-in default.
    def template_source(base_path: nil)
      file = notes_root(base_path).join(TEMPLATE_FILE)
      return file.read if file.file?

      DEFAULT_TEMPLATE
    rescue => e
      Rails.logger.warn("[Hugo] Could not read #{TEMPLATE_FILE}, using default: #{e.message}")
      DEFAULT_TEMPLATE
    end

    # Substitute {{title}}, {{slug}} and {{date}} placeholders. Uses the block
    # form of gsub so backslashes in the (quote-escaped) title are not treated
    # as replacement backreferences.
    def render_template(template, title:, slug:, date:)
      escaped_title = title.gsub('"', '\\"')
      template
        .gsub("{{title}}") { escaped_title }
        .gsub("{{slug}}") { slug }
        .gsub("{{date}}") { date }
    end

    # Update slug in frontmatter content
    # Returns updated content or nil if no changes needed
    def update_frontmatter_slug(content, new_slug)
      return nil unless content.start_with?("---")

      parts = content.split(/^---\s*$/, 3)
      return nil unless parts.length >= 3

      frontmatter = parts[1]
      body = parts[2]

      return nil unless frontmatter.include?("slug:")

      updated_frontmatter = frontmatter
        .gsub(/^slug:\s*"[^"]*"/, "slug: \"#{new_slug}\"")
        .gsub(/^slug:\s*'[^']*'/, "slug: \"#{new_slug}\"")
        .gsub(/^slug:\s*[^\s\n]+/, "slug: \"#{new_slug}\"")

      return nil if updated_frontmatter == frontmatter

      "---#{updated_frontmatter}---#{body}"
    end

    private

    # Notes root used to locate the optional custom template, mirroring how
    # Config resolves its base path.
    def notes_root(base_path = nil)
      Pathname.new(base_path || ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    end
  end
end
