/**
 * Time-related constants used throughout the application.
 * All durations are in milliseconds for consistency.
 */

/** One minute in milliseconds */
export const ONE_MINUTE_MS = 60 * 1000;

/** One hour in milliseconds */
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/** One day in milliseconds (24 hours) */
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** One week in milliseconds (7 days) */
export const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/** Backend health check interval (30 seconds) */
export const HEALTH_CHECK_INTERVAL_MS = 30 * 1000;

/** Maximum age for a study session before it's considered stale (24 hours) */
export const MAX_SESSION_AGE_MS = ONE_DAY_MS;

/** Warning threshold for session timeout (23 hours) */
export const SESSION_WARNING_THRESHOLD_MS = 23 * ONE_HOUR_MS;
