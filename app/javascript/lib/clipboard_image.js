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
// Unknown image types get an extension derived from the MIME subtype (e.g.
// image/tiff -> .tiff, image/svg+xml -> .svg) rather than a fake ".png", so the
// allow-list rejects them with honest feedback instead of storing a mislabeled
// file that will never render.
export function normalizeImageFile(file) {
  if (/\.[a-z0-9]+$/i.test(file.name || "")) return file
  const ext = EXT_BY_MIME[file.type] || extFromMime(file.type)
  return new File([file], `pasted-image-${file.lastModified || "clip"}${ext}`, { type: file.type })
}

function extFromMime(mime) {
  const subtype = (mime.split("/")[1] || "").replace(/\+.*$/, "").replace(/[^a-z0-9]/gi, "")
  return subtype ? `.${subtype.toLowerCase()}` : ".bin"
}
