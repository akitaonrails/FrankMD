# frozen_string_literal: true

require "application_system_test_case"

class PreviewImageViewerTest < ApplicationSystemTestCase
  test "images open through keyboard and close through Escape with focus restored" do
    open_preview
    trigger = find(".preview-image-trigger")
    trigger.send_keys(:enter)
    assert_selector "dialog.image-viewer[open]"
    assert_selector ".image-viewer-image:not([hidden])"
    assert_selector ".image-viewer-close:focus"
    assert_equal "Example", find(".image-viewer-image")["alt"]
    page.driver.browser.action.send_keys(:escape).perform
    assert_no_selector "dialog.image-viewer[open]"
    assert_selector ".preview-image-trigger:focus"

    trigger.click
    within "dialog.image-viewer[open]" do
      find('button[aria-label="Close"]').click
    end
    assert_no_selector "dialog.image-viewer[open]"
    assert_selector ".preview-image-trigger:focus"
    assert_equal "/notes/images.md", page.current_path
    wait_for_tree_refresh("images.md")
  end

  test "linked image keeps navigation and its enlarge control fits mobile viewport" do
    page.driver.browser.manage.window.resize_to(390, 844)
    open_preview
    linked = find('[data-preview-target="content"] a[href="/notes/target.md"]')
    assert linked.has_selector?("img")
    assert_no_selector '[data-preview-target="content"] a button'
    find(".preview-image-enlarge").click
    assert_selector "dialog.image-viewer[open]"
    assert_selector ".image-viewer-image:not([hidden])"
    dimensions = page.evaluate_script(<<~JS)
      (() => {
        const bounds = document.querySelector('dialog.image-viewer').getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      })()
    JS
    assert_operator dimensions.fetch("width"), :<=, 390
    assert_operator dimensions.fetch("height"), :<=, 844
    within "dialog.image-viewer[open]" do
      find('button[aria-label="Close"]').click
    end
    linked.click
    assert_selector ".cm-content", text: "Target"
    wait_for_tree_refresh("target.md")
  ensure
    page.driver.browser.manage.window.resize_to(1400, 900)
  end

  private

  def open_preview
    create_test_note("target.md", "# Target")
    create_test_note("images.md", "![Example](/icon.svg)\n\n[![Linked](/icon.svg)](/notes/target.md)")
    visit note_url(path: "images.md")
    assert_selector ".cm-content", text: "Example"
    find('[data-app-target="previewToggle"]').click
    assert_selector ".preview-image-trigger"
  end
end
