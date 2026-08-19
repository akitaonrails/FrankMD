# frozen_string_literal: true

require "application_system_test_case"

class NotesTest < ApplicationSystemTestCase
  test "visiting the home page shows the app" do
    visit root_url

    assert_selector "header", text: "FrankMD"
    assert_selector "[data-app-target='fileTree']"
  end

  test "empty state shows placeholder message" do
    visit root_url

    assert_selector "[data-app-target='editorPlaceholder']", text: "Select a note to edit"
  end

  test "existing notes appear in the file tree" do
    create_test_note("my_note.md", "# My Note")

    visit root_url

    within "[data-app-target='fileTree']" do
      assert_text "my_note"
    end
  end

  test "clicking a note opens it in the editor" do
    create_test_note("test.md", "# Test Content\n\nHello world")

    visit root_url
    find("[data-path='test.md']").click

    assert_selector "[data-app-target='currentPath']", text: "test"
    assert_selector ".cm-editor", visible: true
  end

  test "creating a new note via dialog" do
    visit root_url

    # Wait for page to fully load
    assert_selector "[data-app-target='fileTree']"

    # Wait for JS to fully initialize
    sleep 0.5

    # Click the new note button using JavaScript for reliability
    page.execute_script("document.querySelector('button[title=\"New Note (Ctrl+N)\"]').click()")

    # The single New Note dialog opens directly (no type-selection step)
    assert_selector "[data-file-operations-target='newNoteDialog'][open]", wait: 3

    # Empty Document is selected by default; fill in the name and create
    within "[data-file-operations-target='newNoteDialog']" do
      assert_selector "[data-template='empty'][aria-pressed='true']"
      fill_in placeholder: "Note name", with: "brand_new_note"
      click_button "Create"
    end

    # Wait for dialog to close and note to be created
    assert_no_selector "dialog[open]", wait: 2

    # Note should appear in tree
    assert_selector "[data-path='brand_new_note.md']", wait: 3
    assert @test_notes_dir.join("brand_new_note.md").exist?
  end

  test "creating a new hugo post via dialog" do
    visit root_url

    # Wait for page to fully load
    assert_selector "[data-app-target='fileTree']"
    sleep 0.5

    page.execute_script("document.querySelector('button[title=\"New Note (Ctrl+N)\"]').click()")

    assert_selector "[data-file-operations-target='newNoteDialog'][open]", wait: 3

    within "[data-file-operations-target='newNoteDialog']" do
      # Switch to the Hugo Blog Post card
      find("[data-template='hugo']").click
      assert_selector "[data-template='hugo'][aria-pressed='true']"

      fill_in placeholder: "Note name", with: "Hello World"
      click_button "Create"
    end

    assert_no_selector "dialog[open]", wait: 2

    # Hugo posts create dated page bundles: YYYY/MM/DD/slug/index.md
    date_path = Time.current.strftime("%Y/%m/%d")
    expected = @test_notes_dir.join(date_path, "hello-world", "index.md")
    assert expected.exist?, "expected #{expected} to exist"
    assert_selector "[data-path='#{date_path}/hello-world/index.md']", wait: 3
  end

  test "creating a new folder via dialog" do
    visit root_url

    # Wait for page to fully load
    assert_selector "[data-app-target='fileTree']"

    # Click the new folder button
    find("button[title='New Folder']").click

    # Wait for dialog to open
    assert_selector "dialog[open]", wait: 2

    # Fill in the dialog
    within "dialog[open]" do
      fill_in placeholder: "Folder name", with: "new_folder"
      click_button "Create"
    end

    # Wait for dialog to close
    assert_no_selector "dialog[open]", wait: 2

    # Folder should appear in tree
    assert_selector "[data-path='new_folder']", wait: 3
    assert @test_notes_dir.join("new_folder").directory?
  end

  test "editing a note updates the textarea" do
    create_test_note("editable.md", "Original content")

    visit root_url
    find("[data-path='editable.md']").click

    # Verify note content is loaded in CodeMirror
    assert_selector ".cm-editor", visible: true
    assert_equal "Original content", editor_content
  end

  test "toggle preview panel" do
    create_test_note("preview_test.md", "# Preview Test\n\nSome **bold** text")

    visit root_url
    find("[data-path='preview_test.md']").click

    # Wait for page to stabilize
    sleep 0.3

    # Preview panel should not be visible initially
    preview_panel = find("[data-app-target='previewPanel']", visible: :all)
    assert preview_panel[:class].include?("hidden"), "Preview panel should be hidden initially"

    # Click toggle preview button using JavaScript (avoids zero-size element issues)
    page.execute_script("document.querySelector('[data-app-target=\"previewToggle\"]').click()")

    # Preview panel should be visible now
    sleep 0.2 # Wait for class toggle
    refute preview_panel[:class].include?("hidden"), "Preview panel should be visible after toggle"

    # Check rendered markdown
    within "[data-app-target='previewContent']" do
      assert_selector "h1", text: "Preview Test"
      assert_selector "strong", text: "bold"
    end
  end

  test "folders can be expanded and collapsed" do
    create_test_folder("my_folder")
    create_test_note("my_folder/nested_note.md")

    visit root_url

    # Folder should be visible
    assert_selector "[data-path='my_folder']"

    # Click to expand
    find("[data-path='my_folder'][data-type='folder']").click

    # Nested note should now be visible
    assert_selector "[data-path='my_folder/nested_note.md']", visible: true

    # Click again to collapse
    find("[data-path='my_folder'][data-type='folder']").click

    # Nested note should be hidden again
    assert_no_selector "[data-path='my_folder/nested_note.md']", visible: true
  end

  test "theme picker can change theme" do
    visit root_url

    # Get initial theme text
    initial_theme = find("[data-theme-target='currentTheme']").text

    # Open theme picker dropdown
    find("button[title='Change Theme']").click

    # Menu should appear
    assert_selector "[data-theme-target='menu']:not(.hidden)", wait: 2

    # Select a different theme (Dark if currently Light, or vice versa)
    within "[data-theme-target='menu']" do
      if initial_theme == "Light"
        find("button", text: "Dark", exact_text: true).click
      else
        find("button", text: "Light", exact_text: true).click
      end
    end

    sleep 0.2

    # Theme should have changed
    new_theme = find("[data-theme-target='currentTheme']").text
    refute_equal initial_theme, new_theme, "Theme should have changed"
  end

  test "context menu appears on right-click" do
    create_test_note("context_test.md")

    visit root_url

    # Right-click on the note
    find("[data-path='context_test.md']").right_click

    # Context menu should appear
    assert_selector "[data-app-target='contextMenu']:not(.hidden)"
    within "[data-app-target='contextMenu']" do
      assert_text "Rename"
      assert_text "Delete"
    end
  end

  test "renaming a note via context menu" do
    create_test_note("old_name.md", "Content")

    visit root_url

    # Right-click and rename
    find("[data-path='old_name.md']").right_click
    within "[data-app-target='contextMenu']" do
      click_button "Rename"
    end

    # Wait for rename dialog
    assert_selector "dialog[open]"

    within "dialog[open]" do
      fill_in with: "new_name"
      click_button "Rename"
    end

    # Wait for dialog to close
    assert_no_selector "dialog[open]"

    # Verify file was renamed
    assert_selector "[data-path='new_name.md']", wait: 3
    assert @test_notes_dir.join("new_name.md").exist?
    refute @test_notes_dir.join("old_name.md").exist?
  end

  test "deleting a note via context menu" do
    create_test_note("to_delete.md")

    visit root_url

    # Right-click and delete
    find("[data-path='to_delete.md']").right_click

    # Accept the confirmation
    accept_confirm do
      within "[data-app-target='contextMenu']" do
        click_button "Delete"
      end
    end

    # Note should be gone
    assert_no_selector "[data-path='to_delete.md']", wait: 3
    refute @test_notes_dir.join("to_delete.md").exist?
  end

  # Table Editor Tests

  test "toolbar appears when editing a note" do
    create_test_note("toolbar_test.md", "# Test")

    visit root_url
    find("[data-path='toolbar_test.md']").click

    # Toolbar should be visible
    assert_selector "[data-app-target='editorToolbar']", visible: true
    assert_selector "button[title='Insert/Edit Table']"
  end

  test "table editor dialog opens and shows grid" do
    create_test_note("table_test.md", "# Table Test")

    visit root_url
    find("[data-path='table_test.md']").click

    # Click table button
    find("button[title='Insert/Edit Table']").click

    # Dialog should open with grid
    assert_selector "dialog[open]"
    assert_selector ".table-editor-grid"
    assert_selector ".table-editor-grid input", minimum: 9  # 3x3 default
  end

  test "table editor can add and remove columns" do
    create_test_note("table_cols.md", "# Columns Test")

    visit root_url
    find("[data-path='table_cols.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Initially 3 columns (9 cells for 3x3)
    assert_selector ".table-editor-grid input", count: 9

    # Add a column
    find("button[title='Add Column']").click
    assert_selector ".table-editor-grid input", count: 12  # 4x3

    # Remove a column
    find("button[title='Remove Column']").click
    assert_selector ".table-editor-grid input", count: 9  # back to 3x3
  end

  test "table editor can add and remove rows" do
    create_test_note("table_rows.md", "# Rows Test")

    visit root_url
    find("[data-path='table_rows.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Initially 3 rows (9 cells for 3x3)
    assert_selector ".table-editor-grid input", count: 9

    # Add a row
    find("button[title='Add Row']").click
    assert_selector ".table-editor-grid input", count: 12  # 3x4

    # Remove a row
    find("button[title='Remove Row']").click
    assert_selector ".table-editor-grid input", count: 9  # back to 3x3
  end

  test "inserting a table adds markdown to content" do
    create_test_note("insert_table.md", "# Insert Test\n\n")

    visit root_url
    find("[data-path='insert_table.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Fill in a cell
    within ".table-editor-grid" do
      first_input = all("input").first
      first_input.fill_in with: "Name"
    end

    # Insert the table
    click_button "Insert Table"

    # Dialog should close
    assert_no_selector "dialog[open]"

    # Editor should contain table markdown
    assert_selector ".cm-editor", visible: true
    content = editor_content
    assert_includes content, "| Name"
    assert_includes content, "| ----"  # Separator row
  end

  test "editing existing table in content" do
    # Create note with existing table
    table_content = <<~MD
      # My Note

      | Col1 | Col2 |
      |------|------|
      | A    | B    |
    MD
    create_test_note("existing_table.md", table_content)

    visit root_url
    find("[data-path='existing_table.md']").click

    # Position cursor in the table via CodeMirror
    assert_selector ".cm-editor", visible: true
    # Click somewhere in the editor to focus it
    find(".cm-content").click

    # Move cursor into the table area using keyboard
    find(".cm-content").send_keys [ :control, :end ]  # Go to end
    find(".cm-content").send_keys [ :up, :up ]  # Move up into table

    # Wait a moment for cursor position check
    sleep 0.2

    # Open table editor
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Should show existing table data
    within ".table-editor-grid" do
      inputs = all("input")
      assert_equal "Col1", inputs[0].value
      assert_equal "Col2", inputs[1].value
    end
  end

  test "table cell context menu appears on right-click" do
    create_test_note("context_table.md", "# Test")

    visit root_url
    find("[data-path='context_table.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Right-click on a cell
    within ".table-editor-grid" do
      first("td").right_click
    end

    # Context menu should appear (using table-editor target)
    assert_selector "[data-table-editor-target='cellMenu']:not(.hidden)"
    assert_text "Move Left"
    assert_text "Move Right"
    assert_text "Delete Column"
    assert_text "Move Up"
    assert_text "Move Down"
    assert_text "Delete Row"
  end

  test "move column right via context menu" do
    create_test_note("move_col.md", "# Test")

    visit root_url
    find("[data-path='move_col.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Get initial values
    within ".table-editor-grid" do
      inputs = all("input")
      assert_equal "Header 1", inputs[0].value
      assert_equal "Header 2", inputs[1].value

      # Right-click on first column header
      first("td").right_click
    end

    # Click "Move Right"
    click_button "Move Right"

    # Columns should be swapped
    within ".table-editor-grid" do
      inputs = all("input")
      assert_equal "Header 2", inputs[0].value
      assert_equal "Header 1", inputs[1].value
    end
  end

  test "move row down via context menu" do
    create_test_note("move_row.md", "# Test")

    visit root_url
    find("[data-path='move_row.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Fill in some data in row 2 (index 1)
    within ".table-editor-grid" do
      inputs = all("input")
      inputs[3].fill_in with: "Row2Col1"  # Second row, first column
    end

    # Right-click on second row
    within ".table-editor-grid" do
      all("tr")[1].first("td").right_click
    end

    # Click "Move Down"
    click_button "Move Down"

    # Row should have moved down
    within ".table-editor-grid" do
      inputs = all("input")
      # Now the value should be in the third row
      assert_equal "Row2Col1", inputs[6].value
    end
  end

  test "delete column via context menu" do
    create_test_note("del_col.md", "# Test")

    visit root_url
    find("[data-path='del_col.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Initially 3 columns (9 cells)
    assert_selector ".table-editor-grid input", count: 9

    # Right-click on second column
    within ".table-editor-grid" do
      all("td")[1].right_click
    end

    # Click "Delete Column"
    click_button "Delete Column"

    # Should have 2 columns now (6 cells)
    assert_selector ".table-editor-grid input", count: 6
  end

  test "delete row via context menu" do
    create_test_note("del_row.md", "# Test")

    visit root_url
    find("[data-path='del_row.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Initially 3 rows (9 cells)
    assert_selector ".table-editor-grid input", count: 9

    # Right-click on second row (not header)
    within ".table-editor-grid" do
      all("tr")[1].first("td").right_click
    end

    # Click "Delete Row"
    click_button "Delete Row"

    # Should have 2 rows now (6 cells)
    assert_selector ".table-editor-grid input", count: 6
  end

  test "cannot delete header row" do
    create_test_note("no_del_header.md", "# Test")

    visit root_url
    find("[data-path='no_del_header.md']").click
    find("button[title='Insert/Edit Table']").click

    assert_selector "dialog[open]"

    # Right-click on header row
    within ".table-editor-grid" do
      first("td").right_click
    end

    # Delete Row button should be disabled (using table-editor target)
    delete_btn = find("[data-table-editor-target='deleteRowBtn']")
    assert delete_btn.disabled?
  end

  # Image Picker Tests

  test "image button is always visible for web search access" do
    # Even without local images configured, button should be visible
    # because web search and Pinterest are always available
    original_images_path = ENV["IMAGES_PATH"]
    ENV["IMAGES_PATH"] = ""

    create_test_note("img_test.md", "# Test")

    visit root_url
    find("[data-path='img_test.md']").click

    # Wait for config to load
    sleep 0.3

    # Image button should be visible (web search always available)
    assert_selector "button[title='Insert Image']"
  ensure
    ENV["IMAGES_PATH"] = original_images_path
  end
end

class NotesWithImagesTest < ApplicationSystemTestCase
  def setup
    super
    setup_test_images_dir
  end

  def teardown
    teardown_test_images_dir
    super
  end

  def setup_test_images_dir
    @test_images_dir = Rails.root.join("tmp", "test_images_#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(@test_images_dir)

    @original_images_path = ENV["IMAGES_PATH"]
    ENV["IMAGES_PATH"] = @test_images_dir.to_s
  end

  def teardown_test_images_dir
    FileUtils.rm_rf(@test_images_dir) if @test_images_dir&.exist?
    ENV["IMAGES_PATH"] = @original_images_path
  end

  def create_test_image(name)
    path = @test_images_dir.join(name)
    FileUtils.mkdir_p(path.dirname)
    # Create a minimal valid 1x1 red PNG
    png_data = [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0xD4, 0xE7, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ].pack("C*")
    File.binwrite(path, png_data)
    path
  end

  test "image button is visible when images are configured" do
    create_test_note("img_test.md", "# Test")
    create_test_image("sample.png")

    visit root_url
    find("[data-path='img_test.md']").click

    # Wait for config to load
    sleep 0.5

    # Image button should be visible
    assert_selector "button[title='Insert Image']", visible: true
  end

  test "image picker dialog opens and shows images" do
    create_test_note("img_picker.md", "# Test")
    create_test_image("photo1.png")
    create_test_image("photo2.png")

    visit root_url
    find("[data-path='img_picker.md']").click
    sleep 0.5

    find("button[title='Insert Image']").click

    assert_selector "dialog[open]"
    assert_selector ".image-grid-item", count: 2
  end

  test "image picker search filters images" do
    create_test_note("img_search.md", "# Test")
    create_test_image("cat.png")
    create_test_image("dog.png")

    visit root_url
    find("[data-path='img_search.md']").click
    sleep 0.5

    find("button[title='Insert Image']").click
    assert_selector "dialog[open]"

    # Initially both images visible
    assert_selector ".image-grid-item", count: 2

    # Search for cat
    fill_in placeholder: "Search images by filename...", with: "cat"
    sleep 0.5

    # Only cat image should be visible
    assert_selector ".image-grid-item", count: 1
  end

  test "selecting image shows options" do
    create_test_note("img_select.md", "# Test")
    create_test_image("myimage.png")

    visit root_url
    find("[data-path='img_select.md']").click
    sleep 0.5

    find("button[title='Insert Image']").click
    assert_selector "dialog[open]"

    # Click on image
    find(".image-grid-item").click

    # Options should appear
    assert_selector "[data-image-picker-target='options']:not(.hidden)"
    assert_selector "[data-image-picker-target='selectedName']", text: "myimage.png"

    # Alt text should be pre-filled
    alt_input = find("[data-image-picker-target='alt']")
    assert_equal "myimage", alt_input.value
  end

  test "inserting image adds markdown to content" do
    create_test_note("img_insert.md", "# Test\n\n")
    create_test_image("photo.png")

    visit root_url
    find("[data-path='img_insert.md']").click
    sleep 0.5

    find("button[title='Insert Image']").click
    assert_selector "dialog[open]"

    # Wait for images to load then select one
    assert_selector ".image-grid-item", wait: 3
    find(".image-grid-item").click

    # Click insert button using JavaScript (avoids viewport issues)
    sleep 0.5
    page.execute_script("document.querySelector('[data-image-picker-target=\"insertBtn\"]').click()")

    # Dialog should close
    assert_no_selector "dialog[open]", wait: 2

    # Editor should contain image markdown
    assert_selector ".cm-editor", visible: true
    content = editor_content
    assert_includes content, "![photo]"
    assert_includes content, "/images/preview/photo.png"
  end

  test "inserting image with link wraps in anchor" do
    create_test_note("img_link.md", "# Test\n\n")
    create_test_image("clickable.png")

    visit root_url
    find("[data-path='img_link.md']").click
    sleep 0.5

    find("button[title='Insert Image']").click
    assert_selector "dialog[open]"

    # Wait for images to load then select one
    assert_selector ".image-grid-item", wait: 3
    find(".image-grid-item").click

    # Wait for options panel to appear and add link URL (use JS for visibility issues)
    sleep 0.5
    page.execute_script("document.querySelector('[data-image-picker-target=\"link\"]').value = 'https://example.com'")
    page.execute_script("document.querySelector('[data-image-picker-target=\"link\"]').dispatchEvent(new Event('input'))")

    # Click insert button using JavaScript
    sleep 0.3
    page.execute_script("document.querySelector('[data-image-picker-target=\"insertBtn\"]').click()")

    # Dialog should close
    assert_no_selector "dialog[open]", wait: 2

    assert_selector ".cm-editor", visible: true
    content = editor_content
    assert_includes content, "[![clickable]"
    assert_includes content, "](https://example.com)"
  end

  test "inserting image with custom alt text" do
    create_test_note("img_alt.md", "# Test\n\n")
    create_test_image("boring-name.png")

    visit root_url
    find("[data-path='img_alt.md']").click
    sleep 0.5

    find("button[title='Insert Image']").click
    assert_selector "dialog[open]"

    # Wait for images to load then select one
    assert_selector ".image-grid-item", wait: 5
    sleep 0.3 # Allow images API to complete
    find(".image-grid-item").click

    # Set alt text using JavaScript for reliability
    sleep 0.5
    page.execute_script("document.querySelector('[data-image-picker-target=\"alt\"]').value = 'A beautiful sunset'")
    page.execute_script("document.querySelector('[data-image-picker-target=\"alt\"]').dispatchEvent(new Event('input'))")

    # Click insert button using JavaScript
    sleep 0.3
    page.execute_script("document.querySelector('[data-image-picker-target=\"insertBtn\"]').click()")

    # Dialog should close
    assert_no_selector "dialog[open]", wait: 2

    assert_selector ".cm-editor", visible: true
    content = editor_content
    assert_includes content, "![A beautiful sunset]"
  end
end
