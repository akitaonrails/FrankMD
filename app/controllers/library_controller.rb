# frozen_string_literal: true

class LibraryController < ApplicationController
  # GET /library
  def index
    render json: MediaLibraryService.new.list
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
