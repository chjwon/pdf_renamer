// Minimized utility functions for arXiv PDF renamer

/**
 * Sanitize a string for use as a filename
 * @param {string} str - Input string
 * @returns {string} - Sanitized string
 */
function sanitizeFilename(str) {
  // Remove invalid filename characters
  let sanitized = str.replace(/[\\/:*?"<>|]/g, '');
  // Replace multiple spaces with a single space
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  return sanitized;
}

/**
 * Truncate a string to a maximum length
 * @param {string} str - Input string
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
function truncateString(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength);
}