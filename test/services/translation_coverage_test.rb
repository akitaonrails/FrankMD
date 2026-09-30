# frozen_string_literal: true

require "test_helper"
require "yaml"

class TranslationCoverageTest < ActiveSupport::TestCase
  # Derived from the app's configured locales so a newly added locale is
  # automatically held to full coverage instead of silently escaping it.
  LOCALES = (Rails.application.config.i18n.available_locales.map(&:to_s) - %w[en]).sort.freeze

  test "all supported locales cover every English translation leaf" do
    english = load_translations("en")
    translations = LOCALES.to_h { |locale| [ locale, load_translations(locale) ] }
    failures = translation_failures(english, translations)

    details = failures.map { |failure| "  - #{failure}" }.join("\n")
    assert_empty failures, "Missing or invalid locale translations:\n#{details}"
  end

  test "reports every nested missing, blank, and non-string translation" do
    english = {
      "dialogs" => { "help" => { "find" => "Find" } },
      "errors" => { "required" => "Required" }
    }
    translations = {
      "pt-BR" => {
        "dialogs" => { "help" => {} },
        "errors" => { "required" => "   " }
      },
      "ja" => {
        "dialogs" => { "help" => { "find" => false } },
        "errors" => { "required" => "必須" }
      }
    }

    assert_equal [
      "pt-BR: missing key dialogs.help.find",
      "pt-BR: blank or non-string value for errors.required (got String)",
      "ja: blank or non-string value for dialogs.help.find (got FalseClass)"
    ], translation_failures(english, translations)
  end

  private

  def load_translations(locale)
    file = Rails.root.join("config", "locales", "#{locale}.yml")
    YAML.safe_load_file(file).fetch(locale)
  end

  def translation_failures(english, translations_by_locale)
    english_leaves = flatten_leaves(english)

    translations_by_locale.each_with_object([]) do |(locale, translations), failures|
      translated_leaves = flatten_leaves(translations)

      english_leaves.each_key do |path|
        unless translated_leaves.key?(path)
          failures << "#{locale}: missing key #{path}"
          next
        end

        value = translated_leaves[path]
        next if value.is_a?(String) && !value.strip.empty?

        failures << "#{locale}: blank or non-string value for #{path} (got #{value.class})"
      end
    end
  end

  def flatten_leaves(translations, prefix = nil, leaves = {})
    translations.each do |key, value|
      path = [ prefix, key.to_s ].compact.join(".")

      if value.is_a?(Hash)
        flatten_leaves(value, path, leaves)
      else
        leaves[path] = value
      end
    end

    leaves
  end
end
