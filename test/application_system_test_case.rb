# frozen_string_literal: true

require "test_helper"
require "capybara/rails"
require "capybara/minitest"

class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  # Disable parallelization for system tests to avoid race conditions
  parallelize(workers: 1)

  driven_by :selenium, using: :headless_chrome, screen_size: [ 1400, 900 ] do |options|
    options.add_argument("--no-sandbox") if ENV["CHROME_NO_SANDBOX"] == "1"
  end

  # Increase default wait time for slower CI environments
  Capybara.default_max_wait_time = 5

  def setup
    @original_auth_token = ENV["FRANKMD_AUTH_TOKEN"]
    ENV["FRANKMD_AUTH_TOKEN"] = ""
    setup_test_notes_dir
  end

  def teardown
    teardown_test_notes_dir
    ENV["FRANKMD_AUTH_TOKEN"] = @original_auth_token
  end

  private

  def wait_for_tree_refresh(path)
    Timeout.timeout(5) do
      sleep 0.05 until page.evaluate_script(<<~JS)
        performance.getEntriesByType("resource").some((entry) => {
          const url = new URL(entry.name);
          return url.pathname === "/notes/tree" && url.searchParams.get("selected") === #{path.to_json};
        })
      JS
    end
  end

  # Helper to get the CodeMirror editor content via Stimulus controller
  def editor_content
    page.evaluate_script(<<~JS)
      (function() {
        var el = document.querySelector('[data-controller~="codemirror"]');
        if (!el) return null;
        var ctrl = window.Stimulus.getControllerForElementAndIdentifier(el, 'codemirror');
        return ctrl ? ctrl.getValue() : null;
      })()
    JS
  end
end
