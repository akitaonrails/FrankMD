# frozen_string_literal: true

class LibraryController < ApplicationController
  # GET /library
  def index
    render json: MediaLibraryService.new.list
  end
end
