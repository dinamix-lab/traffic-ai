// A full document navigation clears all prefetched protected pages on session changes.
export function navigateAfterSessionChange(path: "/" | "/login") {
  window.location.assign(path);
}
