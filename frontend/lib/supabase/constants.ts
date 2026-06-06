/** Shared auth constants. */

// Non-httpOnly flag cookie recording the "Remember me" choice, so the
// middleware can refresh auth cookies with a matching lifetime.
export const REMEMBER_COOKIE = "oh-remember";

// Persistent session length when "Remember me" is checked (≈400 days — the
// browser cap for cookie max-age). Unchecked => session cookies (cleared on
// browser close).
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 400;
