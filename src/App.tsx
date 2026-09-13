import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { GameSession, type SessionSnapshot } from './game/GameSession'
import { createInput } from './input/createInput'

const empty: SessionSnapshot = {
  totalPitches: 10,
  completed: [],
  score: 0,
  current: null,
  finished: false,
}

function App() {
  const input = useMemo(() => createInput(), [])
  const [session, setSession] = useState<GameSession | null>(null)
  const [snap, setSnap] = useState<SessionSnapshot>(empty)

  useEffect(() => {
    return () => {
      session?.stop()
    }
  }, [session])

  const startRound = () => {
    session?.stop()
    const next = new GameSession(input, 10)
    setSession(next)
    next.subscribe(setSnap)
    next.start()
  }

  const pitchLabel = snap.finished
    ? 'Round over'
    : snap.current
      ? `Pitch ${snap.current.index + 1} / ${snap.totalPitches}`
      : 'Ready'

  const last = snap.completed[snap.completed.length - 1]

  return (
    <div className="app">
      <header className="header">
        <h1>CamSport</h1>
        <p className="tagline">Batting timing — Stage 1 (pointer / keyboard)</p>
      </header>

      <main className="field" role="application" aria-label="Batting lane">
        <div className="hud">
          <span>{pitchLabel}</span>
          <span>Score: {snap.score}</span>
        </div>

        <div className="plate">
          {snap.current ? (
            <p className="cue">Swing! Click or press Space</p>
          ) : snap.finished ? (
            <p className="cue">Final score: {snap.score}</p>
          ) : (
            <p className="cue">Press Start to face 10 pitches</p>
          )}
          {last ? (
            <p className={`result result-${last.band}`}>
              Last: {last.band} (+{last.points})
            </p>
          ) : null}
        </div>

        <button type="button" className="primary" onClick={startRound}>
          {snap.finished || !session ? 'Start round' : 'Restart'}
        </button>
      </main>

      <footer className="footer">
        Input mode: {import.meta.env.VITE_INPUT_MODE === 'pose' ? 'pose' : 'pointer'} · Webcam in Stage 2
      </footer>
    </div>
  )
}

export default App
