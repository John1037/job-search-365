// Strips characters that aren't valid in a filename on Windows (the most
// restrictive common case, so a name that passes this is safe everywhere)
// from a user-entered name/employer before it goes into a generated
// document's filename — a stray "/" or ":" in someone's name or an
// employer name would otherwise silently corrupt the file path.
// eslint-disable-next-line no-control-regex -- deliberate: Windows disallows control characters 0-31 in filenames
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeFileNamePart(text) {
  return (text ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/\.+$/, ''); // trailing dots aren't allowed on Windows either
}
