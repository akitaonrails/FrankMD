# frozen_string_literal: true

class AiController < ApplicationController
  # GET /ai/config
  def status
    render json: AiService.provider_info
  end

  # POST /ai/fix_grammar
  def fix_grammar
    path = params[:path].to_s

    if path.blank?
      return render json: { error: t("errors.no_file_provided") }, status: :bad_request
    end

    # Read the file content from disk
    begin
      note = Note.find(path)
      text = note.content
    rescue NotesService::NotFoundError
      return render json: { error: t("errors.note_not_found") }, status: :not_found
    end

    if text.blank?
      return render json: { error: t("errors.note_is_empty") }, status: :bad_request
    end

    result = AiService.fix_grammar(text)

    if result[:error]
      render json: { error: result[:error] }, status: :unprocessable_entity
    else
      render json: {
        original: text,
        corrected: result[:corrected],
        provider: result[:provider],
        model: result[:model]
      }
    end
  end

  # GET /ai/image_config
  def image_config
    render json: AiService.image_generation_info
  end

  # POST /ai/generate_image
  def generate_image
    prompt = params[:prompt].to_s
    reference_image_path = params[:reference_image_path].to_s.presence

    if prompt.blank?
      return render json: { error: t("errors.no_prompt_provided") }, status: :bad_request
    end

    result = AiService.generate_image(prompt, reference_image_path: reference_image_path)

    if result[:error]
      render json: { error: result[:error] }, status: :unprocessable_entity
    else
      render json: result
    end
  end
end
