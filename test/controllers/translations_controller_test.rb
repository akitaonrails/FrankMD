# frozen_string_literal: true

require "test_helper"

class TranslationsControllerTest < ActionDispatch::IntegrationTest
  def setup
    setup_test_notes_dir
    @original_locale_env = ENV["FRANKMD_LOCALE"]
  end

  def teardown
    teardown_test_notes_dir
    # Reset locale and ENV to English after each test
    ENV["FRANKMD_LOCALE"] = @original_locale_env
    I18n.locale = :en
  end

  # === Basic Translation Endpoint ===

  test "show returns translations for default locale (en)" do
    get translations_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "en", data["locale"]
    assert data.key?("translations")

    translations = data["translations"]
    # Verify structure
    assert translations.key?("common")
    assert translations.key?("dialogs")
    assert translations.key?("status")
    assert translations.key?("errors")
    assert translations.key?("success")
    assert translations.key?("editor")
    assert translations.key?("sidebar")
  end

  test "show returns correct English translations" do
    get translations_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    translations = data["translations"]

    assert_equal "Cancel", translations["common"]["cancel"]
    assert_equal "Save", translations["common"]["save"]
    assert_equal "Saved", translations["status"]["saved"]
    assert_equal "Note not found", translations["errors"]["note_not_found"]
  end

  # === Locale Switching via ENV ===

  test "show returns Portuguese translations when ENV locale is pt-BR" do
    ENV["FRANKMD_LOCALE"] = "pt-BR"

    get translations_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "pt-BR", data["locale"]

    translations = data["translations"]
    assert_equal "Cancelar", translations["common"]["cancel"]
    assert_equal "Salvar", translations["common"]["save"]
    assert_equal "Salvo", translations["status"]["saved"]
  end

  test "show returns Spanish translations when ENV locale is es" do
    ENV["FRANKMD_LOCALE"] = "es"

    get translations_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "es", data["locale"]

    translations = data["translations"]
    assert_equal "Cancelar", translations["common"]["cancel"]
    assert_equal "Guardar", translations["common"]["save"]
    assert_equal "Guardado", translations["status"]["saved"]
  end

  test "show returns Japanese translations when ENV locale is ja" do
    ENV["FRANKMD_LOCALE"] = "ja"

    get translations_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "ja", data["locale"]

    translations = data["translations"]
    assert_equal "キャンセル", translations["common"]["cancel"]
    assert_equal "保存", translations["common"]["save"]
    assert_equal "保存済み", translations["status"]["saved"]
  end

  # === Locale Configuration via Config File ===

  test "locale can be set via config file when ENV not set" do
    ENV.delete("FRANKMD_LOCALE")
    @test_notes_dir.join(".fed").write("locale = es\n")

    get translations_url, as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "es", data["locale"]
  end

  test "locale can be saved via config endpoint" do
    ENV.delete("FRANKMD_LOCALE")

    patch config_url, params: { locale: "ja" }, as: :json
    assert_response :success

    # Verify it's saved to the config file
    content = @test_notes_dir.join(".fed").read
    assert_includes content, "locale = ja"

    get translations_url, as: :json
    data = JSON.parse(response.body)
    assert_equal "ja", data["locale"]
  end

  test "locale persists across requests after config save" do
    ENV.delete("FRANKMD_LOCALE")

    patch config_url, params: { locale: "pt-BR" }, as: :json
    assert_response :success

    # Verify it's saved to the config file
    content = @test_notes_dir.join(".fed").read
    assert_includes content, "locale = pt-BR"

    # Make multiple requests to verify persistence
    get translations_url, as: :json
    data = JSON.parse(response.body)
    assert_equal "pt-BR", data["locale"]

    get translations_url, as: :json
    data = JSON.parse(response.body)
    assert_equal "pt-BR", data["locale"]
  end

  # === All Locales Have Required Keys ===

  test "all locales have complete common translations" do
    required_keys = %w[cancel apply save create delete rename close search insert edit ok]

    %w[en pt-BR pt-PT es he ja ko].each do |locale|
      ENV["FRANKMD_LOCALE"] = locale
      get translations_url, as: :json
      data = JSON.parse(response.body)

      required_keys.each do |key|
        assert data["translations"]["common"].key?(key),
               "Locale #{locale} is missing common.#{key}"
        assert_not_empty data["translations"]["common"][key],
                        "Locale #{locale} has empty common.#{key}"
      end
    end
  end

  test "all locales have complete status translations" do
    required_keys = %w[saved unsaved error_saving error_loading searching no_matches]

    %w[en pt-BR pt-PT es he ja ko].each do |locale|
      ENV["FRANKMD_LOCALE"] = locale
      get translations_url, as: :json
      data = JSON.parse(response.body)

      required_keys.each do |key|
        assert data["translations"]["status"].key?(key),
               "Locale #{locale} is missing status.#{key}"
        assert_not_empty data["translations"]["status"][key],
                        "Locale #{locale} has empty status.#{key}"
      end
    end
  end

  test "all locales have complete error translations" do
    required_keys = %w[note_not_found folder_not_found file_not_found]

    %w[en pt-BR pt-PT es he ja ko].each do |locale|
      ENV["FRANKMD_LOCALE"] = locale
      get translations_url, as: :json
      data = JSON.parse(response.body)

      required_keys.each do |key|
        assert data["translations"]["errors"].key?(key),
               "Locale #{locale} is missing errors.#{key}"
        assert_not_empty data["translations"]["errors"][key],
                        "Locale #{locale} has empty errors.#{key}"
      end
    end
  end

  test "all supported locales have translations for issue 187 dialog copy" do
    required_paths = %w[
      dialogs.log_viewer.title_logs
      dialogs.log_viewer.title_config
      dialogs.log_viewer.refresh
      dialogs.log_viewer.close
      dialogs.log_viewer.logs
      dialogs.log_viewer.config
      dialogs.log_viewer.loading
      dialogs.log_viewer.empty_logs
      dialogs.log_viewer.line_count_one
      dialogs.log_viewer.line_count
      dialogs.log_viewer.error_loading_logs
      dialogs.log_viewer.no_config_file
      dialogs.log_viewer.key_count_one
      dialogs.log_viewer.key_count
      dialogs.log_viewer.error_loading_config
      dialogs.log_viewer.config_file_label
      dialogs.log_viewer.file_exists_label
      dialogs.log_viewer.ai_configured_label
      dialogs.log_viewer.yes
      dialogs.log_viewer.no
      dialogs.log_viewer.ai_configured_yes
      dialogs.log_viewer.ai_configured_no
      dialogs.log_viewer.key
      dialogs.log_viewer.value
      dialogs.log_viewer.source
      dialogs.log_viewer.env_var
      dialogs.log_viewer.source_default
      dialogs.log_viewer.null_value
      dialogs.log_viewer.empty_config
      dialogs.file_finder.preview_error
      dialogs.image_picker.processing_image
      dialogs.image_picker.search_keywords_required
      dialogs.image_picker.search_failed
      dialogs.image_picker.search_result_one
      dialogs.image_picker.search_result_many
      dialogs.image_picker.no_images_found
      dialogs.image_picker.no_images_in_folder
      dialogs.image_picker.folder_showing_recent
      dialogs.image_picker.folder_images_found_one
      dialogs.image_picker.folder_images_found_many
      dialogs.image_picker.folder_api_not_supported
      dialogs.image_picker.folder_access_failed
      dialogs.image_picker.folder_read_failed
      dialogs.image_picker.image_load_failed
      dialogs.image_picker.image_delete_failed
      dialogs.image_picker.image_upload_failed
      dialogs.image_picker.ai_prompt_required
      dialogs.image_picker.ai_not_configured
      dialogs.image_picker.ai_generation_failed
      dialogs.image_picker.ai_no_generated_data
      dialogs.image_picker.ai_save_failed
      dialogs.image_picker.no_file_extension
      dialogs.ai_diff.get_key_from
      dialogs.text_format.bold
      dialogs.text_format.italic
      dialogs.text_format.strikethrough
      dialogs.text_format.highlight
      dialogs.text_format.subscript
      dialogs.text_format.superscript
      dialogs.text_format.link
      dialogs.video.url_hint_youtube
      dialogs.video.url_hint_file
    ]

    %w[en pt-BR pt-PT es he ja ko].each do |locale|
      ENV["FRANKMD_LOCALE"] = locale
      get translations_url, as: :json
      translations = JSON.parse(response.body)["translations"]

      required_paths.each do |path|
        value = translations.dig(*path.split("."))
        assert value.is_a?(String) && !value.empty?, "Locale #{locale} is missing #{path}"
      end

      youtube_hint = translations.dig("dialogs", "video", "url_hint_youtube")
      file_hint = translations.dig("dialogs", "video", "url_hint_file")
      assert_match(/\Ahttps?:\/\//, youtube_hint, "Locale #{locale} should start the YouTube hint with its URL example")
      assert_match(/\A\//, file_hint, "Locale #{locale} should start the video file hint with its path example")
    end
  end

  # === Invalid Locale Handling ===

  test "invalid locale falls back to default" do
    ENV["FRANKMD_LOCALE"] = "invalid_locale"

    get translations_url, as: :json
    data = JSON.parse(response.body)

    # Should fall back to English
    assert_equal "en", data["locale"]
  end

  # === Priority: .fed file > ENV > default ===

  test "config file takes precedence over ENV variable" do
    # Set locale in config file
    @test_notes_dir.join(".fed").write("locale = ja\n")

    # Set ENV to a different locale
    ENV["FRANKMD_LOCALE"] = "es"

    get translations_url, as: :json
    data = JSON.parse(response.body)

    # Should use config file value (ja), not ENV value (es)
    # User's explicit choice in .fed overrides deployment default in ENV
    assert_equal "ja", data["locale"]
  end

  test "ENV variable is used as fallback when config file has no locale" do
    # No locale in .fed file
    @test_notes_dir.join(".fed").write("theme = gruvbox\n")

    ENV["FRANKMD_LOCALE"] = "es"

    get translations_url, as: :json
    data = JSON.parse(response.body)

    # Should use ENV value since .fed has no locale
    assert_equal "es", data["locale"]
  end

  test "empty ENV FRANKMD_LOCALE does not override config file locale" do
    # This was the production bug: docker-compose sets FRANKMD_LOCALE=""
    # Empty string is truthy in Ruby || chains but not a valid locale
    @test_notes_dir.join(".fed").write("locale = pt-BR\n")

    ENV["FRANKMD_LOCALE"] = ""

    get translations_url, as: :json
    data = JSON.parse(response.body)

    # Should use config file value, not get stuck on empty ENV string
    assert_equal "pt-BR", data["locale"]
  end

  # === Locale Picker Updates Config ===

  test "updating locale via config endpoint updates config file" do
    ENV.delete("FRANKMD_LOCALE")

    # First set to English
    patch config_url, params: { locale: "en" }, as: :json
    assert_response :success

    # Then change to Japanese
    patch config_url, params: { locale: "ja" }, as: :json
    assert_response :success

    content = @test_notes_dir.join(".fed").read
    assert_includes content, "locale = ja"
    refute_includes content, "locale = en"
  end

  # === Translations Include All Required Sections ===

  test "translations include all sections needed by JavaScript" do
    expected_sections = %w[common dialogs status errors success editor sidebar preview context_menu]

    get translations_url, as: :json
    data = JSON.parse(response.body)

    expected_sections.each do |section|
      assert data["translations"].key?(section),
             "Missing translation section: #{section}"
    end
  end
end
