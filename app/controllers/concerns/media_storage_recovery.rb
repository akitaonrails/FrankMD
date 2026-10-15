# frozen_string_literal: true

# Recover an unusable S3 preference and carry the warning to the next shared
# configuration refresh, including after a failed upload.
module MediaStorageRecovery
  private

  def recover_media_storage(config, consume: false)
    if config.get("media_storage_provider") == "s3" && !config.feature_available?(:s3_upload)
      session[:media_storage_fallback] = true if config.set("media_storage_provider", "local")
    end
    recovered = session[:media_storage_fallback] == true && config.get("media_storage_provider") == "local"
    session.delete(:media_storage_fallback) if consume
    recovered
  end

  def recover_missing_upload_storage
    config = Config.new
    return unless config.get("media_storage_provider") == "s3" && !config.feature_available?(:s3_upload)
    return unless config.set("media_storage_provider", "local")

    render_storage_recovery
  end

  def render_storage_recovery
    session[:media_storage_fallback] = true
    render json: {
      error: t("media_storage.retry_local"),
      media_storage_provider: "local",
      media_storage_fallback: true
    }, status: :unprocessable_entity
  end

  def recover_s3_upload(error)
    return false unless UploadStorage.invalid_s3_configuration_error?(error)

    config = Config.new
    return false unless config.get("media_storage_provider") == "s3"
    return false unless config.set("media_storage_provider", "local")

    render_storage_recovery
    true
  end
end
