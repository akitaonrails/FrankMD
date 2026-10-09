# frozen_string_literal: true

module TreeHelper
  def render_tree_items(items, expanded_folders:, selected_file:, depth: 0)
    if items.blank?
      if depth == 0
        return content_tag(:div, t("sidebar.no_notes_yet"),
          class: "text-sm text-[var(--theme-text-muted)] p-2")
      end
      return "".html_safe
    end

    safe_join(items.map { |item|
      if item[:type] == "folder" || item["type"] == "folder"
        render_tree_folder(item, expanded_folders: expanded_folders, selected_file: selected_file, depth: depth)
      else
        render_tree_file(item, selected_file: selected_file)
      end
    })
  end

  private

  def render_tree_folder(item, expanded_folders:, selected_file:, depth:)
    path = item[:path] || item["path"]
    name = item[:name] || item["name"]
    children = item[:children] || item["children"] || []
    is_expanded = expanded_folders.include?(path)

    content_tag(:div, class: "tree-folder", data: { path: path }) do
      folder_header = content_tag(:div,
        class: "tree-item drop-target",
        draggable: "true",
        tabindex: 0,
        data: {
          action: "pointerdown->app#onExplorerItemPointerDown click->app#toggleFolder focus->app#onExplorerItemFocus keydown->app#deleteSelectedExplorerItem keydown->app#renameSelectedExplorerItem contextmenu->app#showContextMenu dragstart->drag-drop#onDragStart dragover->drag-drop#onDragOver drop->drag-drop#onDrop dragend->drag-drop#onDragEnd",
          path: path,
          drop_id: path,
          type: "folder"
        }) do
        chevron_svg(is_expanded) +
        folder_icon_svg +
        content_tag(:span, name, class: "truncate")
      end

      children_div = content_tag(:div, class: "tree-children#{is_expanded ? '' : ' hidden'}") do
        render_tree_items(children, expanded_folders: expanded_folders, selected_file: selected_file, depth: depth + 1)
      end

      folder_header + children_div
    end
  end

  def render_tree_file(item, selected_file:)
    path = item[:path] || item["path"]
    name = item[:name] || item["name"]
    file_type = item[:file_type] || item["file_type"] || "markdown"
    mtime = item[:mtime] || item["mtime"]
    is_selected = selected_file == path
    is_config = file_type == "config"

    attrs = if is_config
      {
        class: "tree-item#{is_selected ? ' selected' : ''}",
        tabindex: 0,
        data: {
          action: "pointerdown->app#onExplorerItemPointerDown click->app#selectFile focus->app#onExplorerItemFocus keydown->app#deleteSelectedExplorerItem keydown->app#renameSelectedExplorerItem",
          path: path,
          type: "file",
          file_type: file_type,
          mtime: mtime
        }
      }
    else
      {
        class: "tree-item#{is_selected ? ' selected' : ''}",
        draggable: "true",
        tabindex: 0,
        data: {
          action: "pointerdown->app#onExplorerItemPointerDown click->app#selectFile focus->app#onExplorerItemFocus keydown->app#deleteSelectedExplorerItem keydown->app#renameSelectedExplorerItem contextmenu->app#showContextMenu dragstart->drag-drop#onDragStart dragend->drag-drop#onDragEnd",
          path: path,
          type: "file",
          file_type: file_type,
          mtime: mtime
        }
      }
    end

    content_tag(:div, **attrs) do
      (is_config ? config_icon_svg : file_icon_svg) +
      content_tag(:span, name, class: "truncate")
    end
  end

  def chevron_svg(expanded)
    content_tag(:svg, class: "tree-chevron#{expanded ? ' expanded' : ''}", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24") do
      tag.path("", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M9 5l7 7-7 7")
    end
  end

  def folder_icon_svg
    content_tag(:svg, class: "tree-icon text-[var(--theme-folder-icon)]", fill: "currentColor", viewBox: "0 0 20 20") do
      tag.path("", d: "M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z")
    end
  end

  def file_icon_svg
    content_tag(:svg, class: "tree-icon text-[var(--theme-file-icon)]", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24") do
      tag.path("", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z")
    end
  end

  def config_icon_svg
    content_tag(:svg, class: "tree-icon text-[var(--theme-config-icon)]", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24") do
      tag.path("", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z") +
      tag.path("", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z")
    end
  end
end
