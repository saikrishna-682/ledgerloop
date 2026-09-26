// The real VlyToolbar is injected by the vly.ai platform preview iframe and
// isn't part of this export. Standalone local dev gets a no-op stub so
// src/main.tsx can import it unconditionally.
export function VlyToolbar() {
  return null;
}
