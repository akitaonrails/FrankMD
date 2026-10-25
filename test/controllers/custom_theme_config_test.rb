# frozen_string_literal: true

require "test_helper"

class CustomThemeConfigTest < ActionDispatch::IntegrationTest
  setup do
    setup_test_notes_dir
    @theme = { version: 1, name: 'My "theme"', base: "dark", colors: { accent: "#AABBCC" } }
  end
  teardown { teardown_test_notes_dir }

  test "saves palette and selection atomically and roundtrips through config" do
    patch config_url, params: { theme: "custom", custom_theme: JSON.generate(@theme) }, as: :json
    assert_response :success
    assert_equal "custom", response.parsed_body.dig("settings", "theme")
    assert_equal "#aabbcc", response.parsed_body.dig("settings", "custom_theme", "colors", "accent")
    assert_equal 'My "theme"', Config.new.get("custom_theme")["name"]
    get config_url, as: :json
    assert_equal "dark", response.parsed_body.dig("settings", "custom_theme", "base")
    get root_url
    assert_select '[data-controller="theme"][data-theme-custom-value]'
    assert_select "dialog.custom-theme-editor"
  end

  test "invalid palette cannot partially change the selected theme" do
    Config.new.set("theme", "nord")
    @theme[:colors] = { accent: "url(https://example.com)" }
    patch config_url, params: { theme: "custom", custom_theme: JSON.generate(@theme) }, as: :json
    assert_response :unprocessable_entity
    assert_equal "nord", Config.new.get("theme")
    assert_nil Config.new.get("custom_theme")
  end

  test "malformed on-disk palette does not discard other settings" do
    @test_notes_dir.join(".fed").write("theme = nord\ncustom_theme = {broken\neditor_font_size = 18\n")
    config = Config.new
    assert_equal "nord", config.get("theme")
    assert_equal 18, config.get("editor_font_size")
    assert_nil config.get("custom_theme")
    refute config.set("editor_font", 'unsafe"font')
  end
end
