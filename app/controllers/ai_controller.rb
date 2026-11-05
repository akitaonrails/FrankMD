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

    unless visible_markdown_note_path?(path)
      return render json: { error: t("errors.note_not_found") }, status: :not_found
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

  private

  def visible_markdown_note_path?(path)
    return false unless path.end_with?(".md")
    return false if path.include?("\\") || path.include?("\0")

    pathname = Pathname.new(path)
    return false if pathname.absolute?

    segments = path.split("/", -1)
    return false if segments.any? { |segment| segment.blank? || segment == "." || segment == ".." || segment.start_with?(".") }

    notes_path = Pathname.new(ENV.fetch("NOTES_PATH", Rails.root.join("notes")))
    PathSafety.contain(notes_path, path).present?
  rescue ArgumentError
    false
  end
end
