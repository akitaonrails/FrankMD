// Extract a pasted image from a clipboard event as a File the image-picker Drop source can ingest.

const EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp"
}

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
