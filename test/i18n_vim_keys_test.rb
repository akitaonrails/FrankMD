# frozen_string_literal: true

require "test_helper"

# The vim-mode UI (header toggle, status, and the :help panel) is JS-facing, so a
# key missing from a locale renders as the raw key string rather than falling
# back. Every vim key must exist in all seven locales.
class I18nVimKeysTest < ActiveSupport::TestCase
  LOCALES = %w[en es he ja ko pt-BR pt-PT].freeze

  REQUIRED_KEYS = [
    "header.toggle_vim",
    "dialogs.help.tab_vim",
    "dialogs.help.vim.intro",
    "dialogs.help.vim.modes_title",
    "dialogs.help.vim.mode_normal",
    "dialogs.help.vim.mode_insert",
    "dialogs.help.vim.mode_visual",
    "dialogs.help.vim.commands_title",
    "dialogs.help.vim.col_command",
    "dialogs.help.vim.col_action",
    "dialogs.help.vim.cmd_write",
    "dialogs.help.vim.cmd_quit",
    "dialogs.help.vim.cmd_wq",
    "dialogs.help.vim.cmd_edit",
    "dialogs.help.vim.cmd_explore",
    "dialogs.help.vim.cmd_next",
    "dialogs.help.vim.cmd_prev",
    "dialogs.help.vim.cmd_help"
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
