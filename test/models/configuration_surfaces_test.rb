# frozen_string_literal: true

require "test_helper"

class ConfigurationSurfacesTest < ActiveSupport::TestCase
  test "Google Custom Search environment variables are forwarded by every deployment surface" do
    expectations = {
      ".env.example" => %w[GOOGLE_API_KEY= GOOGLE_CSE_ID= GOOGLE_CSE_ENDPOINT=],
      "docker-compose.yml" => [
        "GOOGLE_API_KEY=${GOOGLE_API_KEY:-}",
        "GOOGLE_CSE_ID=${GOOGLE_CSE_ID:-}",
        "GOOGLE_CSE_ENDPOINT=${GOOGLE_CSE_ENDPOINT:-}"
      ],
      "config/fed/env.example" => %w[GOOGLE_API_KEY= GOOGLE_CSE_ID= GOOGLE_CSE_ENDPOINT=],
      "config/fed/fed.sh" => %w[GOOGLE_API_KEY GOOGLE_CSE_ID GOOGLE_CSE_ENDPOINT],
      "config/fed/fed.fish" => %w[GOOGLE_API_KEY GOOGLE_CSE_ID GOOGLE_CSE_ENDPOINT]
    }

    expectations.each do |relative_path, variables|
      contents = Rails.root.join(relative_path).read
      variables.each do |variable|
        assert_includes contents, variable, "#{relative_path} must forward #{variable}"
      end
    end
  end
end
