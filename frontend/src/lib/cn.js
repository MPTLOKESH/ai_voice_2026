/** Join class names, skipping the empty ones. */
export const cn = (...names) => names.filter(Boolean).join(" ");
