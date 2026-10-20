# frozen_string_literal: true

module WorkspaceHelper
  def workspace_actions
    [
      [ "image", "openImagePicker", "editor.toolbar.image_title", "editing", true ],
      [ "find", "openFindReplace", "editor.toolbar.find_title", "editing", true ],
      [ "preview", "togglePreview", "header.toggle_preview", "preview", true ],
      [ "video", "openVideoDialog", "editor.toolbar.video_title", "editing", false ],
      [ "code", "openCodeEditor", "editor.toolbar.code_title", "editing", false ],
      [ "table", "openTableEditor", "editor.toolbar.table_title", "editing", false ],
      [ "emoji", "openEmojiPicker", "editor.toolbar.emoji_title", "editing", false ],
      [ "ai", "openAiDialog", "editor.toolbar.ai_title", "editing", false ],
      [ "copy", "copyCurrentContent", "header.copy_content", "document", false ],
      [ "help", "openHelp", "editor.toolbar.help_title", "global", false ]
    ].map do |id, handler, label, scope, pinned|
      tooltip = t(label)
      { id: id, handler: handler, label: tooltip.sub(/\s+\((?:Ctrl\+[^)]+|F\d+)\)\z/, ""), tooltip: tooltip, scope: scope, pinned: pinned }
    end
  end
end
