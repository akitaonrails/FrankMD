# frozen_string_literal: true

require "test_helper"

class BacklinksServiceTest < ActiveSupport::TestCase
  def setup
    setup_test_notes_dir
    @service = BacklinksService.new(base_path: @test_notes_dir)
  end

  def teardown
    teardown_test_notes_dir
  end

  test "returns empty array when no backlinks exist" do
    create_test_note("target.md", "# Target note")
    create_test_note("other.md", "# Unrelated note")

    results = @service.find_backlinks("target.md")
    assert_equal [], results
  end

  test "finds wikilink backlinks by name" do
    create_test_note("target.md", "# Target note")
    create_test_note("source.md", "Links to [[target]] here")

    results = @service.find_backlinks("target.md")
    assert_equal 1, results.size
    assert_equal "source.md", results.first[:path]
    assert_includes results.first[:match_text], "[[target]]"
  end

  test "finds wikilink backlinks with .md extension" do
    create_test_note("target.md", "# Target")
    create_test_note("source.md", "Links to [[target.md]] here")

    results = @service.find_backlinks("target.md")
    assert_equal 1, results.size
  end

  test "finds wikilink backlinks case-insensitively" do
    create_test_note("Target.md", "# Target")
    create_test_note("source.md", "Links to [[target]] here")

    results = @service.find_backlinks("Target.md")
    assert_equal 1, results.size
  end

  test "finds wikilink backlinks by full path" do
    create_test_folder("projects")
    create_test_note("projects/myproject.md", "# My Project")
    create_test_note("index.md", "See [[projects/myproject]] for details")

    results = @service.find_backlinks("projects/myproject.md")
    assert_equal 1, results.size
    assert_equal "index.md", results.first[:path]
  end

  test "finds standard markdown link backlinks" do
    create_test_note("target.md", "# Target")
    create_test_note("source.md", "Check [this link](target.md) out")

    results = @service.find_backlinks("target.md")
    assert_equal 1, results.size
    assert_includes results.first[:match_text], "[this link](target.md)"
  end

  test "finds markdown link backlinks with path" do
    create_test_folder("docs")
    create_test_note("docs/guide.md", "# Guide")
    create_test_note("readme.md", "See [the guide](docs/guide.md)")

    results = @service.find_backlinks("docs/guide.md")
    assert_equal 1, results.size
  end

  test "skips the target file itself" do
    create_test_note("self.md", "I link to [[self]] in my own content")

    results = @service.find_backlinks("self.md")
    assert_equal [], results
  end

  test "finds multiple backlinks from different files" do
    create_test_note("target.md", "# Target")
    create_test_note("source1.md", "See [[target]]")
    create_test_note("source2.md", "Also [[target]]")
    create_test_note("source3.md", "No link here")

    results = @service.find_backlinks("target.md")
    assert_equal 2, results.size
    paths = results.map { |r| r[:path] }.sort
    assert_equal %w[source1.md source2.md], paths
  end

  test "finds multiple backlinks within same file" do
    create_test_note("target.md", "# Target")
    create_test_note("source.md", "First [[target]] and\nlater [[target]] again")

    results = @service.find_backlinks("target.md")
    assert_equal 2, results.size
    assert_equal [ 1, 2 ], results.map { |r| r[:line_number] }
  end

  test "returns context lines around matches" do
    content = "Line 1\nLine 2\nLink to [[target]] here\nLine 4\nLine 5"
    create_test_note("target.md", "# Target")
    create_test_note("source.md", content)

    results = @service.find_backlinks("target.md", context_lines: 1)
    assert_equal 1, results.size

    context = results.first[:context]
    assert_equal 3, context.size
    assert_equal "Line 2", context[0][:content]
    assert_equal true, context[1][:is_match]
    assert_equal "Line 4", context[2][:content]
  end

  test "returns correct result structure" do
    create_test_note("target.md", "# Target")
    create_test_note("source.md", "See [[target]]")

    results = @service.find_backlinks("target.md")
    result = results.first

    assert_includes result, :path
    assert_includes result, :name
    assert_includes result, :line_number
    assert_includes result, :match_text
    assert_includes result, :context
    assert_equal "source", result[:name]
    assert_equal 1, result[:line_number]
  end
end
