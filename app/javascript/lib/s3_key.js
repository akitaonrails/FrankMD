// Mirrors the server's default S3 object-key layout (UploadStorage.s3_key), so
// the picker can pre-fill the exact key the server would otherwise generate.
// Keep in sync with that Ruby method if the default layout ever changes.

const PREFIX = "frankmd"

function yearMonth(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}/${month}`
}

// Default folder prefix, e.g. "frankmd/2026/07". Used where the server owns the
// filename (external URL, AI, video), so the user edits only the folder.
export function defaultS3Prefix(date = new Date()) {
  return `${PREFIX}/${yearMonth(date)}`
}

// Default full key, e.g. "frankmd/2026/07/photo.png". Used where the client
// holds the file and knows its name (drop/paste, folder, local re-upload).
export function defaultS3Key(filename, date = new Date()) {
  return `${defaultS3Prefix(date)}/${filename}`
}
