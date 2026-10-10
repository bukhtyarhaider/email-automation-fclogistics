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
  return {
    hourRemaining: Math.max(0, pacing.hourlyCap - hourly.length),
    dayRemaining: Math.max(0, pacing.dailyCap - daily.length),
    waitMs: Math.max(
      until(hourly, pacing.hourlyCap, 3600000),
      until(daily, pacing.dailyCap, 86400000),
    ),
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
