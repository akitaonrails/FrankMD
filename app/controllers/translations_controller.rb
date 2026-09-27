# frozen_string_literal: true

class TranslationsController < ApplicationController
  # GET /translations
  # Returns translations for JavaScript use
  def show
    js_keys = %w[common dialogs status errors success editor sidebar preview context_menu connection]
    translations = js_keys.each_with_object({}) do |key, hash|
      # Deep-merge the requested locale over the en tree: I18n fallbacks only
      # kick in when a whole section is missing, so keys absent from an
      # otherwise-translated section would otherwise surface as dotted keys
      # in window.t(). Locale values win; en fills the gaps.
      hash[key] = merged_section(key)
    end
    render json: { locale: I18n.locale.to_s, translations: translations }
  end

  private

  def merged_section(key)
    localized = I18n.t(key, locale: I18n.locale, default: {})
    return localized unless localized.is_a?(Hash)

    english = I18n.t(key, locale: :en, default: {})
    return localized unless english.is_a?(Hash)

    deep_merge_over(english, localized)
  end

  # Recursively merges `overrides` on top of `base`; override values win,
  # nested hashes merge so sibling keys from both sides survive.
  def deep_merge_over(base, overrides)
    overrides.each_with_object(base.dup) do |(key, value), merged|
      existing = merged[key]
      merged[key] = existing.is_a?(Hash) && value.is_a?(Hash) ? deep_merge_over(existing, value) : value
    end
  end
end
