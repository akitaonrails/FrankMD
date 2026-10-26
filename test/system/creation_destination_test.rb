# frozen_string_literal: true

require "application_system_test_case"

class CreationDestinationTest < ApplicationSystemTestCase
  test "toolbar creation uses the selected folder and previews Hugo posts in blog" do
    FileUtils.mkdir_p(@test_notes_dir.join("docs/nested"))
    visit root_url
    find('.tree-item[data-type="folder"][data-path="docs"]').click
    find('.tree-item[data-type="folder"][data-path="docs/nested"]').click
    find('button[title="New Note (Ctrl+N)"]').click
    within "dialog[open]" do
      fill_in placeholder: "Note name", with: "Sample"
      assert_text "docs/nested/Sample.md"
      find('[data-template="hugo"]').click
      assert_text %r{blog/\d{4}/\d{2}/\d{2}/sample/index\.md}
      find('[data-template="empty"]').click
      assert_text "docs/nested/Sample.md"
      click_button "Create"
    end
    assert_selector '.tree-item[data-path="docs/nested/Sample.md"]'
    assert @test_notes_dir.join("docs/nested/Sample.md").file?

    find('.tree-item[data-type="folder"][data-path="docs/nested"]').click
    find('button[title="New Folder"]').click
    within "dialog[open]" do
      assert_text "docs/nested"
      fill_in placeholder: "Folder name", with: "child"
      click_button "Create"
    end
    assert_selector '.tree-item[data-path="docs/nested/child"]', visible: :all
    assert @test_notes_dir.join("docs/nested/child").directory?
  end

  test "flat Hugo posts use blog from the toolbar and preserve explicit folder destinations" do
    original_path_style = ENV["HUGO_PATH_STYLE"]
    ENV["HUGO_PATH_STYLE"] = "flat"
    FileUtils.mkdir_p(@test_notes_dir.join("docs"))
    visit root_url
    find('.tree-item[data-type="folder"][data-path="docs"]').click
    find('button[title="New Note (Ctrl+N)"]').click
    within "dialog[open]" do
      fill_in placeholder: "Note name", with: "My Post"
      find('[data-template="hugo"]').click
      assert_text "blog/my-post.md"
      click_button "Create"
    end
    assert_selector '.tree-item[data-path="blog/my-post.md"]'
    assert @test_notes_dir.join("blog/my-post.md").file?
    assert_not @test_notes_dir.join("my-post.md").exist?
    assert_not @test_notes_dir.join("docs/my-post.md").exist?

    find('.tree-item[data-type="folder"][data-path="docs"]').right_click
    within '[data-file-operations-target="contextMenu"]' do
      find('[data-action="click->file-operations#newNoteInFolder"]').click
    end
    within "dialog[open]" do
      fill_in placeholder: "Note name", with: "Explicit Post"
      find('[data-template="hugo"]').click
      assert_text "docs/explicit-post.md"
      click_button "Create"
    end
    assert_selector '.tree-item[data-path="docs/explicit-post.md"]'
    assert @test_notes_dir.join("docs/explicit-post.md").file?
    assert_not @test_notes_dir.join("blog/explicit-post.md").exist?
  ensure
    ENV["HUGO_PATH_STYLE"] = original_path_style
  end
end
