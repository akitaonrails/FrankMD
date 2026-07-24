# frozen_string_literal: true

# Single source of truth for containing a user-supplied path inside a base
# directory. Prevents:
#   - traversal via "../" and absolute-path escapes (Pathname#join with an
#     absolute path replaces the base; cleanpath resolves ".." lexically);
#   - the sibling-prefix bypass a raw String#start_with? allows, e.g. base
#     "/data/notes" wrongly accepting "/data/notes-backup/secret" — the check
#     is anchored on a directory separator;
#   - symlinks inside the tree that resolve outside it (validated via realpath).
#
# Returns the cleaned, contained Pathname, or nil if the path would escape.
module PathSafety
  module_function

  def contain(base, path)
    return nil if path.nil?

    base = Pathname.new(base).cleanpath
    candidate = base.join(path.to_s).cleanpath
    return nil unless within?(candidate, base)

    # cleanpath is lexical, so a symlink chain could still resolve outside base.
    # When both ends exist, re-check against the real (link-resolved) paths.
    if candidate.exist? && base.exist?
      return nil unless within?(candidate.realpath, base.realpath)
    end

    candidate
  end

  # True when `path` is `base` itself or strictly inside it (separator-anchored,
  # so a sibling directory sharing the name prefix does not pass).
  def within?(path, base)
    path == base || path.to_s.start_with?(base.to_s + File::SEPARATOR)
  end
end
