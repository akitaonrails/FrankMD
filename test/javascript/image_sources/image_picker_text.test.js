/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  imagePickerSearchResultMessage,
  imagePickerText
} from "../../../app/javascript/lib/image_sources/image_picker_text.js"

const originalTranslation = window.t

afterEach(() => {
  if (originalTranslation === undefined) {
    delete window.t
  } else {
    window.t = originalTranslation
  }
  vi.restoreAllMocks()
})

describe("image picker translations", () => {
  it("uses a loaded translation and interpolates its values", () => {
    window.t = vi.fn((key, options) => {
      expect(key).toBe("dialogs.image_picker.folder_showing_recent")
      return `Showing ${options.shown} recent images out of ${options.total}`
    })

    expect(imagePickerText(
      "folder_showing_recent",
      { shown: 2, total: 5 },
      "Showing %{shown} most recent images out of %{total}"
    )).toBe("Showing 2 recent images out of 5")
  })

  it("uses and interpolates its English fallback when translations are unavailable", () => {
    delete window.t

    expect(imagePickerText("search_result_many", { count: 3 }, "Found %{count} images"))
      .toBe("Found 3 images")
  })

  it("selects singular and plural search result translations", () => {
    window.t = vi.fn((key, options) => `${key}:${options.count}`)

    expect(imagePickerSearchResultMessage(1)).toBe("dialogs.image_picker.search_result_one:1")
    expect(imagePickerSearchResultMessage(4)).toBe("dialogs.image_picker.search_result_many:4")
  })
})
