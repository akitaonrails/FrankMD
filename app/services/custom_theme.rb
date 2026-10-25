# frozen_string_literal: true

class CustomTheme
  VERSION = 1
  MAX_BYTES = 16 * 1024
  BASE_THEMES = %w[light dark catppuccin catppuccin-latte ethereal everforest flexoki-light gruvbox hackerman kanagawa matte-black nord osaka-jade ristretto rose-pine solarized-dark solarized-light tokyo-night].freeze
  COLOR_KEYS = %w[
    bg-primary bg-secondary bg-tertiary bg-hover text-primary text-secondary
    text-muted text-faint border accent accent-hover accent-text selection
    selection-text scrollbar scrollbar-hover success warning error code-bg
    heading-1 heading-2 heading-3 folder-icon file-icon config-icon
    syntax-keyword syntax-function syntax-type syntax-string syntax-number
    syntax-constant syntax-identifier syntax-property syntax-operator
    syntax-comment syntax-punctuation syntax-invalid
  ].freeze
  BASIC_COLORS = %w[accent bg-primary text-primary].freeze

  def self.parse(raw)
    raise ArgumentError, "Theme is too large" if raw.is_a?(String) && raw.bytesize > MAX_BYTES

    value = raw.is_a?(String) ? JSON.parse(raw) : raw
    return nil if value.nil?
    unless value.is_a?(Hash) && (value.keys - %w[version name base colors]).empty? && value["version"] == VERSION
      raise ArgumentError, "Invalid theme format"
    end

    name = value["name"]
    unless name.is_a?(String) && name.strip.length.between?(1, 60) && !name.match?(/[[:cntrl:]]/)
      raise ArgumentError, "Invalid theme name"
    end
    raise ArgumentError, "Invalid base theme" unless BASE_THEMES.include?(value["base"])

    colors = value["colors"]
    unless colors.is_a?(Hash) && (colors.keys - COLOR_KEYS).empty? &&
           colors.values.all? { |color| color.is_a?(String) && color.match?(/\A#[0-9a-fA-F]{6}\z/) }
      raise ArgumentError, "Invalid theme colors"
    end

    { "version" => VERSION, "name" => name.strip, "base" => value["base"], "colors" => colors.transform_values(&:downcase) }
  end
end
