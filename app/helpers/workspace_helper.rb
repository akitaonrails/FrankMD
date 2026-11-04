# frozen_string_literal: true

module WorkspaceHelper
  def workspace_actions
    pinnable = [
      [ "image", "openImagePicker", "editor.toolbar.image_title", "editing", true ],
      [ "find", "openFindReplace", "editor.toolbar.find_title", "editing", true ],
      [ "preview", "togglePreview", "header.toggle_preview", "preview", true ],
      [ "video", "openVideoDialog", "editor.toolbar.video_title", "editing", false ],
      [ "code", "openCodeEditor", "editor.toolbar.code_title", "editing", false ],
      [ "table", "openTableEditor", "editor.toolbar.table_title", "editing", false ],
      [ "emoji", "openEmojiPicker", "editor.toolbar.emoji_title", "editing", false ],
      [ "ai", "openAiDialog", "editor.toolbar.ai_title", "editing", false ],
      [ "format", "openTextFormatMenu", "editor.toolbar.format_title", "editing", false ],
      [ "copy", "copyCurrentContent", "header.copy_content", "document", false ],
      [ "help", "openHelp", "editor.toolbar.help_title", "global", false ]
    ]
    # Long-press keeps the native selection menu on mobile, so Format stands in for it there.
    mobile_only = %w[format]
    # Destructive actions sit apart at the end of the menu and are never pinned.
    destructive = [
      [ "delete", "deleteCurrentNote", "context_menu.delete", "document" ]
    ]

    pinnable.map { |id, handler, label, scope, pinned| workspace_action(id, handler, label, scope, pinned: pinned, pinnable: true, mobile_only: mobile_only.include?(id)) } +
      destructive.map { |id, handler, label, scope| workspace_action(id, handler, label, scope, pinned: false, pinnable: false) }
  end

  private

  def workspace_action(id, handler, label, scope, pinned:, pinnable:, mobile_only: false)
    tooltip = t(label)
    { id: id, handler: handler, label: tooltip.sub(/\s+\((?:Ctrl\+[^)]+|F\d+)\)\z/, ""), tooltip: tooltip, scope: scope, pinned: pinned, pinnable: pinnable, mobile_only: mobile_only }
  end
end
