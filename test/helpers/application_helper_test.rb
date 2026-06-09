# frozen_string_literal: true

require "test_helper"

class ApplicationHelperTest < ActionView::TestCase
  include ApplicationHelper

  test "app_version returns the FrankMD version constant" do
    assert_equal FrankMD::VERSION, app_version
  end
end
