# frozen_string_literal: true

class RecentFilesController < ApplicationController
  def index
    # The Home panel fetches this without a JSON Accept header; an explicit
    # formats render keeps stray JSON accept-headers from hunting for a
    # nonexistent :json partial (500) instead of answering the HTML panel.
    render partial: "notes/recent_files", locals: { recent_files: history.entries }, formats: :html
  end

  def create
    if history.record(params[:path])
      head :no_content
    else
      head :service_unavailable
    end
  rescue NotesService::NotFoundError
    head :not_found
  end

  def destroy
    head(history.clear ? :no_content : :service_unavailable)
  end

  private

  def history
    @history ||= RecentFilesService.new
  end
end
