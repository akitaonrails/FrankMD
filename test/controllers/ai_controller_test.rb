# frozen_string_literal: true

require "test_helper"

class AiControllerTest < ActionDispatch::IntegrationTest
  def setup
    setup_test_notes_dir
    # Save and clear all AI-related env vars
    @original_env = {}
    %w[
      OPENAI_API_KEY OPENROUTER_API_KEY ANTHROPIC_API_KEY
      GEMINI_API_KEY OLLAMA_API_BASE AI_PROVIDER AI_MODEL
      OPENAI_MODEL OPENROUTER_MODEL ANTHROPIC_MODEL GEMINI_MODEL OLLAMA_MODEL
      IMAGE_GENERATION_MODEL
    ].each do |key|
      @original_env[key] = ENV[key]
      ENV.delete(key)
    end
  end

  def teardown
    teardown_test_notes_dir
    # Restore original env vars
    @original_env.each do |key, value|
      if value
        ENV[key] = value
      else
        ENV.delete(key)
      end
    end
  end

  # Config endpoint tests
  test "config returns enabled false when no API keys" do
    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal false, data["enabled"]
    assert_nil data["provider"]
    assert_nil data["model"]
    assert_empty data["available_providers"]
  end

  test "config returns enabled true when OpenAI key is set" do
    ENV["OPENAI_API_KEY"] = "sk-test-key"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
    assert_equal "openai", data["provider"]
    assert_equal "gpt-4o-mini", data["model"]
    assert_includes data["available_providers"], "openai"
  end

  test "config returns enabled true when OpenRouter key is set" do
    ENV["OPENROUTER_API_KEY"] = "sk-or-test-key"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
    assert_equal "openrouter", data["provider"]
    assert_equal "openai/gpt-4o-mini", data["model"]
  end

  test "config returns enabled true when Anthropic key is set" do
    ENV["ANTHROPIC_API_KEY"] = "sk-ant-test-key"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
    assert_equal "anthropic", data["provider"]
    assert_equal "claude-sonnet-4-20250514", data["model"]
  end

  test "config returns enabled true when Gemini key is set" do
    ENV["GEMINI_API_KEY"] = "gemini-test-key"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
    assert_equal "gemini", data["provider"]
    assert_equal "gemini-2.0-flash", data["model"]
  end

  test "config returns enabled true when Ollama base is set" do
    ENV["OLLAMA_API_BASE"] = "http://localhost:11434"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
    assert_equal "ollama", data["provider"]
    assert_equal "llama3.2:latest", data["model"]
  end

  test "config returns correct priority with multiple providers" do
    ENV["OLLAMA_API_BASE"] = "http://localhost:11434"
    ENV["OPENAI_API_KEY"] = "sk-test"
    ENV["ANTHROPIC_API_KEY"] = "sk-ant-test"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "openai", data["provider"]  # Highest priority
    assert_equal 3, data["available_providers"].size
    assert_includes data["available_providers"], "ollama"
    assert_includes data["available_providers"], "openai"
    assert_includes data["available_providers"], "anthropic"
  end

  test "config respects ai_provider override" do
    ENV["OLLAMA_API_BASE"] = "http://localhost:11434"
    ENV["OPENAI_API_KEY"] = "sk-test"
    ENV["AI_PROVIDER"] = "openai"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "openai", data["provider"]
  end

  test "config respects ai_model override" do
    ENV["OPENAI_API_KEY"] = "sk-test"
    ENV["AI_MODEL"] = "gpt-4-turbo"

    get "/ai/config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal "gpt-4-turbo", data["model"]
  end

  # Fix grammar endpoint tests
  test "fix_grammar returns error when path is blank" do
    post "/ai/fix_grammar", params: { path: "" }, as: :json
    assert_response :bad_request

    data = JSON.parse(response.body)
    assert_includes data["error"], "No file path"
  end

  test "fix_grammar rejects paths outside the visible markdown note boundary before reading" do
    Note.expects(:find).never
    AiService.expects(:fix_grammar).never

    [ ".fed", ".hidden/x.md", "../x.md", "notes.txt", "folder//note.md", "folder\\note.md" ].each do |path|
      post "/ai/fix_grammar", params: { path: path }, as: :json

      assert_response :not_found
      assert_includes JSON.parse(response.body)["error"], "not found"
    end
  end

  test "fix_grammar accepts visible markdown notes at the root and in folders" do
    create_test_note("root.md", "Root text")
    create_test_note("folder/nested.md", "Nested text")
    AiService.expects(:fix_grammar).with("Root text").returns(corrected: "Root corrected", provider: "test", model: "test")
    AiService.expects(:fix_grammar).with("Nested text").returns(corrected: "Nested corrected", provider: "test", model: "test")

    post "/ai/fix_grammar", params: { path: "root.md" }, as: :json
    assert_response :success
    assert_equal "Root corrected", JSON.parse(response.body)["corrected"]

    post "/ai/fix_grammar", params: { path: "folder/nested.md" }, as: :json
    assert_response :success
    assert_equal "Nested corrected", JSON.parse(response.body)["corrected"]
  end

  test "fix_grammar returns error when note not found" do
    post "/ai/fix_grammar", params: { path: "nonexistent.md" }, as: :json
    assert_response :not_found

    data = JSON.parse(response.body)
    assert_includes data["error"], "not found"
  end

  test "fix_grammar returns error when note is empty" do
    # Create an empty note
    note = Note.new(path: "empty.md", content: "")
    note.save

    post "/ai/fix_grammar", params: { path: "empty.md" }, as: :json
    assert_response :bad_request

    data = JSON.parse(response.body)
    assert_includes data["error"], "empty"
  end

  test "fix_grammar returns error when AI not configured" do
    # Create a note with content
    note = Note.new(path: "test.md", content: "Hello world")
    note.save

    post "/ai/fix_grammar", params: { path: "test.md" }, as: :json
    assert_response :unprocessable_entity

    data = JSON.parse(response.body)
    assert_includes data["error"], "not configured"
  end

  # Image config endpoint tests
  test "image_config returns enabled false when no OpenRouter key" do
    get "/ai/image_config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal false, data["enabled"]
    assert_equal "google/gemini-3.1-flash-image-preview", data["model"]
  end

  test "image_config returns enabled true when OpenRouter key is set" do
    ENV["OPENROUTER_API_KEY"] = "sk-or-test-key"

    get "/ai/image_config", as: :json
    assert_response :success

    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
    assert_equal "google/gemini-3.1-flash-image-preview", data["model"]
  end

  # Generate image endpoint tests
  test "generate_image returns error when prompt is blank" do
    post "/ai/generate_image", params: { prompt: "" }, as: :json
    assert_response :bad_request

    data = JSON.parse(response.body)
    assert_includes data["error"], "No prompt"
  end

  test "generate_image returns error when not configured" do
    post "/ai/generate_image", params: { prompt: "A sunset" }, as: :json
    assert_response :unprocessable_entity

    data = JSON.parse(response.body)
    assert_includes data["error"], "not configured"
  end
end
