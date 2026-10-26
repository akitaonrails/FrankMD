# frozen_string_literal: true

require "application_system_test_case"

class HomeRecentFilesTest < ApplicationSystemTestCase
  test "Home shows five recent notes and reveals the rest with Show more" do
    7.times do |index|
      path = "note-#{index}.md"
      create_test_note(path, "# Note #{index}")
      RecentFilesService.new.record(path)
    end

    visit root_url
    assert_selector "#home-title", text: "FrankMD"
    assert_selector ".home-recent-list a", count: 5
    assert_selector ".home-file-time[datetime]", count: 5
    assert_button "Show more"

    click_button "Show more"
    assert_selector ".home-recent-list a", count: 7
    assert_no_button "Show more"
    assert_button "Show less"
    assert_equal "note-1.md", page.evaluate_script("document.activeElement.dataset.path")

    click_button "Show less"
    assert_selector ".home-recent-list a", count: 5
    assert_no_button "Show less"
    assert_equal "Show more", page.evaluate_script("document.activeElement.textContent")
    click_button "Show more"

    find('.home-recent-list a[data-path="note-0.md"]').click
    assert_selector ".cm-content", text: "Note 0"
  end

  test "Home shares successful opens across visits and filters external deletions" do
    create_test_note("docs/first.md", "# First")
    create_test_note("second.md", "# Second")
    visit note_url(path: "docs/first.md")
    assert_selector ".cm-content", text: "First"
    wait_for_tree_refresh("docs/first.md")
    find('.workspace-brand[href="/"]').click
    assert_selector "#home-title", text: "FrankMD"
    assert_selector '.home-recent-list a[data-path="docs/first.md"]'
    assert_no_selector '[data-preview-target="panel"]:not(.hidden)'

    visit note_url(path: "second.md")
    assert_selector ".cm-content", text: "Second"
    wait_for_tree_refresh("second.md")
    find('.workspace-brand[href="/"]').click
    assert_selector '.home-recent-list a[data-path="second.md"]'
    assert_selector '.home-recent-list a[data-path="docs/first.md"]'
    assert_equal "second.md", find(".home-recent-list a", match: :first)["data-path"]
    @test_notes_dir.join("docs/first.md").delete
    visit root_url
    assert_selector '.home-recent-list a[data-path="second.md"]'
    assert_no_selector '.home-recent-list a[data-path="docs/first.md"]'
    assert_no_text "Translation missing"

    # External deletion after the list was rendered must never recreate a note.
    @test_notes_dir.join("second.md").delete
    find('.home-recent-list a[data-path="second.md"]').click
    assert_text "Note not found"
    find('header a[aria-label="Home"]').click
    assert_selector "#home-title"
    assert_no_selector ".home-recent-list a"
    refute @test_notes_dir.join("second.md").exist?
  end

  test "Home remains reachable with Explorer hidden on mobile" do
    page.driver.browser.manage.window.resize_to(390, 844)
    create_test_note("mobile.md", "# Mobile")
    visit note_url(path: "mobile.md")
    assert_selector ".cm-content", text: "Mobile"
    wait_for_tree_refresh("mobile.md")
    find('header a[aria-label="Home"]').click
    assert_selector "#home-title", text: "FrankMD"
    assert_selector '.home-recent-list a[data-path="mobile.md"]'
    assert_operator page.evaluate_script("document.documentElement.scrollWidth"), :<=, 390
  ensure
    page.driver.browser.manage.window.resize_to(1400, 900)
  end
end
