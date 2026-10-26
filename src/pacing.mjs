import { randomInt } from "node:crypto";
export function randomBetween(min, max, rng = randomInt) {
  return rng(min, max + 1);
}
export function quota(history, email, pacing, now = Date.now()) {
  const attempts = Object.values(history).filter(
    (h) => !h.accountEmail || h.accountEmail === email,
  );
  const hourly = attempts.filter((h) => now - Date.parse(h.at) < 3600000);
  const daily = attempts.filter((h) => now - Date.parse(h.at) < 86400000);
  const until = (entries, cap, window) =>
    entries.length >= cap
      ? Math.max(
          0,
          Date.parse(
            entries
              .map((h) => h.at)
              .sort()
              .at(-cap),
          ) +
            window -
            now,
        )
      : 0;
  const hourWaitMs = until(hourly, pacing.hourlyCap, 3600000);
  const dayWaitMs = until(daily, pacing.dailyCap, 86400000);
  return {
    hourRemaining: Math.max(0, pacing.hourlyCap - hourly.length),
    dayRemaining: Math.max(0, pacing.dailyCap - daily.length),
    hourWaitMs,
    dayWaitMs,
    waitMs: Math.max(hourWaitMs, dayWaitMs),
  };
}
// Recompute required pacing from history, never from the old countdown.
// Both Reset and the runner use this so a cleared rest cannot hide a limit.
export function requiredWait(history, email, pacing, now = Date.now(), shared = false) {
  const q = quota(history, email, pacing, now);
  const last = Object.values(history)
    .filter((h) => !h.accountEmail || h.accountEmail === email)
    .reduce((latest, h) => Math.max(latest, Date.parse(h.confirmedAt || h.at) || 0), 0);
  const intervalMs = last ? Math.max(0, last + pacing.minSeconds * 1000 - now) : 0;
  const waitMs = Math.max(q.waitMs, intervalMs);
  if (!waitMs) return null;
  const scope = shared ? "Shared mailbox" : "Mailbox";
  const allowance = q.waitMs >= intervalMs;
  const message = allowance
    ? `${scope} rolling ${q.dayWaitMs >= q.hourWaitMs ? "24-hour" : "hourly"} cap reached. Reset clears optional rests; this allowance must renew before sending.`
    : `${scope} minimum send interval is still active. Reset clears optional rests; the configured minimum interval still applies.`;
  return {
    seconds: Math.ceil(waitMs / 1000) + (allowance || shared ? 1 : 0),
    status: allowance ? (shared ? "Team allowance pause" : "Allowance pause") : (shared ? "Team pacing" : "Minimum interval"),
    message,
  };
}
export function nextPause(automation, pacing, rng = randomInt) {
  automation.pauseAfter ||= randomBetween(
    pacing.pauseEveryMin,
    pacing.pauseEveryMax,
    rng,
  );
  automation.sincePause++;
  if (automation.sincePause >= automation.pauseAfter) {
    automation.sincePause = 0;
    automation.pauseAfter = randomBetween(
      pacing.pauseEveryMin,
      pacing.pauseEveryMax,
      rng,
    );
    return {
      kind: "Resting",
      seconds: Math.max(
        randomBetween(pacing.pauseMinSeconds, pacing.pauseMaxSeconds, rng),
        randomBetween(pacing.minSeconds, pacing.maxSeconds, rng),
      ),
    };
  }
  return {
    kind: "Waiting",
    seconds: randomBetween(pacing.minSeconds, pacing.maxSeconds, rng),
  };
}
