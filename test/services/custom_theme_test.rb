# frozen_string_literal: true

require "test_helper"

class CustomThemeTest < ActiveSupport::TestCase
  setup do
    @theme = { "version" => 1, "name" => " My colors ", "base" => "nord", "colors" => { "accent" => "#AABBCC" } }
  end

  test "normalizes a bounded palette with builtin base and no executable CSS" do
    result = CustomTheme.parse(JSON.generate(@theme))
    assert_equal "My colors", result["name"]
    assert_equal "#aabbcc", result["colors"]["accent"]
    assert_equal "nord", result["base"]
    assert_nil CustomTheme.parse("null")
  end

  test "catalog and color allowlist match shipped theme files" do
    themes = Rails.root.join("app/assets/tailwind/themes").children.map { |file| file.basename(".css").to_s }
    assert_equal themes.sort, CustomTheme::BASE_THEMES.sort
    keys = Rails.root.join("app/assets/tailwind/themes/dark.css").read.scan(/--theme-([a-z0-9-]+):/).flatten
    assert_equal keys.sort, CustomTheme::COLOR_KEYS.sort
  end

  test "rejects unsafe colors keys names versions and oversized values" do
    [ "red", "#123", "url(https://example.com)", "#aabbcc;display:none", "var(--secret)" ].each do |value|
      assert_raises(ArgumentError) { CustomTheme.parse(@theme.merge("colors" => { "accent" => value })) }
    end
    [ { "colors" => { "font-family" => "#aabbcc" } }, { "base" => "omarchy" }, { "version" => 2 },
      { "name" => "" }, { "name" => "a" * 61 }, { "name" => "bad\nname" }, { "css" => "body{}" } ].each do |changes|
      assert_raises(ArgumentError) { CustomTheme.parse(@theme.merge(changes)) }
    end
    assert_raises(ArgumentError) { CustomTheme.parse(" " * (CustomTheme::MAX_BYTES + 1)) }
  end
end
