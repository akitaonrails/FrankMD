# frozen_string_literal: true

require "application_system_test_case"

class SettingsDropdownTest < ApplicationSystemTestCase
  test "theme popover scrolls independently of Settings at desktop and mobile sizes" do
    @test_notes_dir.join(".fed").write("theme = tokyo-night\n")

    [ [ 1280, 720 ], [ 390, 600 ], [ 360, 360 ] ].each do |width, height|
      page.driver.browser.manage.window.resize_to(width, height)
      visit root_url
      open_settings
      before = dialog_scroll
      find('[data-theme-target="button"]').click
      assert_selector '[data-theme-target="menu"]:popover-open'
      assert_selector '[data-theme="tokyo-night"]:focus[aria-checked="true"]'
      # Reaching an offscreen trigger can scroll Settings on small screens.
      assert_equal before.first, dialog_scroll.first
      before = dialog_scroll
      assert_menu_in_viewport

      page.driver.browser.action.send_keys(:end).perform
      assert_selector '[data-theme="tokyo-night"]:focus'
      assert page.evaluate_script(<<~JS), "Last option must be visible and clickable above the dialog's clipping boundary"
        (() => {
          const option = document.querySelector('[data-theme="tokyo-night"]');
          const rect = option.getBoundingClientRect();
          return option.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        })()
      JS
      assert_equal before, dialog_scroll
      page.save_screenshot(Rails.root.join("tmp/capybara/settings-dropdown-#{width}.png"))

      page.driver.browser.action.send_keys(:tab).perform
      assert_no_selector ":popover-open"
      assert_selector '[data-action="click->theme#openCustomEditor"]:focus'
      find('[data-theme-target="button"]').click
      assert_selector '[data-theme-target="menu"]:popover-open'
      page.driver.browser.action.send_keys(:escape).perform
      assert_no_selector '[data-theme-target="menu"]:popover-open'
      assert_selector '#settings-dialog[open] [data-theme-target="button"]:focus[aria-expanded="false"]'
      page.driver.browser.action.send_keys(:escape).perform
      assert_no_selector "#settings-dialog[open]"
    end
  ensure
    page.driver.browser.manage.window.resize_to(1400, 900)
  end

  test "settings pickers share dismissal and keep selection behavior" do
    visit root_url
    open_settings
    find('[data-theme-target="button"]').click
    assert_selector '[data-theme-target="menu"]:popover-open'
    find('[data-theme-target="button"]').click
    assert_no_selector '[data-theme-target="menu"]:popover-open'
    find('[data-theme-target="button"]').click
    find('[data-media-storage-menu-target="button"]').click
    assert_no_selector '[data-theme-target="menu"]:popover-open'
    assert_selector '#media-storage-menu:popover-open [value="local"]:focus'
    find('[data-locale-target="button"]').click
    assert_no_selector "#media-storage-menu:popover-open"
    assert_selector '[data-locale-target="menu"]:popover-open'
    assert_selector '[data-locale="en"]:focus[aria-checked="true"]'
    find('[data-locale="en"]').click
    assert_no_selector '[data-locale-target="menu"]:popover-open'
    assert_selector '[data-locale-target="button"]:focus[aria-expanded="false"]'

    find('[data-media-storage-menu-target="button"]').click
    assert_selector '#media-storage-menu:popover-open [value="local"]:focus'
    page.driver.browser.action.send_keys(:escape).perform
    assert_no_selector "#media-storage-menu:popover-open"
    assert_selector "#settings-dialog[open]"

    find('[data-theme-target="button"]').click
    find('[data-theme="dark"]').click
    assert_selector 'html[data-theme="dark"]'
    assert_no_selector '[data-theme-target="menu"]:popover-open'
    assert_selector '[data-theme-target="button"]:focus[aria-expanded="false"]'
    find('[data-theme-target="button"]').click
    find('[data-settings-target="navButton"][data-category="editor"]').click
    assert_no_selector ":popover-open"
  end

  test "resizing an open menu keeps its focused option visible" do
    @test_notes_dir.join(".fed").write("theme = tokyo-night\n")
    page.driver.browser.manage.window.resize_to(1280, 900)
    visit root_url
    open_settings
    find('[data-theme-target="button"]').click
    assert_selector '[data-theme-target="menu"]:popover-open'
    page.driver.browser.manage.window.resize_to(1280, 650)
    assert_menu_in_viewport
    assert_selector '[data-theme="tokyo-night"]:focus' do |option|
      page.evaluate_script(<<~JS, option)
        (() => {
          const option = arguments[0];
          const rect = option.getBoundingClientRect();
          const menu = option.closest('[popover]').getBoundingClientRect();
          return rect.top >= menu.top && rect.bottom <= menu.bottom;
        })()
      JS
    end
  ensure
    page.driver.browser.manage.window.resize_to(1400, 900)
  end

  test "scrolling Settings dismisses a menu and closing the dialog leaves no popover" do
    page.driver.browser.manage.window.resize_to(390, 500)
    visit root_url
    open_settings
    find('[data-theme-target="button"]').click
    assert_selector '[data-theme-target="menu"]:popover-open'
    page.execute_script("document.getElementById('settings-dialog').scrollTop += 40")
    assert_no_selector ":popover-open"
    find('[data-locale-target="button"]').click
    assert_selector '[data-locale-target="menu"]:popover-open'
    find('[data-action="click->settings#closeSettings"]').click
    assert_no_selector "#settings-dialog[open]"
    assert_no_selector ":popover-open"
    open_settings
    assert_no_selector ":popover-open"
  ensure
    page.driver.browser.manage.window.resize_to(1400, 900)
  end

  private

  def open_settings
    unless page.has_selector?('[data-app-target="settingsToggle"]', wait: 0)
      find('[data-app-target="sidebarOpen"]').click
    end
    find('[data-app-target="settingsToggle"]').click
    assert_selector "#settings-dialog[open]"
  end

  def dialog_scroll
    page.evaluate_script(<<~JS)
      (() => {
        const dialog = document.getElementById('settings-dialog');
        return [dialog.scrollHeight, dialog.scrollTop];
      })()
    JS
  end

  def assert_menu_in_viewport
    assert_selector ":popover-open" do
      page.evaluate_script(<<~JS)
        (() => {
          const menu = document.querySelector(':popover-open');
          const rect = menu.getBoundingClientRect();
          const colorMatches = getComputedStyle(menu).color === getComputedStyle(document.getElementById('settings-dialog')).color;
          return rect.top >= 7 && rect.left >= 7 && rect.bottom <= innerHeight - 7 &&
            rect.right <= innerWidth - 7 && menu.scrollHeight > menu.clientHeight && colorMatches;
        })()
      JS
    end
  end
end
