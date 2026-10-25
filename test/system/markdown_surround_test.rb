# frozen_string_literal: true

require "application_system_test_case"

class MarkdownSurroundTest < ApplicationSystemTestCase
  test "typed markers preserve selection and repeat to bold in the real editor" do
    create_test_note("surround.md", "This is a sample of a text")
    visit note_url(path: "surround.md")
    assert_selector ".cm-content", text: "This is a sample of a text"
    select_text(0, 26)
    page.driver.browser.action.send_keys("*").perform
    assert_equal "*This is a sample of a text*", editor_content
    assert_equal "This is a sample of a text", page.evaluate_script("window.getSelection().toString()")
    page.driver.browser.action.send_keys("*").perform
    assert_equal "**This is a sample of a text**", editor_content
    assert_equal "This is a sample of a text", page.evaluate_script("window.getSelection().toString()")
    page.driver.browser.action.key_down(:control).send_keys("z").key_up(:control).perform
    assert_equal "*This is a sample of a text*", editor_content
    wait_for_tree_refresh("surround.md")
  end

  test "native Vim visual commands retain their meaning" do
    create_test_note("vim-surround.md", "sample text sample")
    visit note_url(path: "vim-surround.md")
    assert_selector ".cm-content", text: "sample text sample"
    page.execute_script(<<~JS)
      const element = document.querySelector('[data-controller~="codemirror"]');
      window.Stimulus.getControllerForElementAndIdentifier(element, 'codemirror').setVimMode(true);
    JS
    assert_selector '[data-app-target="vimStatus"]', text: "NORMAL"
    find(".cm-content").click
    page.driver.browser.action.send_keys("gg0vw*").perform
    assert_equal "sample text sample", editor_content
    wait_for_tree_refresh("vim-surround.md")
  end

  private

  def select_text(from, to)
    page.execute_script(<<~JS, from, to)
      const element = document.querySelector('[data-controller~="codemirror"]');
      const view = window.Stimulus.getControllerForElementAndIdentifier(element, 'codemirror').editor;
      view.focus();
      view.dispatch({ selection: { anchor: arguments[0], head: arguments[1] } });
    JS
  end
end
