import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { GameSession, type SessionSnapshot } from './game/GameSession'
import { describeResult } from './game/outcome'
import type { SwingResult } from './game/types'
import {
  CameraInput,
  loadSensitivity,
  type CameraState,
  type CameraStatus,
} from './input/CameraInput'
import {
  createInput,
  readStoredInputMode,
  writeStoredInputMode,
  type InputMode,
} from './input/createInput'
import { BattingScene } from './scene'

const TOTAL_PITCHES = 10

const empty: SessionSnapshot = {
  totalPitches: TOTAL_PITCHES,
  phase: 'idle',
  completed: [],
  score: 0,
  current: null,
  lastResult: null,
  finished: false,
  running: false,
}

/** Subtle phase hint under the scene. */
const PHASE_HINT: Record<SessionSnapshot['phase'], string> = {
  idle: 'Get ready…',
  pitching: 'Swing!',
  result: 'Ball in play',
  finished: 'Round over',
}

const BAND_HEADLINE: Record<SwingResult['band'], string> = {
  perfect: 'PERFECT!',
  early: 'EARLY',
  late: 'LATE',
  miss: 'MISS',
}

const CAM_STATUS_TEXT: Record<CameraStatus, string> = {
  idle: 'Camera off',
  requesting: 'Requesting camera…',
  ready: 'Camera ready — swing to test',
  denied: 'Camera blocked — using mouse/keyboard',
  unavailable: 'No camera found — using mouse/keyboard',
}

const BATTER_URL = `${import.meta.env.BASE_URL}models/batter.glb`

/** describeResult already shouts "PERFECT!"; the overlay headline covers that. */
function subLine(result: SwingResult): string {
  return describeResult(result).replace(/^PERFECT! /, '')
}

function summarise(completed: SwingResult[]) {
  let perfect = 0
  let early = 0
  let late = 0
  let miss = 0
  let longestFt = 0
  for (const r of completed) {
    if (r.band === 'perfect') perfect += 1
    else if (r.band === 'early') early += 1
    else if (r.band === 'late') late += 1
    else miss += 1
    if (r.outcome.fair && r.outcome.distanceFt > longestFt) longestFt = r.outcome.distanceFt
  }
  return { perfect, early, late, miss, longestFt }
}

function App() {
  const sessionRef = useRef<{ session: GameSession; unsub: () => void } | null>(null)
  const [snap, setSnap] = useState<SessionSnapshot>(empty)

  // ---- input mode (runtime choice; env only seeds the default elsewhere)
  const [mode, setMode] = useState<InputMode>(readStoredInputMode)
  const cameraRef = useRef<CameraInput | null>(null)
  const [camState, setCamState] = useState<CameraState | null>(null)
  const [sensitivity, setSensitivity] = useState(loadSensitivity)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)

  const teardown = () => {
    const active = sessionRef.current
    if (!active) return
    // Unsubscribe first so the old session's final emit cannot clobber the new one.
    active.unsub()
    active.session.stop()
    sessionRef.current = null
  }

  const disposeCamera = useCallback(() => {
    cameraRef.current?.dispose()
    cameraRef.current = null
    setCamState(null)
  }, [])

  useEffect(
    () => () => {
      teardown()
      disposeCamera()
    },
    [disposeCamera],
  )

  // One long-lived CameraInput per webcam session: permission is requested here,
  // on the start screen, not mid-round. Switching back to pointer releases it.
  useEffect(() => {
    if (mode !== 'camera') return
    // No options: CameraInput reads the persisted sensitivity itself, the same
    // value that seeds the slider state above.
    const cam = cameraRef.current ?? new CameraInput()
    cameraRef.current = cam
    const unsub = cam.subscribeState(setCamState)
    cam.start()
    return unsub
  }, [mode])

  // GameSession stops the input at the end of a round; keep the detector (and
  // therefore the preview) alive between rounds. start() is idempotent.
  useEffect(() => {
    if (mode !== 'camera' || snap.running) return
    cameraRef.current?.start()
  }, [mode, snap.running])

  // Show the live mirrored stream + motion overlay once the camera is up.
  const camStatus = camState?.status ?? 'idle'
  useEffect(() => {
    if (mode !== 'camera') return
    const cam = cameraRef.current
    const video = videoRef.current
    if (!cam || !video) return
    const stream = cam.getStream()
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream
      void video.play().catch(() => {})
    }
    cam.attachPreview(overlayRef.current)
    return () => {
      cam.attachPreview(null)
    }
  }, [mode, camStatus])

  const selectMode = (next: InputMode) => {
    if (next === mode) return
    // Release the camera here (an event handler) rather than in an effect body.
    if (next !== 'camera') disposeCamera()
    writeStoredInputMode(next)
    setMode(next)
  }

  const startRound = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Drop focus: otherwise a later Space/Enter swing would also re-click this
    // button and restart the round mid-swing.
    event.currentTarget.blur()
    teardown()
    // Fresh input per session so stopping the old session never deactivates
    // the listener the new one depends on. The CameraInput itself is shared and
    // long-lived (CompositeInput wraps it with a fresh PointerInput).
    const session = new GameSession(createInput(mode, cameraRef.current), TOTAL_PITCHES)
    const unsub = session.subscribe(setSnap)
    sessionRef.current = { session, unsub }
    session.start()
  }

  // Pitch number survives the result hold (current is null while the arc plays).
  const pitchNumber = snap.current
    ? snap.current.index + 1
    : Math.min(snap.completed.length + (snap.running ? 1 : 0), snap.totalPitches)

  const last = snap.lastResult
  const stats = summarise(snap.completed)
  const showStart = !snap.running && !snap.finished
  const phaseHint = snap.running ? PHASE_HINT[snap.phase] : ''

  const camLive = mode === 'camera' && camStatus === 'ready'
  const camFallback = camStatus === 'denied' || camStatus === 'unavailable'
  const howToSwing = camLive
    ? 'Swing your arm across the camera when the ball reaches the plate'
    : 'Click or press Space when the ball reaches the plate'

  const modePicker = (
    <div className="seg" role="group" aria-label="Input mode">
      <button
        type="button"
        className={mode === 'pointer' ? 'seg-btn seg-on' : 'seg-btn'}
        aria-pressed={mode === 'pointer'}
        onClick={() => selectMode('pointer')}
      >
        Mouse &amp; keyboard
      </button>
      <button
        type="button"
        className={mode === 'camera' ? 'seg-btn seg-on' : 'seg-btn'}
        aria-pressed={mode === 'camera'}
        onClick={() => selectMode('camera')}
      >
        Webcam
      </button>
    </div>
  )

  // Full bar = 3x the onset threshold, so the marker sits at one third.
  const onset = camState?.onsetThresh ?? 1
  const energyPct = Math.min(100, Math.round(((camState?.emaFast ?? 0) / (onset * 3)) * 100))

  return (
    <div className="app">
      <header className="header">
        <h1>CamSport — Batting</h1>
        <p className="tagline">Ten pitches. Time your swing.</p>
      </header>

      <main className="field" role="application" aria-label="Batting lane">
        <div className="hud">
          <span className="hud-pitch">
            {snap.finished
              ? `Round over — ${snap.totalPitches} / ${snap.totalPitches}`
              : snap.running
                ? `Pitch ${pitchNumber} / ${snap.totalPitches}`
                : `${snap.totalPitches} pitches`}
          </span>

          <ol className="dots" aria-label="Pitch results">
            {Array.from({ length: snap.totalPitches }, (_, i) => {
              const done = snap.completed[i]
              const live = !done && snap.running && pitchNumber === i + 1
              return (
                <li
                  key={i}
                  className={`dot${done ? ` dot-${done.band}` : ''}${live ? ' dot-live' : ''}`}
                  title={done ? `Pitch ${i + 1}: ${done.band}` : `Pitch ${i + 1}`}
                />
              )
            })}
          </ol>

          <span className="hud-score">
            Score
            <b className={snap.score > 0 ? 'score score-bump' : 'score'} key={snap.score}>
              {snap.score}
            </b>
          </span>

          {snap.running ? (
            <button type="button" className="ghost" onClick={startRound}>
              Restart
            </button>
          ) : null}
        </div>

        <div className="stage">
          <BattingScene snapshot={snap} batterUrl={BATTER_URL} />

          {mode === 'camera' ? (
            <div className="campanel">
              <div className="cam-frame">
                <video ref={videoRef} className="cam-video" muted playsInline autoPlay />
                <canvas ref={overlayRef} className="cam-overlay" width={192} height={144} />
                {camState && camState.lastFireMs > 0 ? (
                  <span className="cam-fire" key={camState.lastFireMs} aria-hidden="true" />
                ) : null}
              </div>

              <div className="cam-energy" title="Motion energy vs. onset threshold">
                <span className="cam-energy-fill" style={{ width: `${energyPct}%` }} />
                <span className="cam-energy-mark" />
              </div>

              <p className={`cam-status${camFallback ? ' cam-status-warn' : ''}`} role="status">
                {CAM_STATUS_TEXT[camStatus]}
              </p>

              {snap.phase === 'pitching' ? null : (
                <label className="cam-slider">
                  <span>Sensitivity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(sensitivity * 100)}
                    onChange={(e) => {
                      const next = Number(e.target.value) / 100
                      setSensitivity(next)
                      // CameraInput persists it to localStorage and republishes
                      // CameraState (onsetThresh moves with it).
                      cameraRef.current?.setSensitivity(next)
                    }}
                  />
                </label>
              )}
            </div>
          ) : null}

          {last ? (
            <div
              key={last.resolvedAtMs}
              className={`flash flash-${last.band}`}
              aria-hidden="true"
            >
              <strong>{BAND_HEADLINE[last.band]}</strong>
              <span>{subLine(last)}</span>
            </div>
          ) : null}

          {showStart ? (
            <div className="card">
              <h2>CamSport — Batting</h2>
              {modePicker}
              <p className="card-how">{howToSwing}</p>
              <p className="card-sub">
                Dead on = home run. Early pulls it left, late pushes it right.
                {mode === 'camera'
                  ? ' Mouse and keyboard keep working in webcam mode.'
                  : ''}
              </p>
              <button type="button" className="primary" onClick={startRound}>
                Start round
              </button>
            </div>
          ) : null}

          {snap.finished ? (
            <div className="card">
              <h2>Round complete</h2>
              <p className="final">{snap.score}</p>
              <p className="card-sub">final score</p>
              <dl className="tally">
                <div>
                  <dt>Perfect</dt>
                  <dd className="dd-perfect">{stats.perfect}</dd>
                </div>
                <div>
                  <dt>Early</dt>
                  <dd className="dd-early">{stats.early}</dd>
                </div>
                <div>
                  <dt>Late</dt>
                  <dd className="dd-late">{stats.late}</dd>
                </div>
                <div>
                  <dt>Miss</dt>
                  <dd className="dd-miss">{stats.miss}</dd>
                </div>
              </dl>
              <p className="card-sub">
                Longest hit: {stats.longestFt > 0 ? `${stats.longestFt} ft` : '—'}
              </p>
              {modePicker}
              <button type="button" className="primary" onClick={startRound}>
                Play again
              </button>
            </div>
          ) : null}
        </div>

        <div className="readout">
          <p className="cue">{phaseHint}</p>
          <p className="result" role="status" aria-live="polite">
            {last ? (
              <span className={`result-${last.band}`}>
                {describeResult(last)} (+{last.points})
              </span>
            ) : (
              ''
            )}
          </p>
        </div>
      </main>

      <footer className="footer">
        Input:{' '}
        {mode === 'camera'
          ? camFallback
            ? 'mouse / keyboard (webcam unavailable)'
            : 'webcam + mouse / keyboard'
          : 'pointer / keyboard'}{' '}
        · 3D model “RobotExpressive” by Tomás Laulhé (Quaternius), modified by Don McCurdy — CC0
        1.0
      </footer>
    </div>
  )
}

export default App
