# frozen_string_literal: true

require "test_helper"

class OmarchyThemeServiceTest < ActiveSupport::TestCase
  SYNTAX_ROLES = %w[
    keyword function type string number constant identifier property operator comment punctuation invalid
  ].freeze

  test "dark Omarchy palettes derive colors from ANSI and meet code contrast" do
    data = legacy_theme_data(alacritty_colors(background: "#141414", foreground: "#f0f0f0", low_contrast: "#202020"))

    assert data[:is_dark]
    assert_equal "#ff00ff", data[:variables]["--theme-syntax-keyword"]
    assert_syntax_contrast(data[:variables])
    refute_equal "#202020", data[:variables]["--theme-syntax-comment"]
  end

  test "light Omarchy palettes adjust low-contrast colors and meet code contrast" do
    data = legacy_theme_data(alacritty_colors(background: "#eeeeee", foreground: "#222222", low_contrast: "#dddddd"))

    refute data[:is_dark]
    assert_syntax_contrast(data[:variables])
    refute_equal "#dddddd", data[:variables]["--theme-syntax-comment"]
  end

  test "current Omarchy state colors take priority over the legacy palette" do
    File.stubs(:exist?).returns(false)
    File.stubs(:exist?).with(OmarchyThemeService::STATE_THEME_NAME_FILE).returns(true)
    File.stubs(:exist?).with(OmarchyThemeService::STATE_COLORS_FILE).returns(true)
    File.stubs(:exist?).with(OmarchyThemeService::LEGACY_THEME_NAME_FILE).returns(true)
    File.stubs(:exist?).with(OmarchyThemeService::LEGACY_ALACRITTY_FILE).returns(true)
    File.stubs(:read).with(OmarchyThemeService::STATE_THEME_NAME_FILE).returns("Tokyo Night\n")
    File.stubs(:read).with(OmarchyThemeService::STATE_COLORS_FILE).returns(flat_colors)
    File.expects(:read).with(OmarchyThemeService::LEGACY_THEME_NAME_FILE).never
    File.expects(:read).with(OmarchyThemeService::LEGACY_ALACRITTY_FILE).never

    data = OmarchyThemeService.theme_data

    assert_equal "Tokyo Night", data[:theme_name]
    assert data[:is_dark]
    assert_equal "#7aa2f7", data[:variables]["--theme-accent"]
    assert_equal "#292e42", data[:variables]["--theme-selection"]
    assert_syntax_contrast(data[:variables])
  end

  test "current flat color indexes map to ANSI roles" do
    colors = flat_colors + <<~TOML
      color4 = "#123456"
      color12 = "#abcdef"
    TOML

    data = current_theme_data(colors)

    assert_equal "#123456", data[:variables]["--theme-accent"]
    assert_equal "#abcdef", data[:variables]["--theme-accent-hover"]
    assert_syntax_contrast(data[:variables])
  end

  private

  def legacy_theme_data(alacritty)
    File.stubs(:exist?).returns(false)
    File.stubs(:exist?).with(OmarchyThemeService::LEGACY_THEME_NAME_FILE).returns(true)
    File.stubs(:exist?).with(OmarchyThemeService::LEGACY_ALACRITTY_FILE).returns(true)
    File.stubs(:read).with(OmarchyThemeService::LEGACY_THEME_NAME_FILE).returns("Test Theme\n")
    File.stubs(:read).with(OmarchyThemeService::LEGACY_ALACRITTY_FILE).returns(alacritty)

    OmarchyThemeService.theme_data
  end

  def current_theme_data(colors)
    File.stubs(:exist?).returns(false)
    File.stubs(:exist?).with(OmarchyThemeService::STATE_THEME_NAME_FILE).returns(true)
    File.stubs(:exist?).with(OmarchyThemeService::STATE_COLORS_FILE).returns(true)
    File.stubs(:read).with(OmarchyThemeService::STATE_THEME_NAME_FILE).returns("Test Theme\n")
    File.stubs(:read).with(OmarchyThemeService::STATE_COLORS_FILE).returns(colors)

    OmarchyThemeService.theme_data
  end

  def assert_syntax_contrast(variables)
    code_background = variables.fetch("--theme-code-bg")

    SYNTAX_ROLES.each do |role|
      foreground = variables.fetch("--theme-syntax-#{role}")
      assert_operator contrast_ratio(foreground, code_background), :>=, 4.5, "#{role} must meet 4.5:1 contrast"
    end
  end

  def contrast_ratio(first, second)
    first_luminance = relative_luminance(first)
    second_luminance = relative_luminance(second)
    lighter, darker = [ first_luminance, second_luminance ].max, [ first_luminance, second_luminance ].min

    (lighter + 0.05) / (darker + 0.05)
  end

  def relative_luminance(hex)
    red, green, blue = hex.delete_prefix("#").scan(/../).map do |channel|
      value = channel.to_i(16) / 255.0
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055)**2.4
    end

    0.2126 * red + 0.7152 * green + 0.0722 * blue
  end

  def alacritty_colors(background:, foreground:, low_contrast:)
    <<~TOML
      [colors.primary]
      background = "#{background}"
      foreground = "#{foreground}"
      dim_foreground = "#{low_contrast}"
      [colors.normal]
      black = "#{low_contrast}"
      red = "#ff5555"
      green = "#00ff00"
      yellow = "#ffff00"
      blue = "#0000ff"
      magenta = "#ff00ff"
      cyan = "#00ffff"
      white = "#ffffff"
      [colors.bright]
      blue = "#8080ff"
      cyan = "#80ffff"
      green = "#80ff80"
      yellow = "#ffff80"
    TOML
  end

  def flat_colors
    <<~TOML
      mode = "dark"
      accent = "#7aa2f7"
      selection = "#292e42"
      muted = "#414868"
      background = "#1a1b26"
      foreground = "#a9b1d6"
      red = "#f7768e"
      yellow = "#e0af68"
      green = "#9ece6a"
      cyan = "#449dab"
      blue = "#7aa2f7"
      magenta = "#ad8ee6"
      bright_blue = "#7da6ff"
    TOML
  end
end
