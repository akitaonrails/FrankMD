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
    "media_storage.label",
    "media_storage.local",
    "media_storage.s3",
    "media_storage.save_failed",
    "media_storage.load_failed",
    "media_storage.save_copy",
    "media_storage.collection",
    "media_storage.managed_images",
    "media_storage.server_images",
    "dialogs.image_picker.tab_drop",
    "dialogs.image_picker.drop_hint",
    "dialogs.image_picker.drop_rejected",
    "dialogs.image_picker.processing_image_paste",
    "dialogs.image_picker.per_page",
    "dialogs.image_picker.prev_page",
    "dialogs.image_picker.next_page",
    "dialogs.image_picker.page_status",
    "dialogs.image_picker.delete_image",
    "dialogs.image_picker.delete_confirm",
    "dialogs.image_picker.delete_failed",
    "dialogs.s3_option.custom_key",
    "dialogs.s3_option.custom_key_hint",
    "dialogs.s3_option.custom_prefix",
    "dialogs.s3_option.custom_prefix_hint",
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
