# frozen_string_literal: true

require "test_helper"

# Guards against the JS-facing locale drift that shipped broken in the original
# drag-and-drop PR: keys added only to en.yml render as the raw key string in
# every other language (the client-side `window.t` returns the key on a miss and
# the translations endpoint does no fallback merge). Every media-upload key must
# exist in all seven locales.
class I18nMediaUploadKeysTest < ActiveSupport::TestCase
  LOCALES = %w[en es he ja ko pt-BR pt-PT].freeze

  REQUIRED_KEYS = [
    "dialogs.image_picker.tab_drop",
    "dialogs.image_picker.drop_hint",
    "dialogs.image_picker.drop_rejected",
    "dialogs.image_picker.processing_image_paste",
    "dialogs.video.tab_drop",
    "dialogs.video.drop_hint",
    "dialogs.video.drop_rejected",
    "dialogs.video.uploading",
    "status.upload_failed"
  ].freeze

  LOCALES.each do |locale|
    REQUIRED_KEYS.each do |key|
      test "#{locale} defines #{key}" do
        root = YAML.load_file(Rails.root.join("config", "locales", "#{locale}.yml"))[locale]
        value = key.split(".").reduce(root) { |node, seg| node.is_a?(Hash) ? node[seg] : nil }
        assert value.present?, "config/locales/#{locale}.yml is missing #{key}"
      end
    end
  end
end
