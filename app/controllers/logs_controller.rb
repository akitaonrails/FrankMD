# frozen_string_literal: true

class LogsController < ApplicationController
  # GET /logs/tail
  # Returns the last N lines of the current environment's log
  def tail
    lines = params[:lines].to_i
    lines = 100 if lines <= 0 || lines > 500

    log_file = Rails.root.join("log", "#{Rails.env}.log")

    unless File.exist?(log_file)
      render json: { error: "Log file not found", lines: [] }
      return
    end

    # Read last N lines efficiently
    content = tail_file(log_file, lines)

    render json: {
      environment: Rails.env,
      file: log_file.basename.to_s,
      lines: content
    }
  end

  # GET /logs/config
  # Returns all config keys with resolved values and their source
  def status
    cfg = Config.new
    entries = Config::SCHEMA.keys.map do |key|
      schema = Config::SCHEMA[key]
      value = cfg.get(key)
      source = config_source(cfg, key, schema)
      sensitive = Config::SENSITIVE_KEYS.include?(key)

      {
        key: key,
        value: sensitive && value.present? ? mask_value(value) : value,
        source: source,
        env_var: schema[:env],
        sensitive: sensitive
      }
    end

    render json: {
      config_file: cfg.config_file_path.to_s,
      config_file_exists: cfg.config_file_path.exist?,
      ai_configured_in_file: cfg.ai_configured_in_file?,
      environment: Rails.env,
      entries: entries
    }
  end

  private

  def config_source(cfg, key, schema)
    if cfg.values.key?(key)
      "file"
    elsif schema[:env] && ENV[schema[:env]].present?
      "env"
    else
      "default"
    end
  end

  def mask_value(value)
    "****"
  end

  def tail_file(path, num_lines)
    lines = []
    File.open(path, "rb") do |file|
      # Start from end of file
      file.seek(0, IO::SEEK_END)
      size = file.pos
      return [] if size == 0

      buffer = ""
      chunk_size = 8192
      pos = size

      while lines.size < num_lines && pos > 0
        read_size = [ chunk_size, pos ].min
        pos -= read_size
        file.seek(pos)
        chunk = file.read(read_size)
        break if chunk.nil? # File was truncated

        buffer = chunk + buffer

        # Split into lines and keep counting
        all_lines = buffer.split("\n", -1)
        if pos > 0
          # Keep incomplete first line in buffer
          buffer = all_lines.shift || ""
        end
        lines = all_lines + lines
      end
    end

    lines.last(num_lines)
  end
end
