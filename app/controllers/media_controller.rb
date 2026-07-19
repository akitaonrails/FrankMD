# frozen_string_literal: true

class MediaController < ApplicationController
  skip_forgery_protection only: [ :upload ]

  # POST /media/upload
  # Upload a video file from browser drag-and-drop
  def upload
    file = params[:file]
    upload_to_s3 = params[:upload_to_s3] == "true"

    unless file.present?
      return render json: { error: t("errors.no_file_upload") }, status: :unprocessable_entity
    end

    result = MediaService.save_upload(file, upload_to_s3: upload_to_s3, s3_prefix: params[:s3_prefix])

    if result[:url]
      render json: { url: result[:url] }
    else
      render json: { error: result[:error] || t("errors.upload_failed") }, status: :unprocessable_entity
    end
  rescue StandardError => e
    Rails.logger.error "Media upload error: #{e.class} - #{e.message}"
    Rails.logger.error e.backtrace.first(10).join("\n")
    render json: { error: t("errors.upload_failed") }, status: :unprocessable_entity
  end
end
