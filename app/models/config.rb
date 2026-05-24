# frozen_string_literal: true

# Manages user configuration stored in .fed file at the notes root.
# Provides defaults from ENV variables that can be overridden per-folder.
class Config
  CONFIG_FILE = ".fed"
  CONFIG_VERSION = 2  # Increment when adding new settings

  # All configurable options with their defaults and types
  SCHEMA = {
    # UI Settings
    "theme" => { default: nil, type: :string, env: nil },
    "locale" => { default: "en", type: :string, env: "FRANKMD_LOCALE" },
    "editor_font" => { default: "cascadia-code", type: :string, env: nil },
    "editor_font_size" => { default: 14, type: :integer, env: nil },
    "preview_zoom" => { default: 100, type: :integer, env: nil },
    "sidebar_visible" => { default: true, type: :boolean, env: nil },
    "typewriter_mode" => { default: false, type: :boolean, env: nil },
    "editor_indent" => { default: 2, type: :integer, env: nil },
    "editor_line_numbers" => { default: 0, type: :integer, env: nil },
    "editor_width" => { default: 72, type: :integer, env: nil },

    # Paths (ENV defaults)
    "images_path" => { default: nil, type: :string, env: "IMAGES_PATH" },

    # AWS S3 Settings (ENV defaults)
    "aws_access_key_id" => { default: nil, type: :string, env: "AWS_ACCESS_KEY_ID" },
    "aws_secret_access_key" => { default: nil, type: :string, env: "AWS_SECRET_ACCESS_KEY" },
    "aws_s3_bucket" => { default: nil, type: :string, env: "AWS_S3_BUCKET" },
    "aws_region" => { default: nil, type: :string, env: "AWS_REGION" },

    # YouTube API (ENV default)
    "youtube_api_key" => { default: nil, type: :string, env: "YOUTUBE_API_KEY" },

    # Google Custom Search (ENV defaults)
    "google_api_key" => { default: nil, type: :string, env: "GOOGLE_API_KEY" },
    "google_cse_id" => { default: nil, type: :string, env: "GOOGLE_CSE_ID" },

    # AI/LLM Settings (ENV defaults)
    "ai_provider" => { default: "auto", type: :string, env: "AI_PROVIDER" },
    "ai_model" => { default: nil, type: :string, env: "AI_MODEL" },
    "ollama_api_base" => { default: nil, type: :string, env: "OLLAMA_API_BASE" },
    "ollama_model" => { default: "llama3.2:latest", type: :string, env: "OLLAMA_MODEL" },
    "openrouter_api_key" => { default: nil, type: :string, env: "OPENROUTER_API_KEY" },
    "openrouter_model" => { default: "openai/gpt-4o-mini", type: :string, env: "OPENROUTER_MODEL" },
    "anthropic_api_key" => { default: nil, type: :string, env: "ANTHROPIC_API_KEY" },
    "anthropic_model" => { default: "claude-sonnet-4-20250514", type: :string, env: "ANTHROPIC_MODEL" },
    "gemini_api_key" => { default: nil, type: :string, env: "GEMINI_API_KEY" },
    "gemini_model" => { default: "gemini-2.0-flash", type: :string, env: "GEMINI_MODEL" },
    "openai_api_key" => { default: nil, type: :string, env: "OPENAI_API_KEY" },
    "openai_model" => { default: "gpt-4o-mini", type: :string, env: "OPENAI_MODEL" },

    # Hugo blog post settings
    "hugo_path_style" => { default: "dated", type: :string, env: "HUGO_PATH_STYLE" },

    # AI Image Generation
    "image_generation_model" => { default: "google/gemini-3.1-flash-image-preview", type: :string, env: "IMAGE_GENERATION_MODEL" }
  }.freeze

  # Keys that should not be exposed to the frontend (sensitive)
  SENSITIVE_KEYS = %w[
    aws_access_key_id
    aws_secret_access_key
    youtube_api_key
    google_api_key
    openai_api_key
    openrouter_api_key
    anthropic_api_key
    gemini_api_key
  ].freeze

  # Keys that are UI settings (saved from frontend)
  UI_KEYS = %w[
    theme
    locale
    editor_font
    editor_font_size
    preview_zoom
    sidebar_visible
    typewriter_mode
    editor_indent
    editor_line_numbers
    editor_width
  ].freeze

  # AI provider priority (default order when ai_provider = "auto")
  # OpenAI first as most reliable, then cloud providers, then local
  # Gemini is last because its API key is primarily for image generation (Imagen)
  # This allows using Anthropic for text while Gemini handles images
  AI_PROVIDER_PRIORITY = %w[openai anthropic openrouter ollama gemini].freeze

  # AI credential keys - if ANY of these are set in .fed, ignore ALL AI ENV vars
  # This allows users to override their global ENV config per-folder
  # Only includes actual credentials/endpoints, not settings like ai_provider or models
  AI_CREDENTIAL_KEYS = %w[
    ollama_api_base
    openrouter_api_key
    anthropic_api_key
    gemini_api_key
    openai_api_key
  ].freeze

  # Template sections for config file (used for upgrades)
  TEMPLATE_SECTIONS = [
    {
      marker: "# FrankMD Configuration",
      lines: [
        "# FrankMD Configuration",
        "# Uncomment and modify values as needed.",
        "# Environment variables are used as defaults if not specified here."
      ]
    },
    {
      marker: "# UI Settings",
      lines: [
        "",
        "# UI Settings",
        "",
        "# Theme: light, dark, gruvbox, tokyo-night, solarized-dark,",
        "#        solarized-light, nord, cappuccino, osaka, hackerman",
        "# theme = dark",
        "",
        "# Editor font: cascadia-code, jetbrains-mono, fira-code,",
        "#              source-code-pro, ubuntu-mono, roboto-mono, hack",
        "# editor_font = cascadia-code",
        "",
        "# editor_font_size = 14",
        "# preview_zoom = 100",
        "# sidebar_visible = true",
        "# typewriter_mode = false",
        "",
        "# Editor indent: 0 = tab, 1-6 = spaces (default: 2)",
        "# editor_indent = 2",
        "",
        "# Editor width in characters (default: 72, minimum: 72)",
        "# Increase for wider text area, e.g., 100, 120, or 150",
        "# editor_width = 72"
      ]
    },
    {
      marker: "# Local Images",
      lines: [
        "",
        "# Local Images",
        "",
        "# images_path = /path/to/images"
      ]
    },
    {
      marker: "# AWS S3",
      lines: [
        "",
        "# AWS S3 (for image uploads)",
        "",
        "# aws_access_key_id = your-access-key",
        "# aws_secret_access_key = your-secret-key",
        "# aws_s3_bucket = your-bucket-name",
        "# aws_region = us-east-1"
      ]
    },
    {
      marker: "# YouTube API",
      lines: [
        "",
        "# YouTube API (for video search)",
        "",
        "# youtube_api_key = your-youtube-api-key"
      ]
    },
    {
      marker: "# Google Custom Search",
      lines: [
        "",
        "# Google Custom Search (for image search)",
        "",
        "# google_api_key = your-google-api-key",
        "# google_cse_id = your-custom-search-engine-id"
      ]
    },
    {
      marker: "# Hugo",
      lines: [
        "",
        "# Hugo Blog Posts",
        "",
        "# Path style: dated = YYYY/MM/DD/slug/index.md (default)",
        "#             flat  = slug.md (in current folder)",
        "# hugo_path_style = dated",
        "",
        "# Custom frontmatter: create a .hugo_template.md file at the notes root",
        "# to override the generated frontmatter. Placeholders {{title}}, {{slug}}",
        "# and {{date}} are substituted. Leave unset to use the built-in template."
      ]
    },
    {
      marker: "# AI/LLM",
      lines: [
        "",
        "# AI/LLM (for grammar checking)",
        "# Provider priority when ai_provider = auto: openai > anthropic > openrouter > ollama > gemini",
        "# Gemini is lowest priority for text (its key is mainly for image generation)",
        "",
        "# ai_provider = auto",
        "# ai_model = (uses provider-specific default if not set)",
        "",
        "# OpenAI (recommended)",
        "# openai_api_key = sk-...",
        "# openai_model = gpt-4o-mini",
        "",
        "# Anthropic (Claude models)",
        "# anthropic_api_key = sk-ant-...",
        "# anthropic_model = claude-sonnet-4-20250514",
        "",
        "# Google Gemini",
        "# gemini_api_key = ...",
        "# gemini_model = gemini-2.0-flash",
        "",
        "# OpenRouter (multiple providers, pay-per-use)",
        "# openrouter_api_key = sk-or-...",
        "# openrouter_model = openai/gpt-4o-mini",
        "",
        "# Ollama (local, free) - for privacy, requires local setup",
        "# ollama_api_base = http://localhost:11434",
        "# ollama_model = llama3.2:latest"
      ]
    }
  ].freeze

  attr_reader :base_path, :values

  def initialize(base_path: nil)
    @base_path = Pathname.new(base_path || ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    Rails.logger.debug("[Config] Initializing with base_path: #{@base_path}")
    @values = {}
    load_config
  end

  # Get a configuration value
  def get(key)
    key = key.to_s
    return nil unless SCHEMA.key?(key)

    # Priority: file value > ENV value > default
    if @values.key?(key)
      @values[key]
    elsif SCHEMA[key][:env] && ENV[SCHEMA[key][:env]].present?
      cast_value(ENV[SCHEMA[key][:env]], SCHEMA[key][:type])
    else
      SCHEMA[key][:default]
    end
  end

  # Set a configuration value and save to file
  def set(key, value)
    key = key.to_s
    return false unless SCHEMA.key?(key)

    casted = cast_value(value, SCHEMA[key][:type])
    @values[key] = casted
    save_single_key(key, casted)
    true
  end

  # Update multiple values at once
  def update(new_values)
    changes = {}
    new_values.each do |key, value|
      key = key.to_s
      next unless SCHEMA.key?(key)
      casted = cast_value(value, SCHEMA[key][:type])
      @values[key] = casted
      changes[key] = casted
    end
    save_keys(changes)
    true
  end

  # Get all UI settings (safe for frontend)
  def ui_settings
    UI_KEYS.each_with_object({}) do |key, hash|
      hash[key] = get(key)
    end
  end

  # Get all settings (for internal use, includes resolved ENV values but masks sensitive data)
  def all_settings(include_sensitive: false)
    SCHEMA.keys.each_with_object({}) do |key, hash|
      if SENSITIVE_KEYS.include?(key)
        if include_sensitive
          hash[key] = get(key)
        else
          # Just indicate if configured (for frontend status display)
          hash["#{key}_configured"] = get(key).present?
        end
      else
        hash[key] = get(key)
      end
    end
  end

  # Check if a feature is available (API key configured)
  def feature_available?(feature)
    case feature.to_s
    when "s3_upload"
      get("aws_access_key_id").present? &&
        get("aws_secret_access_key").present? &&
        get("aws_s3_bucket").present?
    when "youtube_search"
      get("youtube_api_key").present?
    when "google_search"
      get("google_api_key").present? && get("google_cse_id").present?
    when "local_images"
      get("images_path").present?
    when "ai"
      ai_providers_available.any?
    else
      false
    end
  end

  # Check if any AI credential is explicitly set in the .fed file
  # When true, we ignore ALL AI-related ENV vars for credentials
  # This allows per-folder AI config that overrides global ENV settings
  def ai_configured_in_file?
    AI_CREDENTIAL_KEYS.any? { |key| @values.key?(key) }
  end

  # Get an AI-related config value
  # If ANY AI key is in .fed, use ONLY file values (ignore ENV)
  # This allows users to override their ENV-based config per-folder
  def get_ai(key)
    key = key.to_s
    return nil unless SCHEMA.key?(key)

    if ai_configured_in_file?
      # File-only mode: ignore ENV vars for AI
      if @values.key?(key)
        @values[key]
      else
        SCHEMA[key][:default]
      end
    else
      # Normal mode: file > ENV > default
      get(key)
    end
  end

  # Get list of available AI providers (those with credentials configured)
  def ai_providers_available
    available = []
    available << "ollama" if get_ai("ollama_api_base").present?
    available << "openrouter" if get_ai("openrouter_api_key").present?
    available << "anthropic" if get_ai("anthropic_api_key").present?
    available << "gemini" if get_ai("gemini_api_key").present?
    available << "openai" if get_ai("openai_api_key").present?
    available
  end

  # Get the effective AI provider based on priority
  def effective_ai_provider
    available = ai_providers_available
    return nil if available.empty?

    configured_provider = get_ai("ai_provider")

    # If a specific provider is configured and available, use it
    if configured_provider.present? && configured_provider != "auto" && available.include?(configured_provider)
      return configured_provider
    end

    # Auto mode: use priority order
    AI_PROVIDER_PRIORITY.find { |p| available.include?(p) }
  end

  # Get the effective model for the current AI provider
  def effective_ai_model
    provider = effective_ai_provider
    return nil unless provider

    # Check for global ai_model override first
    global_model = get_ai("ai_model")
    return global_model if global_model.present?

    # Use provider-specific model
    get_ai("#{provider}_model")
  end

  # Get the effective value for a setting (used by services)
  def effective_value(key)
    get(key)
  end

  # Ensure config file exists and is up to date
  def ensure_config_file
    if config_file_path.exist?
      upgrade_config_file
    else
      Rails.logger.warn("[Config] .fed not found at #{config_file_path}, creating template...")
      create_template_config
    end
  end

  def config_file_path
    @base_path.join(CONFIG_FILE)
  end

  private

  def load_config
    ensure_config_file
    return unless config_file_path.exist?

    content = config_file_path.read
    parse_config(content)
  rescue => e
    Rails.logger.error("Failed to load .fed config: #{e.class} - #{e.message}")
    Rails.logger.error(e.backtrace.first(5).join("\n"))
    @values = {}
  end

  def parse_config(content)
    @values = {}

    content.each_line do |line|
      line = line.strip

      # Skip empty lines and comments
      next if line.empty? || line.start_with?("#")

      # Parse key = value format (keys can contain letters, numbers, and underscores)
      if line =~ /^([a-z0-9_]+)\s*=\s*(.*)$/i
        key = $1.downcase
        value = $2.strip

        # Remove surrounding quotes if present
        value = value[1..-2] if value.start_with?('"') && value.end_with?('"')
        value = value[1..-2] if value.start_with?("'") && value.end_with?("'")

        # Only accept known keys
        if SCHEMA.key?(key)
          @values[key] = cast_value(value, SCHEMA[key][:type])
        end
      end
    end
  end

  def cast_value(value, type)
    return nil if value.nil? || value.to_s.strip.empty?

    case type
    when :integer
      value.to_i
    when :boolean
      %w[true 1 yes on].include?(value.to_s.downcase)
    when :string
      value.to_s
    else
      value
    end
  end

  # Save a single key to the config file (surgical update)
  def save_single_key(key, value)
    save_keys({ key => value })
  end

  # Save multiple keys to the config file (surgical update)
  # Only modifies the specified keys, preserves everything else exactly as-is
  def save_keys(changes)
    return if changes.empty?

    ensure_config_file

    lines = []
    keys_written = Set.new

    config_file_path.read.each_line do |line|
      stripped = line.strip

      if stripped.empty?
        # Preserve empty lines
        lines << ""
      elsif stripped.start_with?("#")
        # Check if this is a commented-out key we're now setting
        if stripped =~ /^#\s*([a-z0-9_]+)\s*=/i
          key = $1.downcase
          if changes.key?(key) && !keys_written.include?(key)
            # Replace commented line with actual value
            lines << format_value(key, changes[key])
            keys_written.add(key)
            next
          end
        end
        # Preserve comment line as-is
        lines << line.chomp
      elsif stripped =~ /^([a-z0-9_]+)\s*=/i
        key = $1.downcase
        if changes.key?(key)
          # Update this key with new value
          lines << format_value(key, changes[key])
          keys_written.add(key)
        else
          # Preserve line exactly as-is (including original formatting)
          lines << line.chomp
        end
      else
        # Preserve any other line (malformed or unknown)
        lines << line.chomp
      end
    end

    # Append any new keys that weren't in the file
    changes.each do |key, value|
      unless keys_written.include?(key)
        lines << format_value(key, value)
      end
    end

    config_file_path.write(lines.join("\n") + "\n")
  rescue => e
    Rails.logger.error("Failed to save .fed config: #{e.message}")
    false
  end

  def format_value(key, value)
    case SCHEMA[key][:type]
    when :string
      if value.to_s.include?(" ") || value.to_s.include?("=")
        "#{key} = \"#{value}\""
      else
        "#{key} = #{value}"
      end
    when :boolean
      "#{key} = #{value ? 'true' : 'false'}"
    else
      "#{key} = #{value}"
    end
  end

  def create_template_config
    target_path = config_file_path
    target_dir = target_path.dirname

    # Ensure parent directory exists
    unless target_dir.exist?
      Rails.logger.warn("[Config] Creating notes directory: #{target_dir}")
      target_dir.mkpath
    end

    lines = generate_template_lines
    Rails.logger.warn("[Config] Writing .fed config to: #{target_path}")
    target_path.write(lines.join("\n") + "\n")
    Rails.logger.warn("[Config] Successfully created .fed config")
  rescue Errno::EACCES => e
    Rails.logger.error("[Config] Permission denied creating .fed at #{config_file_path}: #{e.message}")
  rescue Errno::EROFS => e
    Rails.logger.error("[Config] Read-only filesystem, cannot create .fed at #{config_file_path}: #{e.message}")
  rescue => e
    Rails.logger.error("[Config] Failed to create .fed at #{config_file_path}: #{e.class} - #{e.message}")
    Rails.logger.error(e.backtrace.first(5).join("\n"))
  end

  # Upgrade existing config file by adding NEW sections only
  # This is conservative: only adds sections for new features (like AI/LLM)
  # It does NOT re-add sections the user may have intentionally removed
  def upgrade_config_file
    return unless config_file_path.exist?

    content = config_file_path.read
    existing_lines = content.lines.map(&:chomp)

    # Only upgrade with truly new sections - currently just AI/LLM
    # We check for any AI-related key to determine if the section exists
    ai_keys = %w[ai_provider ai_model ollama_api_base ollama_model
                 openrouter_api_key openrouter_model anthropic_api_key anthropic_model
                 gemini_api_key gemini_model openai_api_key openai_model]

    ai_section_present = existing_lines.any? do |line|
      line.include?("# AI/LLM") ||
        ai_keys.any? { |key| line =~ /^#?\s*#{key}\s*=/i }
    end

    return if ai_section_present

    # Add AI section at the end
    ai_section = TEMPLATE_SECTIONS.find { |s| s[:marker] == "# AI/LLM" }
    return unless ai_section

    new_lines = existing_lines.dup
    new_lines << "" if new_lines.last&.strip&.present?
    new_lines.concat(ai_section[:lines])

    config_file_path.write(new_lines.join("\n") + "\n")
    Rails.logger.info("Upgraded .fed config with AI/LLM section")
  rescue => e
    Rails.logger.warn("Failed to upgrade .fed config: #{e.message}")
  end

  def generate_template_lines
    TEMPLATE_SECTIONS.flat_map { |section| section[:lines] }
  end

  def generate_config_lines
    lines = generate_template_lines

    # Replace commented lines with actual values where we have them
    @values.each do |key, value|
      pattern = /^# #{key} = /
      index = lines.find_index { |l| l =~ pattern }
      if index
        lines[index] = format_value(key, value)
      else
        lines << format_value(key, value)
      end
    end

    lines
  end
end
