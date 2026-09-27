const imagePickerKey = (key) => `dialogs.image_picker.${key}`

export function imagePickerText(key, options = {}, fallback = key) {
  const fullKey = imagePickerKey(key)
  if (typeof window !== "undefined" && typeof window.t === "function") {
    const translated = window.t(fullKey, options)
    if (translated !== fullKey) return translated
  }

  return fallback.replace(/%\{(\w+)\}/g, (match, name) =>
    options[name] === undefined ? match : options[name]
  )
}

export function imagePickerSearchResultMessage(count) {
  const imageCount = Number(count)
  const key = imageCount === 1 ? "search_result_one" : "search_result_many"
  const fallback = imageCount === 1
    ? "Found 1 image - click to select"
    : "Found %{count} images - click to select"

  return imagePickerText(key, { count: imageCount }, fallback)
}
