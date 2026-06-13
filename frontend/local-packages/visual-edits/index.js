// Minimal stub for @emergentbase/visual-edits used during local development.

module.exports = {
  applyEdits: function (content, options) {
    // No-op: return content unchanged with a note
    return { content: content, note: "[stub] visual-edits not available" };
  },
};
