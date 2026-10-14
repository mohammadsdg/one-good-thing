export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export const truncate = (value = '', length = 500) => {
  const text = String(value);
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
};
