# frozen_string_literal: true

class Note
  include ActiveModel::Model
  include ActiveModel::Attributes
  include ActiveModel::Validations

  attribute :path, :string
  attribute :content, :string

  validates :path, presence: true
  validate :path_within_base_directory

  class << self
    def find(path)
      note = new(path: normalize_path(path))
      raise NotesService::NotFoundError, "Note not found: #{path}" unless note.exists?
      note.content = note.read
      note
    end

    def all
      service.list_tree
    end

    def search(query, **options)
      service.search_content(query, **options)
    end

    def backlinks(path)
      BacklinksService.new.find_backlinks(path)
    end

    def service
      NotesService.new
    end

    # Files that don't need .md extension added
    SPECIAL_FILES = %w[.fed].freeze

    def normalize_path(path)
      return "" if path.blank?
      path = path.to_s

      # Don't add .md to special files like .fed
      return path if SPECIAL_FILES.include?(File.basename(path))

      path = "#{path}.md" unless path.end_with?(".md")
      path
    end
  end

  def name
    File.basename(path.to_s, ".md")
  end

  def directory
    dir = File.dirname(path.to_s)
    dir == "." ? "" : dir
  end

  def exists?
    return false if path.blank?
    service.file?(normalized_path)
  end

  def read
    service.read(normalized_path)
  end

  def save
    return false unless valid?
    service.write(normalized_path, content || "")
    true
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
    service.delete(normalized_path)
    true
  rescue NotesService::NotFoundError
    errors.add(:base, I18n.t("errors.note_not_found"))
    false
  rescue NotesService::InvalidPathError => e
    errors.add(:base, e.message)
    false
  rescue Errno::EACCES, Errno::EPERM
    errors.add(:base, I18n.t("errors.permission_denied"))
    false
  rescue Errno::ENOENT
    errors.add(:base, I18n.t("errors.file_no_longer_exists"))
    false
  end

  def rename(new_path)
    new_path = self.class.normalize_path(new_path)
    service.rename(normalized_path, new_path)
    self.path = new_path
    true
  rescue NotesService::NotFoundError
    errors.add(:base, I18n.t("errors.note_not_found"))
    false
  rescue NotesService::InvalidPathError => e
    errors.add(:path, e.message)
    false
  rescue Errno::EACCES, Errno::EPERM
    errors.add(:base, I18n.t("errors.permission_denied"))
    false
  rescue Errno::ENOENT
    errors.add(:base, I18n.t("errors.file_no_longer_exists"))
    false
  end

  def persisted?
    exists?
  end

  def to_param
    path
  end

  def as_json(options = {})
    {
      path: path,
      name: name,
      content: content
    }
  end

  private

  def service
    @service ||= NotesService.new
  end

  def normalized_path
    @normalized_path ||= self.class.normalize_path(path)
  end

  def path_within_base_directory
    return if path.blank?
    if path.to_s.include?("..")
      errors.add(:path, "cannot contain directory traversal")
    end
  end
end
