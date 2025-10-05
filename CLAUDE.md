# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a baseball board game web application called "【9回裏】0点からの逆転劇が奇跡すぎたwww" (9th Inning Comeback Miracle). It's a single-player game where the player must win from behind in the bottom of the 9th inning across multiple tournament levels.

**Live Demo**: https://igtm.github.io/baseball/

## Tech Stack

- **React 19** with TypeScript (single-component architecture)
- **Vite** for build tooling with SWC plugin
- **Tailwind CSS v4** for styling with mobile-first responsive design
- **Canvas 2D API** for game graphics rendering
- **Web Audio API** for procedural sound generation (no audio files)

## Commands

### Development
```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Build for production (TypeScript + Vite)
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Deployment to GitHub Pages
```bash
# Manual deployment process:
git checkout gh-pages
rm -f index.html && rm -rf assets
cp dist/index.html . && cp -r dist/assets .
git add -A
git commit -m "Deploy updates"
git push origin gh-pages
git checkout main
```

Note: Base path is configured as `/baseball/` in vite.config.ts for GitHub Pages.

## Architecture

### Single-Component Design

The entire game logic is contained in `/src/App.tsx` (~1700 lines). This is intentional - the game is simple enough that component extraction would add unnecessary complexity.

### Core Game State

```typescript
type TournamentType = 'koshien' | 'npb' | 'mlb'
type PitchType = 'straight' | 'curve-left' | 'curve-right' | 'fast' | 'slider' |
                 'sinker' | 'changeup' | 'fastball' | 'gyroball' | 'knuckleball' |
                 'cutter' | 'vanishing' | 'stopping'
```

**GameState** tracks: tournament progress, score, bases, outs, balls/strikes
**Pitch** object: position, velocity, type, progress (0-1), special properties (isVisible, isStopped)
**Ball** object: hit ball trajectory after bat contact

### Game Loop Architecture

1. **Animation Loop** (useEffect with requestAnimationFrame): Canvas rendering at 60fps
2. **Game Loop** (setInterval at 50fps): Physics updates for pitch/ball movement
3. **Pitch Interval** (setTimeout): Creates new pitches after delays
4. **BGM Loop** (setInterval): Plays procedural background music

Critical: Multiple refs track processed pitches/balls to prevent duplicate score processing.

### Tournament Progression

- **Koshien** (difficulty 1-5): Base pitches, progresses to NPB after 5 rounds
- **NPB** (difficulty 1-5): Adds knuckleball + cutter, progresses to MLB
- **MLB** (difficulty 1-5): Adds magical pitches (vanishing ball, stopping ball), final tournament

Each tournament increases difficulty: more pitch types, faster speeds, higher CPU scores.

### Pitch Physics System

Pitches use a `progress` value (0-1) for trajectory calculation:

- **Straight/Fast/Fastball**: Linear motion (newY = y + vy)
- **Curve/Slider/Sinker**: Parabolic curves using progress²
- **Changeup**: Deceleration (velocity decreases with progress)
- **Gyroball**: Acceleration (velocity increases with progress²)
- **Knuckleball**: Wobbling (sin wave oscillation on X axis)
- **Cutter**: Late sharp break (progress³ for delayed curve)
- **Vanishing**: Invisible during hitting zone (progress 0.4-0.7)
- **Stopping**: Stops at progress 0.25-0.35 for 20 frames, then resumes

### Hit Angle & Foul Ball System

**Left-handed batter mechanics**:
- Early timing (0.0) → +75° (pull to right, can be foul)
- Perfect timing (0.5) → 0° (center)
- Late timing (1.0) → -75° (opposite field left, can be foul)

Fair territory: 45°-135° (π/4 to 3π/4)
Foul balls add strikes (max 2, no change at 2 strikes)

### Hit Zone Configuration (on outfield fence)

Zones from left to right at radius 500px:
- OUT: 0.25-0.34 (9% width)
- H: 0.34-0.40 (6%)
- 2B: 0.40-0.45 (5%)
- 3B: 0.45-0.48 (3%)
- **HR: 0.48-0.52** (4%, center)
- 3B: 0.52-0.55 (3%)
- 2B: 0.55-0.60 (5%)
- H: 0.60-0.66 (6%)
- OUT: 0.66-0.75 (9%)

Angles are in radians (π * multiplier).

### Mobile Responsive Design

- **Detection**: `window.innerWidth < 768`
- **Canvas viewport**: Desktop (1000x550), Mobile (550x550 cropped via ctx.translate(-225, 0))
- **Scoreboard**: Compact mobile version shows abbreviated info
- **Layout**: Tailwind breakpoints (sm:, md:, lg:) for responsive UI

### Debug Mode (Hidden Feature)

Long-press (3 seconds) on volume mute icon (🔇) activates debug mode:
- Enables direct start from NPB or MLB tournaments
- Useful for testing advanced pitch types
- Period-limited tournament selection buttons now visible by default

### Audio System

All sounds generated procedurally using Web Audio API:
- **playSound()**: Oscillators for pitch effects (frequency, duration, waveform type)
- **playDrum()**: Noise buffers for percussion (kick, snare, hi-hat)
- **BGM**: Different note patterns per tournament round, changes to minor key for finals
- Volume controlled by state (0.0-1.0), stored in volumeRef to avoid callback recreation

## Key Development Notes

- **No test files**: This is a simple game without automated tests
- **Single TypeScript file**: Don't extract components unless complexity genuinely requires it
- **Canvas coordinates**: Origin (500, 530) is home plate, Y-axis inverts (lower = up)
- **Performance**: Animation loop depends on [pitch, ball, gameState.bases, swingAngle, gameStarted, isMobile]
- **Commit style**: Use heredoc for multi-line commit messages with Claude Code attribution

## OGP & Branding

- Title: "【9回裏】0点からの逆転劇が奇跡すぎたwww"
- Team name: "サヨナラ高校" (changed from "グッバイ高校")
- Favicon: `/public/favicon.ico`
- OGP image: `/public/main.png`
- Catchphrase: "奇跡の逆転劇を体験せよ！" (Experience the miracle comeback!)
- 日本語で受け答えやコメントを書くようにして