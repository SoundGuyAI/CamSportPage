# CamSport — Game Selection Analysis

**Optimization metric:** minimize build complexity and AI agent credit cost  
**Constraint:** one Wii Sports–style mini-game; mouse/keyboard first; webcam in Stage 2  
**Date:** 2026-09-13  

Analysis produced from parallel design reviews (batting, golf, bowling, tennis, boxing).

---

## Verdict

**Ship baseball batting-only (timing game).**

It ties the lowest complexity tier (~3/10) with the cleanest Stage-2 webcam path and the least polish-trap surface. Golf power-bar and scripted bowling are close seconds; real-physics bowling, tennis, and full boxing sims are credit sinks.

---

## Comparison (complexity / credits)

| Game | Complexity (1–10) | Credit-burn risk | Webcam Stage-2 | Verdict |
|------|-------------------|------------------|----------------|---------|
| **Baseball batting (timing)** | **3** | **Low–Med** | **Strong** | **Recommend — pick this** |
| Golf power-bar (1 hole) | 3 | Low–Med | Strong | Recommend (runner-up) |
| Bowling — scripted pins | 3 | Low | Strong | Recommend if branding must be bowling |
| Boxing — L/R timing | 3 | Low | Strong | Strong alternative; more “rhythm game” |
| Tennis — simplified rally | 5 | Med | Fair | Conditional |
| Bowling — real pin physics | 8 | High | Poor–Med | **Avoid for MVP** |

Lower complexity + lower credit-burn = better for this metric.

---

## Option deep-dives

### 1. Baseball batting-only (timing) — **chosen**

**Loop:** pitch approaches → player commits (click/space) → early / perfect / late / miss → scripted flight + distance / fair-foul → score over N pitches.

| | |
|---|---|
| **Complexity** | 3/10 |
| **Credit-burn** | Low–Med — few systems; feel tuning is the main trap |
| **MVP systems** | Pitch spawn, timing window, commit input, hit→result map, feedback, round score |
| **Iteration risks** | Expanding timing bands into physics; fair/foul disputes; juice over-polish; pose work before mouse feel is locked |
| **Webcam Stage-2** | Discrete commit at time *t* maps to swing peak / velocity threshold — drop-in adapter |

**Pros (vs metric)**  
- Minimal system count; vertical slice in one session  
- Deterministic scoring → cheap to test  
- Stage-2 is an input swap, not a redesign  

**Cons**  
- Can feel shallow without restrained juice  
- Nostalgia can pull scope toward “real baseball”  

**Freeze for MVP:** 1 pitch speed, 3 timing bands, scripted flight, sum score over 10 swings.

---

### 2. Golf power-bar (single hole)

| | |
|---|---|
| **Complexity** | 3/10 |
| **Credit-burn** | Low–Med |
| **MVP systems** | Aim, power meter, accuracy wobble, distance math, one hole, score |
| **Iteration risks** | Power curve / wobble feel; hole-out rules; course creep |
| **Webcam Stage-2** | Backswing→power, forward swing→commit — strong |

**Pros:** Math shots beat physics; one hole = no content pipeline.  
**Cons:** “Golf” expectations invite polish; less spectacle than bowling.  
**Verdict:** Recommend as runner-up. Prefer single-shot distance-to-pin if building this instead.

---

### 3. Bowling — scripted (fake physics)

| | |
|---|---|
| **Complexity** | 3/10 |
| **Credit-burn** | Low |
| **MVP systems** | Throw-quality score → outcome table → canned knockover clips |
| **Webcam Stage-2** | Gesture→quality bands→clip — strong |

**Pros:** Predictable agent work; no solver bugs.  
**Cons:** Less toy-physics magic; needs enough animation variants.  
**Verdict:** Recommend only if the client insists on bowling branding.

---

### 4. Bowling — real pin physics

| | |
|---|---|
| **Complexity** | 8/10 |
| **Credit-burn** | **High** |
| **Why** | Continuous feel loops (friction, restitution, thin hits, gutters, perf) |

**Verdict:** **Avoid** for credit-optimized MVP.

---

### 5. Boxing — L/R punch timing

| | |
|---|---|
| **Complexity** | 3/10 |
| **Credit-burn** | Low |
| **Webcam Stage-2** | Left/right fist maps cleanly — strong |

**Pros:** Tiny surface; binary labels.  
**Cons:** Reads as rhythm game unless visuals sell boxing.  
**Verdict:** Strong alternative; batting wins on clearer “one Wii Sports game” fantasy with similar cost.

---

### 6. Tennis — simplified rally

| | |
|---|---|
| **Complexity** | 5/10 |
| **Credit-burn** | Med |
| **Why** | Opponent returns + spatial flight + miss feedback burn polish credits |

**Verdict:** Conditional — only as pure 1D timing with scripted returns.

---

## Why batting over the other ~3/10 options

Against the **complexity / credit** metric, batting, golf power-bar, scripted bowling, and L/R boxing are in the same cost band. Batting wins the tie-breakers we care about for CamSport:

1. **Single discrete commit** — easiest input adapter for Stage-2 webcam  
2. **No aim + power dual axis** (golf) and **no clip/content table** (scripted bowling) in the critical path  
3. **Clear sport fantasy** without needing opponent AI (boxing/tennis)  
4. Already aligned with the agreed product direction before this write-up  

---

## Scope freeze (do not expand in Stage 1)

| In | Out |
|----|-----|
| 10 swings / round | Full innings, baserunning, fielding |
| 1 pitch speed | Pitch types, pitcher AI |
| 3 timing bands | Continuous physics trajectories |
| Scripted ball arc | Wind, spin sim |
| Mouse / keyboard / touch | Webcam (Stage 2 only) |
| Local score display | Auth, online multiplayer, leaderboards |

---

## Stage roadmap

1. **Stage 1** — Batting timing MVP on GitHub Pages (pointer/keyboard)  
2. **Stage 2** — Webcam pose → same `commit(timestamp)` / swing event API  
3. **Later** — Cloudflare (Workers/Pages), optional scores, auth — explore when needed  
