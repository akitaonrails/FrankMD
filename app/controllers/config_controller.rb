# frozen_string_literal: true

class ConfigController < ApplicationController
  include MediaStorageRecovery
  # Disable automatic parameter wrapping (Rails wraps JSON params under controller name)
  wrap_parameters false

  before_action :set_config, except: [ :omarchy_theme ]

  # GET /config/editor
  # Returns the editor config partial for Turbo replacement
  def editor
    @config_obj = @config
    render partial: "config/editor_config", layout: false
  end

  # GET /config
  # Returns UI settings and feature availability
  def show
    fallback = recover_media_storage(@config, consume: true)
    render json: {
      settings: @config.ui_settings,
      media_storage_fallback: fallback,
      features: {
        s3_upload: @config.feature_available?(:s3_upload),
        youtube_search: @config.feature_available?(:youtube_search),
        google_search: @config.feature_available?(:google_search),
        local_images: @config.feature_available?(:local_images)
      }
    }
  end

  # GET /config/omarchy_theme
  # Returns Omarchy theme colors for live sync
  def omarchy_theme
    data = OmarchyThemeService.theme_data

    if data
      render json: data
    else
      render json: { error: "Omarchy theme not available" }, status: :not_found
    end
  end

  # PATCH /config
  # Updates UI settings
  def update
    allowed_keys = Config::UI_KEYS
    updates = params.permit(*allowed_keys).to_h

    if updates.empty?
      render json: { error: t("errors.no_valid_settings") }, status: :unprocessable_entity
      return
    end

    if @config.update(updates)
      session.delete(:media_storage_fallback) if updates.key?("media_storage_provider")
      render json: {
        settings: @config.ui_settings,
        message: t("success.settings_saved")
      }
    else
      render json: { error: t("errors.failed_to_save") }, status: :unprocessable_entity
    end
  end

  private

  def set_config
    @config = Config.new
  end
end
