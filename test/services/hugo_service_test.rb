# frozen_string_literal: true

require "test_helper"

class HugoServiceTest < ActiveSupport::TestCase
  def setup
    setup_test_notes_dir
  end

  def teardown
    teardown_test_notes_dir
  end

  # === slugify ===

  test "slugify converts text to lowercase" do
    assert_equal "hello-world", HugoService.slugify("Hello World")
  end

  test "slugify replaces spaces with hyphens" do
    assert_equal "hello-world", HugoService.slugify("hello world")
  end

  test "slugify handles accented characters" do
    assert_equal "cafe-acai", HugoService.slugify("café açaí")
  end

  test "slugify handles special characters" do
    assert_equal "hello-world", HugoService.slugify("hello! @world#")
  end

  test "slugify collapses multiple hyphens" do
    assert_equal "hello-world", HugoService.slugify("hello---world")
  end

  test "slugify removes leading and trailing hyphens" do
    assert_equal "hello-world", HugoService.slugify("--hello-world--")
  end

  test "slugify handles Portuguese characters" do
    assert_equal "vibe-code-fiz-um-editor-de-markdown-do-zero-com-claude-code-frankmd",
                 HugoService.slugify("Vibe Code: Fiz um Editor de Markdown do zero com Claude Code (FrankMD)")
  end

  # === generate_blog_post ===

  test "generate_blog_post returns path with date structure" do
    result = HugoService.generate_blog_post("My Blog Post")

    # Path should match YYYY/MM/DD/slug/index.md pattern
    assert_match %r{\d{4}/\d{2}/\d{2}/my-blog-post/index\.md}, result[:path]
  end

  test "generate_blog_post returns content with frontmatter" do
    result = HugoService.generate_blog_post("My Blog Post")

    assert result[:content].start_with?("---")
    assert_includes result[:content], 'title: "My Blog Post"'
    assert_includes result[:content], 'slug: "my-blog-post"'
    assert_includes result[:content], "draft: true"
  end

  test "generate_blog_post uses current date" do
    travel_to Time.zone.local(2026, 2, 1, 10, 30, 0) do
      result = HugoService.generate_blog_post("Test Post")

      assert result[:path].start_with?("2026/02/01/")
      assert_includes result[:content], "date: 2026-02-01T10:30:00"
    end
  end

  test "generate_blog_post prepends parent path when provided" do
    result = HugoService.generate_blog_post("My Post", parent: "content/posts")

    assert result[:path].start_with?("content/posts/")
    assert_match %r{content/posts/\d{4}/\d{2}/\d{2}/my-post/index\.md}, result[:path]
  end

  test "generate_blog_post with flat path style returns slug.md" do
    result = HugoService.generate_blog_post("My Blog Post", path_style: "flat")

    assert_equal "my-blog-post.md", result[:path]
  end

  test "generate_blog_post with flat path style prepends parent path" do
    result = HugoService.generate_blog_post("My Post", parent: "content/posts", path_style: "flat")

    assert_equal "content/posts/my-post.md", result[:path]
  end

  test "generate_blog_post with flat path style includes frontmatter" do
    result = HugoService.generate_blog_post("My Post", path_style: "flat")

    assert result[:content].start_with?("---")
    assert_includes result[:content], 'title: "My Post"'
    assert_includes result[:content], 'slug: "my-post"'
    assert_includes result[:content], "draft: true"
  end

  test "generate_blog_post with dated path style returns date structure" do
    result = HugoService.generate_blog_post("My Post", path_style: "dated")

    assert_match %r{\d{4}/\d{2}/\d{2}/my-post/index\.md}, result[:path]
  end

  test "generate_blog_post reads path_style from config" do
    config_stub = stub
    config_stub.stubs(:get).returns(nil)
    config_stub.stubs(:get).with("hugo_path_style").returns("flat")
    Config.stubs(:new).returns(config_stub)

    result = HugoService.generate_blog_post("Config Test")

    assert_equal "config-test.md", result[:path]
  end

  test "generate_blog_post defaults to dated when config not set" do
    config_stub = stub
    config_stub.stubs(:get).returns(nil)
    config_stub.stubs(:get).with("hugo_path_style").returns(nil)
    Config.stubs(:new).returns(config_stub)

    result = HugoService.generate_blog_post("Config Test")

    assert_match %r{\d{4}/\d{2}/\d{2}/config-test/index\.md}, result[:path]
  end

  test "generate_blog_post escapes quotes in title" do
    result = HugoService.generate_blog_post('Say "Hello" World')

    assert_includes result[:content], 'title: "Say \\"Hello\\" World"'
  end

  test "generate_blog_post emits a valid empty tags list, not a bare hyphen" do
    result = HugoService.generate_blog_post("My Post")

    assert_includes result[:content], "tags: []"
    # A bare `-` under `tags:` creates a null list entry that breaks Hugo (issue #69)
    refute_match(/tags:\s*\n\s*-\s*\n/, result[:content])
  end

  # === custom template (.hugo_template.md) ===

  test "generate_blog_post uses .hugo_template.md when present" do
    @test_notes_dir.join(HugoService::TEMPLATE_FILE).write(<<~TPL)
      ---
      title: "{{title}}"
      slug: "{{slug}}"
      date: {{date}}
      draft: false
      author: "Jane"
      tags:
        - uncategorized
      ---
    TPL

    travel_to Time.zone.local(2026, 2, 1, 10, 30, 0) do
      result = HugoService.generate_blog_post("Custom Post")

      assert_includes result[:content], 'title: "Custom Post"'
      assert_includes result[:content], 'slug: "custom-post"'
      assert_includes result[:content], "date: 2026-02-01T10:30:00"
      assert_includes result[:content], 'author: "Jane"'
      assert_includes result[:content], "- uncategorized"
      assert_includes result[:content], "draft: false"
    end
  end

  test "generate_blog_post escapes quotes in title within custom template" do
    @test_notes_dir.join(HugoService::TEMPLATE_FILE).write(%(title: "{{title}}"\n))

    result = HugoService.generate_blog_post('Say "Hi"')

    assert_includes result[:content], 'title: "Say \\"Hi\\""'
  end

  test "generate_blog_post falls back to default template when none present" do
    result = HugoService.generate_blog_post("No Template")

    assert_includes result[:content], "draft: true"
    assert_includes result[:content], "tags: []"
  end

  # === update_frontmatter_slug ===

  test "update_frontmatter_slug updates slug in frontmatter" do
    content = <<~FRONTMATTER
      ---
      title: "Test"
      slug: "old-slug"
      date: 2026-02-01
      ---

      Content
    FRONTMATTER

    result = HugoService.update_frontmatter_slug(content, "new-slug")

    assert_includes result, 'slug: "new-slug"'
    refute_includes result, 'slug: "old-slug"'
    assert_includes result, "Content"
  end

  test "update_frontmatter_slug returns nil for content without frontmatter" do
    content = "Just some regular content"
    result = HugoService.update_frontmatter_slug(content, "new-slug")

    assert_nil result
  end

  test "update_frontmatter_slug returns nil for frontmatter without slug" do
    content = <<~FRONTMATTER
      ---
      title: "Test"
      date: 2026-02-01
      ---

      Content
    FRONTMATTER

    result = HugoService.update_frontmatter_slug(content, "new-slug")

    assert_nil result
  end

  test "update_frontmatter_slug returns nil when slug unchanged" do
    content = <<~FRONTMATTER
      ---
      title: "Test"
      slug: "same-slug"
      ---

      Content
    FRONTMATTER

    result = HugoService.update_frontmatter_slug(content, "same-slug")

    assert_nil result
  end

  test "update_frontmatter_slug handles unquoted slugs" do
    content = <<~FRONTMATTER
      ---
      title: "Test"
      slug: old-slug
      ---

      Content
    FRONTMATTER

    result = HugoService.update_frontmatter_slug(content, "new-slug")

    assert_includes result, 'slug: "new-slug"'
  end

  test "update_frontmatter_slug handles single-quoted slugs" do
    content = <<~FRONTMATTER
      ---
      title: "Test"
      slug: 'old-slug'
      ---

      Content
    FRONTMATTER

    result = HugoService.update_frontmatter_slug(content, "new-slug")

    assert_includes result, 'slug: "new-slug"'
  end
end
