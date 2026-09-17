/**
 * 2D swing meter — the flat twin of the 3D timing ring (art-direction.md §9).
 *
 * The sweep is a single CSS animation whose *phase* is pinned to the snapshot's
 * `startedAtMs`: the runner gets `animation-duration: spanMs` and a negative
 * `animation-delay` equal to the time already elapsed since the pitch left the
 * pitcher. That is deterministic (same timestamps -> same marker position, no
 * drift, no `Math.random`) and costs zero JavaScript per frame — the compositor
 * runs one `translateX` and nothing is allocated between frames.
 *
 * The clock is read in a layout effect rather than during render, so the value
 * is sampled once per pitch at commit time (render stays pure, and later
 * re-renders — webcam energy, score bumps — cannot nudge the marker).
 */
import { useLayoutEffect, useRef } from 'react'
import { DEFAULT_WINDOWS } from '../game/timing'
import type { SessionSnapshot } from '../game/GameSession'

type Props = {
  snapshot: SessionSnapshot
}

export function SwingMeter({ snapshot }: Props) {
  const pitch = snapshot.current
  // Derived from the snapshot itself (1300 ms today) rather than hard-coded.
  const flightMs = pitch ? pitch.contactAtMs - pitch.startedAtMs : 0
  // The track runs from release to the miss timeout, so the whole live window
  // is on screen and the marker stops exactly when GameSession gives up.
  const spanMs = flightMs + DEFAULT_WINDOWS.contactMs
  const startedAtMs = pitch?.startedAtMs ?? 0

  const runnerRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = runnerRef.current
    if (!el) return
    // Negative delay == "this animation started `elapsed` ms ago".
    el.style.animationDelay = `${startedAtMs - performance.now()}ms`
  }, [startedAtMs, spanMs])

  if (!pitch || flightMs <= 0) return null

  const pct = (ms: number) => (ms / spanMs) * 100
  const contactLeft = pct(flightMs - DEFAULT_WINDOWS.contactMs)
  const contactWidth = pct(DEFAULT_WINDOWS.contactMs * 2)
  const perfectLeft = pct(flightMs - DEFAULT_WINDOWS.perfectMs)
  const perfectWidth = pct(DEFAULT_WINDOWS.perfectMs * 2)

  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-track">
        <span
          className="meter-contact"
          style={{ left: `${contactLeft}%`, width: `${contactWidth}%` }}
        />
        <span
          className="meter-perfect"
          style={{ left: `${perfectLeft}%`, width: `${perfectWidth}%` }}
        />
      </div>
      <div
        className="meter-runner"
        key={startedAtMs}
        ref={runnerRef}
        style={{ animationDuration: `${spanMs}ms` }}
      >
        <span className="meter-head" />
      </div>
    </div>
  )
}
