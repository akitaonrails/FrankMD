# frozen_string_literal: true

class LibraryController < ApplicationController
  # GET /library
  def index
    render json: MediaLibraryService.new.list
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
    if MediaLibraryService.new.delete(params[:path])
      head :no_content
    else
      render json: { error: t("library.media_not_found") }, status: :not_found
    end
  rescue SystemCallError => e
    Rails.logger.error "Library media deletion failed: #{e.class} - #{e.message}"
    render json: { error: t("library.delete_failed") }, status: :unprocessable_entity
  end
end
