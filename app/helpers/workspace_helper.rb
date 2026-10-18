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
      [ "copy", "copyCurrentPath", "header.click_to_copy_path", "document", false ],
      [ "help", "openHelp", "editor.toolbar.help_title", "global", false ],
      [ "about", "openAboutDialog", "header.about_app", "global", false ]
    ].map { |id, handler, label, scope, pinned| { id: id, handler: handler, label: t(label), scope: scope, pinned: pinned } }
  end
end
