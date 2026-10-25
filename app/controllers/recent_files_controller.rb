# frozen_string_literal: true

class RecentFilesController < ApplicationController
  def index
    render partial: "notes/recent_files", locals: { recent_files: history.entries }
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
