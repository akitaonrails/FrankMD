# frozen_string_literal: true

class RecentFilesService
  LIMIT = 10

  def initialize(config: Config.new)
    @config = config
  end

  def entries
    normalize(@config.get("recent_files"))
  end

  def record(path)
    change do |items|
      raise NotesService::NotFoundError, "Note not found" unless valid_path?(path) && present?(path)

      [ { "path" => path, "opened_at" => Time.current.utc.iso8601(6) }, *items.reject { |item| item["path"] == path } ].first(LIMIT)
    end
  end

  def clear
    change { [] }
  end

  def remove(path)
    change { |items| items.reject { |item| scoped?(item["path"], path) } }
  end

  def remap(old_path, new_path)
    # Remap before checking existence: the old filesystem path is already gone.
    change(normalize_first: false) do |items|
      normalize(items.filter_map do |item|
        next unless item.is_a?(Hash) && item["path"].is_a?(String)

        candidate = item.dup
        candidate["path"] = "#{new_path}#{item['path'].delete_prefix(old_path)}" if scoped?(item["path"], old_path)
        candidate
      end)
    end
  end

  private

  def change(normalize_first: true)
    @config.modify("recent_files") do |value|
      items = value.is_a?(Array) ? value.first(100) : []
      yield(normalize_first ? normalize(items) : items)
    end
  end

  def normalize(value)
    return [] unless value.is_a?(Array)

    value.first(100).select do |item|
      item.is_a?(Hash) && valid_path?(item["path"]) &&
        item["opened_at"].is_a?(String) && present?(item["path"])
    end.uniq { |item| item["path"] }.first(LIMIT).map { |item| item.slice("path", "opened_at") }
  end

  def valid_path?(path)
    path.is_a?(String) && path.bytesize <= 4096 && path.end_with?(".md") &&
      !path.include?("\\") && !path.include?("\0") &&
      path.split("/", -1).none? { |part| part.empty? || part.start_with?(".") } &&
      PathSafety.contain(@config.base_path, path).present?
  end

  def present?(path)
    @config.base_path.join(path).stat.file?
  rescue Errno::ENOENT, Errno::ENOTDIR
    false
  rescue Errno::EACCES
    # Permission failures are not evidence that a note was deleted.
    true
  end

  def scoped?(candidate, path)
    candidate == path || candidate.start_with?("#{path}/")
  end
end
