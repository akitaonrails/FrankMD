# frozen_string_literal: true

class LibraryController < ApplicationController
  include MediaStorageRecovery
  # GET /library/picker
  def picker
    result = ImageLibraryService.new.list(
      collection: params[:collection].presence || "managed", search: params[:search].to_s,
      limit: params[:limit].presence || 10, offset: params[:offset]
    )
    render turbo_stream: turbo_stream.replace("image-picker-library-results", partial: "notes/dialogs/image_library_results", locals: { result: result })
  rescue ArgumentError
    head :bad_request
  rescue SystemCallError => e
    Rails.logger.error "Image Library load failed: #{e.class} - #{e.message}"
    head :unprocessable_entity
  end

  # GET /library
  def index
    render json: media_library.list
  end

  # GET /library/usage
  def usage
    usage_index = MediaUsageService.new.build_index
    if params[:path].is_a?(String)
      render json: { usage_notes: usage_index.fetch(params[:path], []) }
    else
      usage_counts = usage_index.transform_values(&:length)
      render json: { usage_counts: usage_counts }
    end
  rescue MediaUsageService::ScanError, SystemCallError => e
    Rails.logger.error "Library media usage scan failed: #{e.class} - #{e.message}"
    render json: { error: t("library.usage_scan_failed") }, status: :service_unavailable
  end

  # DELETE /library/file/*path
  def destroy
    if media_library.delete(params[:path])
      head :no_content
    else
      render json: { error: t("library.media_not_found") }, status: :not_found
    end
  rescue SystemCallError => e
    Rails.logger.error "Library media deletion failed: #{e.class} - #{e.message}"
    render json: { error: t("library.delete_failed") }, status: :unprocessable_entity
  end

  # PATCH /library/file/*path
  def rename
    result = media_library.respond_to?(:rename) && media_library.rename(params[:path], params[:name])
    if result
      render json: result
    else
      render json: { error: t("library.rename_failed") }, status: :unprocessable_entity
    end
  rescue SystemCallError, Aws::S3::Errors::ServiceError => e
    Rails.logger.error "Library media rename failed: #{e.class} - #{e.message}"
    render json: { error: t("library.rename_failed") }, status: :unprocessable_entity
  end

  private

  def media_library
    @media_library ||= begin
      config = Config.new
      recover_media_storage(config)
      config.get("media_storage_provider") == "s3" ? S3MediaLibraryService.new(config: config) : MediaLibraryService.new(config: config)
    end
  end
end
