# frozen_string_literal: true

class Folder
  include ActiveModel::Model
  include ActiveModel::Attributes
  include ActiveModel::Validations

  attribute :path, :string

  validates :path, presence: true
  validate :path_within_base_directory

  class << self
    def find(path)
      folder = new(path: path)
      raise NotesService::NotFoundError, "Folder not found: #{path}" unless folder.exists?
      folder
    end

    def service
      NotesService.new
    end
  end

  def name
    File.basename(path.to_s)
  end

  def parent_path
    dir = File.dirname(path.to_s)
    dir == "." ? nil : dir
  end

  def exists?
    return false if path.blank?
    service.directory?(path)
  end

  def children
    tree = service.list_tree
    find_in_tree(tree, path)&.dig(:children) || []
  end

  def create
    return false unless valid?
    if exists?
      errors.add(:base, I18n.t("errors.folder_already_exists"))
      return false
    end
    service.create_folder(path)
    true
  rescue NotesService::AlreadyExistsError
    errors.add(:base, I18n.t("errors.folder_already_exists"))
    false
  rescue NotesService::InvalidPathError => e
    errors.add(:path, e.message)
    false
  rescue Errno::EACCES, Errno::EPERM
    errors.add(:base, I18n.t("errors.permission_denied"))
    false
  rescue Errno::ENOENT
    errors.add(:base, I18n.t("errors.parent_folder_not_found"))
    false
  end

  def destroy
    service.delete_folder(path)
    true
  rescue NotesService::NotFoundError
    errors.add(:base, I18n.t("errors.folder_not_found"))
    false
  rescue NotesService::InvalidPathError => e
    errors.add(:base, e.message)
    false
  rescue Errno::EACCES, Errno::EPERM
    errors.add(:base, I18n.t("errors.permission_denied"))
    false
  rescue Errno::ENOENT
    errors.add(:base, I18n.t("errors.folder_no_longer_exists"))
    false
  end

  def rename(new_path)
    service.rename(path, new_path)
    self.path = new_path

    # Update Hugo frontmatter slug if index.md exists
    update_hugo_index_slug(new_path)

    true
  rescue NotesService::AlreadyExistsError
    errors.add(:base, I18n.t("errors.folder_already_exists"))
    false
  rescue NotesService::NotFoundError
    errors.add(:base, I18n.t("errors.folder_not_found"))
    false
  rescue NotesService::InvalidPathError => e
    errors.add(:path, e.message)
    false
  rescue Errno::EACCES, Errno::EPERM
    errors.add(:base, I18n.t("errors.permission_denied"))
    false
  rescue Errno::ENOENT
    errors.add(:base, I18n.t("errors.folder_no_longer_exists"))
    false
  end

  def persisted?
    exists?
  end

  def to_param
    path
  end

  private

  def service
    @service ||= NotesService.new
  end

  # Update slug in index.md frontmatter after folder rename
  def update_hugo_index_slug(folder_path)
    index_path = "#{folder_path}/index.md"
    return unless service.file?(index_path)

    content = service.read(index_path)
    new_folder_name = File.basename(folder_path)
    new_slug = HugoService.slugify(new_folder_name)

    updated_content = HugoService.update_frontmatter_slug(content, new_slug)
    return unless updated_content

    service.write(index_path, updated_content)
  rescue StandardError => e
    # Log but don't fail the rename if slug update fails
    Rails.logger.warn("Failed to update Hugo slug in #{index_path}: #{e.message}")
  end

  def find_in_tree(items, target_path)
    return nil unless items.is_a?(Array)

    items.each do |item|
      return item if item[:path] == target_path
      if item[:type] == "folder" && item[:children]
        found = find_in_tree(item[:children], target_path)
        return found if found
      end
    end
    nil
  end

  def path_within_base_directory
    return if path.blank?
    if path.to_s.include?("..")
      errors.add(:path, "cannot contain directory traversal")
    end
  end
end
