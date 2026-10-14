// HTML the browser-side tools (Statsguru, the predictor) write as strings.
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe for HTML content and attribute values. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);
