/**
 * Turn a gateway adapter error payload into a short human-readable string.
 */
export function formatGatewayDetail(detail) {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail.trim();
  if (typeof detail !== 'object') return String(detail);

  if (typeof detail.message === 'string' && detail.message.trim()) {
    return detail.message.trim();
  }
  if (typeof detail.title === 'string' && detail.title.trim()) {
    const code = detail.code ? `${detail.code}: ` : '';
    return `${code}${detail.title.trim()}`;
  }
  if (typeof detail.error === 'string' && detail.error.trim()) {
    return detail.error.trim();
  }
  if (Array.isArray(detail.errors) && detail.errors.length > 0) {
    const first = detail.errors[0];
    if (typeof first === 'string') return first;
    if (first && typeof first.message === 'string') return first.message;
  }

  try {
    const json = JSON.stringify(detail);
    return json.length > 280 ? `${json.slice(0, 277)}...` : json;
  } catch {
    return 'gateway_error';
  }
}

export default { formatGatewayDetail };
