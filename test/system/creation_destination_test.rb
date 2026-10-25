# frozen_string_literal: true

require "application_system_test_case"

class CreationDestinationTest < ApplicationSystemTestCase
  test "toolbar creation uses the selected folder and Hugo ignores inferred parents" do
    FileUtils.mkdir_p(@test_notes_dir.join("docs/nested"))
    visit root_url
    find('.tree-item[data-type="folder"][data-path="docs"]').click
    find('.tree-item[data-type="folder"][data-path="docs/nested"]').click
    find('button[title="New Note (Ctrl+N)"]').click
    within "dialog[open]" do
      fill_in placeholder: "Note name", with: "Sample"
      assert_text "docs/nested/Sample.md"
      find('[data-template="hugo"]').click
      assert_no_text "docs/nested"
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
end
