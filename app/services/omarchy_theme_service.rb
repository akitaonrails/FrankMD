# frozen_string_literal: true

class OmarchyThemeService
  OMARCHY_DIR = File.expand_path("~/.config/omarchy/current")
  THEME_NAME_FILE = File.join(OMARCHY_DIR, "theme.name")
  ALACRITTY_FILE = File.join(OMARCHY_DIR, "theme", "alacritty.toml")

  class << self
    def available?
      File.exist?(THEME_NAME_FILE) && File.exist?(ALACRITTY_FILE)
    end

    def theme_data
      return nil unless available?

      name = File.read(THEME_NAME_FILE).strip
      colors = parse_alacritty(File.read(ALACRITTY_FILE))
      variables = map_variables(colors)

      {
        theme_name: name,
        variables: variables,
        is_dark: dark_background?(colors[:background])
      }
    rescue Errno::ENOENT, Errno::EACCES
      nil
    end

    private

    def parse_alacritty(content)
      colors = {}
      current_section = nil

      content.each_line do |line|
        line = line.strip

        if line.start_with?("[")
          match = line.match(/\A\[colors\.(\w+)\]\z/)
          current_section = match ? match[1] : nil
          next
        end

        next unless current_section

        if (match = line.match(/\A(\w+)\s*=\s*["']?(#[0-9a-fA-F]{6})["']?\s*\z/))
          key = match[1]
          hex = match[2]

          case current_section
          when "primary"
            colors[key.to_sym] = hex
          when "cursor"
            colors[:"cursor_#{key}"] = hex
          when "selection"
            colors[:"selection_#{key}"] = hex
          when "normal"
            colors[:"normal_#{key}"] = hex
          when "bright"
            colors[:"bright_#{key}"] = hex
          end
        end
      end

      colors
    end

    def map_variables(c)
      bg = c[:background] || "#121212"
      fg = c[:foreground] || "#d0d0d0"
      dim_fg = c[:dim_foreground]
      blue = c[:normal_blue] || "#7ea7c9"
      bright_blue = c[:bright_blue]
      bright_black = c[:normal_black] || "#555555"
      sel_bg = c[:selection_background]
      sel_text = c[:selection_text]
      dark = dark_background?(bg)
      code_bg = dark ? lighten(bg, 7) : darken(bg, 7)
      syntax_variables = {
        "--theme-syntax-keyword" => c[:normal_magenta] || c[:normal_red] || "#c792ea",
        "--theme-syntax-function" => c[:normal_yellow] || c[:bright_yellow] || "#ffd866",
        "--theme-syntax-type" => c[:normal_cyan] || c[:bright_cyan] || "#65d5cb",
        "--theme-syntax-string" => c[:normal_green] || c[:bright_green] || "#95d96a",
        "--theme-syntax-number" => c[:bright_yellow] || c[:normal_yellow] || "#ffad66",
        "--theme-syntax-constant" => c[:bright_cyan] || c[:normal_cyan] || "#79c0ff",
        "--theme-syntax-identifier" => fg,
        "--theme-syntax-property" => bright_blue || blue,
        "--theme-syntax-operator" => c[:normal_white] || fg,
        "--theme-syntax-comment" => dim_fg || c[:normal_black] || blend(fg, bg, 0.45),
        "--theme-syntax-punctuation" => c[:normal_white] || fg,
        "--theme-syntax-invalid" => c[:normal_red] || "#ff8787"
      }.transform_values { |color| ensure_contrast(color, code_bg) }

      {
        "--theme-bg-primary" => bg,
        "--theme-bg-secondary" => dark ? lighten(bg, 3) : darken(bg, 3),
        "--theme-bg-tertiary" => dark ? lighten(bg, 7) : darken(bg, 7),
        "--theme-bg-hover" => dark ? lighten(bg, 12) : darken(bg, 12),
        "--theme-text-primary" => fg,
        "--theme-text-secondary" => blend(fg, bg, 0.08),
        "--theme-text-muted" => dim_fg || blend(fg, bg, 0.45),
        "--theme-text-faint" => blend(fg, bg, 0.65),
        "--theme-border" => dark ? lighten(bg, 12) : darken(bg, 12),
        "--theme-accent" => blue,
        "--theme-accent-hover" => bright_blue || lighten(blue, 15),
        "--theme-accent-text" => bg,
        "--theme-selection" => sel_bg || blend(fg, bg, 0.25),
        "--theme-selection-text" => sel_text || fg,
        "--theme-scrollbar" => bright_black,
        "--theme-scrollbar-hover" => lighten(bright_black, 10),
        "--theme-success" => c[:normal_green] || "#8673d4",
        "--theme-warning" => c[:normal_yellow] || "#ca2edc",
        "--theme-error" => c[:normal_red] || "#ff4da6",
        "--theme-code-bg" => code_bg,
        "--theme-heading-1" => c[:normal_magenta] || "#b683c3",
        "--theme-heading-2" => blue,
        "--theme-heading-3" => c[:normal_cyan] || "#8adb8a",
        "--theme-folder-icon" => blue,
        "--theme-file-icon" => dim_fg || blend(fg, bg, 0.45),
        "--theme-config-icon" => c[:normal_yellow] || "#ca2edc"
      }.merge(syntax_variables)
    end

    def hex_to_rgb(hex)
      hex = hex.delete_prefix("#")
      [ hex[0..1], hex[2..3], hex[4..5] ].map { |c| c.to_i(16) }
    end

    def rgb_to_hex(r, g, b)
      "#%02x%02x%02x" % [ r.clamp(0, 255).round, g.clamp(0, 255).round, b.clamp(0, 255).round ]
    end

    def dark_background?(hex)
      return true if hex.nil?

      r, g, b = hex_to_rgb(hex)
      luminance = 0.2126 * (r / 255.0) + 0.7152 * (g / 255.0) + 0.0722 * (b / 255.0)
      luminance < 0.5
    end

    def ensure_contrast(foreground, background)
      return foreground if contrast_ratio(foreground, background) >= 4.51

      target = contrast_ratio("#ffffff", background) > contrast_ratio("#000000", background) ? "#ffffff" : "#000000"
      low = 0.0
      high = 1.0

      24.times do
        amount = (low + high) / 2.0
        candidate = blend(foreground, target, amount)

        if contrast_ratio(candidate, background) >= 4.51
          high = amount
        else
          low = amount
        end
      end

      blend(foreground, target, high)
    end

    def contrast_ratio(foreground, background)
      foreground_luminance = relative_luminance(foreground)
      background_luminance = relative_luminance(background)
      lighter, darker = [ foreground_luminance, background_luminance ].max, [ foreground_luminance, background_luminance ].min

      (lighter + 0.05) / (darker + 0.05)
    end

    def relative_luminance(hex)
      red, green, blue = hex_to_rgb(hex).map do |channel|
        value = channel / 255.0
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055)**2.4
      end

      0.2126 * red + 0.7152 * green + 0.0722 * blue
    end

    def lighten(hex, percent)
      r, g, b = hex_to_rgb(hex)
      amount = (255 * percent / 100.0)
      rgb_to_hex(r + amount, g + amount, b + amount)
    end

    def darken(hex, percent)
      r, g, b = hex_to_rgb(hex)
      amount = (255 * percent / 100.0)
      rgb_to_hex(r - amount, g - amount, b - amount)
    end

    # Blend foreground toward background by the given factor (0 = pure fg, 1 = pure bg)
    def blend(fg_hex, bg_hex, factor)
      fr, fg, fb = hex_to_rgb(fg_hex)
      br, bg_val, bb = hex_to_rgb(bg_hex)
      rgb_to_hex(
        fr + (br - fr) * factor,
        fg + (bg_val - fg) * factor,
        fb + (bb - fb) * factor
      )
    end
  end
end
