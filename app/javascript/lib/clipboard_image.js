// Helpers for extracting a pasted image out of a clipboard event so it can be
// fed into the image-picker Drop source (same File machinery as drag-and-drop).

const EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp"
}

// Return an image File from clipboard data, or null if there is no image.
export function imageFileFromClipboard(clipboardData) {
  if (!clipboardData) return null
  for (const item of clipboardData.items || []) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (file) return normalizeImageFile(file)
    }
  }
  return null
}

// Clipboard images often arrive with an empty or extension-less name; the Drop
// ingest validates by filename extension, so synthesize one from the MIME type.
export function normalizeImageFile(file) {
  if (/\.[a-z0-9]+$/i.test(file.name || "")) return file
  const ext = EXT_BY_MIME[file.type] || ".png"
  return new File([file], `pasted-image-${file.lastModified || "clip"}${ext}`, { type: file.type })
}
