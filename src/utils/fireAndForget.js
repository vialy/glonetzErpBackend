/**
 * Run a promise without blocking the caller. The HTTP response can be sent
 * immediately while side effects (SMS, email, etc.) complete in the
 * background. Unhandled rejections are logged so they don't crash the
 * process — the worst case is a missed delivery, surfaced in the logs.
 *
 * Use for non-critical I/O whose failure should not gate the API response.
 *
 *   fireAndForget(smsService.sendUserCredentials({ ... }), 'sms:user-creds');
 */
export function fireAndForget(promiseOrFn, label = 'fire-and-forget') {
  try {
    const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
    Promise.resolve(p).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[${label}] failed:`, err && err.message ? err.message : err);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[${label}] threw synchronously:`, err && err.message ? err.message : err);
  }
}

export default fireAndForget;
