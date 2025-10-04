import { useState, useEffect, useRef, useCallback } from 'react'

type PitchType = 'straight' | 'curve-left' | 'curve-right' | 'fast' | 'slider' | 'sinker' | 'changeup' | 'fastball' | 'gyroball'
type HitResult = 'H' | '2B' | '3B' | 'HR' | 'OUT' | null
type Base = boolean[]

type TournamentType = 'koshien' | 'npb' | 'nlb'

interface GameState {
  round: number
  inning: number
  outs: number
  playerScore: number
  cpuScore: number
  bases: Base
  tournamentRound: number
  tournamentType: TournamentType
  isGameOver: boolean
  isWinner: boolean
  cpuInningScores: number[]
  playerInningScores: number[]
  showVictory: boolean
  cpuHits: number
  cpuErrors: number
  playerHits: number
  playerErrors: number
}

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  active: boolean
  hasScored: boolean
  startX: number
  startY: number
  id: number
}

interface Pitch {
  x: number
  y: number
  vx: number
  vy: number
  type: PitchType
  active: boolean
  startX: number
  startY: number
  progress: number
  initialVy: number
  hasBeenJudged: boolean
  id: number
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  // Generate inning scores that add up to final score
  const generateInningScores = (finalScore: number): number[] => {
    const scores = new Array(9).fill(0)
    let remaining = finalScore

    // Distribute scores across innings
    while (remaining > 0) {
      const inning = Math.floor(Math.random() * 8) // Only first 8 innings for CPU
      const score = Math.min(remaining, Math.floor(Math.random() * 3) + 1)
      scores[inning] += score
      remaining -= score
    }

    return scores
  }

  const [gameState, setGameState] = useState<GameState>({
    round: 1,
    inning: 9,
    outs: 0,
    playerScore: 0,
    cpuScore: 3,
    bases: [false, false, false],
    tournamentRound: 1,
    tournamentType: 'koshien',
    isGameOver: false,
    isWinner: false,
    cpuInningScores: generateInningScores(3),
    playerInningScores: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    showVictory: false,
    cpuHits: Math.floor(Math.random() * 5) + 5,
    cpuErrors: Math.floor(Math.random() * 3),
    playerHits: Math.floor(Math.random() * 4) + 3,
    playerErrors: Math.floor(Math.random() * 2)
  })

  const [pitch, setPitch] = useState<Pitch | null>(null)
  const [ball, setBall] = useState<Ball | null>(null)
  const [message, setMessage] = useState<string>('')
  const [showInstructions, setShowInstructions] = useState(true)
  const [swingAngle, setSwingAngle] = useState(0)
  const [balls, setBalls] = useState(0)
  const [strikes, setStrikes] = useState(0)
  const [currentPitchInfo, setCurrentPitchInfo] = useState<{ type: string; speed: number } | null>(null)
  const [gameStarted, setGameStarted] = useState(false)
  const [volume, setVolume] = useState(0.5) // 0.0 to 1.0
  const maxBalls = 4
  const maxStrikes = 3

  const pitchIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const bgmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastJudgedPitchRef = useRef<number>(0)
  const lastProcessedBallRef = useRef<number>(0)
  const gameLoopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Get pitch type name in Japanese
  const getPitchName = (type: PitchType): string => {
    const names: Record<PitchType, string> = {
      'straight': 'ストレート',
      'curve-left': 'カーブ（左）',
      'curve-right': 'カーブ（右）',
      'fast': '速球',
      'fastball': '剛速球',
      'slider': 'スライダー',
      'sinker': 'シンカー',
      'changeup': 'チェンジアップ',
      'gyroball': 'ジャイロボール'
    }
    return names[type]
  }

  // Calculate pitch speed in km/h from velocity
  const getPitchSpeed = (vy: number): number => {
    // Convert velocity to km/h (rough approximation)
    return Math.round(vy * 20 + 80)
  }

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = new AudioContext()
    return () => {
      audioContextRef.current?.close()
    }
  }, [])

  // Volume ref to avoid recreating callbacks
  const volumeRef = useRef(volume)
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Play sound effect
  const playSound = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (!audioContextRef.current || volumeRef.current === 0) return

    const oscillator = audioContextRef.current.createOscillator()
    const gainNode = audioContextRef.current.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContextRef.current.destination)

    oscillator.type = type
    oscillator.frequency.value = frequency

    gainNode.gain.setValueAtTime(0.3 * volumeRef.current, audioContextRef.current.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01 * volumeRef.current, 0.0001), audioContextRef.current.currentTime + duration)

    oscillator.start()
    oscillator.stop(audioContextRef.current.currentTime + duration)
  }, [])

  // Play drum beat (using noise)
  const playDrum = useCallback((type: 'kick' | 'snare' | 'hihat', duration: number) => {
    if (!audioContextRef.current || volumeRef.current === 0) return

    const context = audioContextRef.current
    const gainNode = context.createGain()
    gainNode.connect(context.destination)

    if (type === 'kick') {
      // Bass drum - low frequency oscillator
      const osc = context.createOscillator()
      osc.frequency.setValueAtTime(150, context.currentTime)
      osc.frequency.exponentialRampToValueAtTime(0.01, context.currentTime + duration)
      osc.connect(gainNode)

      gainNode.gain.setValueAtTime(0.5 * volumeRef.current, context.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01 * volumeRef.current, 0.0001), context.currentTime + duration)

      osc.start(context.currentTime)
      osc.stop(context.currentTime + duration)
    } else if (type === 'snare') {
      // Snare - noise burst
      const bufferSize = context.sampleRate * duration
      const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
      const data = buffer.getChannelData(0)

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      const noise = context.createBufferSource()
      noise.buffer = buffer
      noise.connect(gainNode)

      gainNode.gain.setValueAtTime(0.3 * volumeRef.current, context.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01 * volumeRef.current, 0.0001), context.currentTime + duration)

      noise.start(context.currentTime)
    } else {
      // Hi-hat - high frequency noise
      const bufferSize = context.sampleRate * duration
      const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
      const data = buffer.getChannelData(0)

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.1
      }

      const noise = context.createBufferSource()
      noise.buffer = buffer
      const filter = context.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 7000

      noise.connect(filter)
      filter.connect(gainNode)

      gainNode.gain.setValueAtTime(0.15 * volumeRef.current, context.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01 * volumeRef.current, 0.0001), context.currentTime + duration)

      noise.start(context.currentTime)
    }
  }, [])

  // Background music loop
  useEffect(() => {
    if (!gameStarted || gameState.isGameOver || gameState.showVictory) {
      // Stop BGM if game is over or showing victory
      if (bgmIntervalRef.current) {
        clearInterval(bgmIntervalRef.current)
        bgmIntervalRef.current = null
      }
      return
    }

    const playBGM = () => {
      if (!audioContextRef.current) return

      // BGM changes based on tournament round (gets more serious)
      const round = gameState.tournamentRound
      let notes: { freq: number; duration: number }[] = []

      if (round === 1) {
        // 1回戦 - Upbeat and cheerful (4/4, 8 bars)
        notes = [
          { freq: 523, duration: 0.4 }, { freq: 587, duration: 0.4 }, { freq: 659, duration: 0.4 }, { freq: 523, duration: 0.4 },
          { freq: 659, duration: 0.4 }, { freq: 698, duration: 0.4 }, { freq: 659, duration: 0.4 }, { freq: 587, duration: 0.4 },
          { freq: 523, duration: 0.4 }, { freq: 587, duration: 0.4 }, { freq: 659, duration: 0.4 }, { freq: 698, duration: 0.4 },
          { freq: 659, duration: 0.4 }, { freq: 587, duration: 0.4 }, { freq: 523, duration: 0.8 }
        ]
      } else if (round === 2) {
        // 2回戦 - Slightly tense (4/4, 8 bars)
        notes = [
          { freq: 440, duration: 0.4 }, { freq: 493, duration: 0.4 }, { freq: 523, duration: 0.4 }, { freq: 587, duration: 0.4 },
          { freq: 523, duration: 0.4 }, { freq: 493, duration: 0.4 }, { freq: 440, duration: 0.8 },
          { freq: 440, duration: 0.4 }, { freq: 493, duration: 0.4 }, { freq: 523, duration: 0.4 }, { freq: 587, duration: 0.4 },
          { freq: 523, duration: 0.4 }, { freq: 493, duration: 0.4 }, { freq: 440, duration: 0.8 }
        ]
      } else if (round === 3) {
        // 準々決勝 - More serious (4/4, 8 bars)
        notes = [
          { freq: 392, duration: 0.4 }, { freq: 440, duration: 0.4 }, { freq: 466, duration: 0.4 }, { freq: 523, duration: 0.4 },
          { freq: 466, duration: 0.4 }, { freq: 440, duration: 0.4 }, { freq: 392, duration: 0.8 },
          { freq: 392, duration: 0.4 }, { freq: 440, duration: 0.4 }, { freq: 466, duration: 0.4 }, { freq: 523, duration: 0.4 },
          { freq: 466, duration: 0.4 }, { freq: 440, duration: 0.4 }, { freq: 392, duration: 0.8 }
        ]
      } else if (round === 4) {
        // 準決勝 - Dramatic (4/4, 8 bars)
        notes = [
          { freq: 349, duration: 0.4 }, { freq: 392, duration: 0.4 }, { freq: 349, duration: 0.4 }, { freq: 330, duration: 0.4 },
          { freq: 349, duration: 0.4 }, { freq: 392, duration: 0.4 }, { freq: 440, duration: 0.8 },
          { freq: 349, duration: 0.4 }, { freq: 330, duration: 0.4 }, { freq: 294, duration: 0.4 }, { freq: 330, duration: 0.4 },
          { freq: 349, duration: 0.8 }, { freq: 330, duration: 0.8 }
        ]
      } else {
        // 決勝 - Epic and intense with minor key and seventh chords (4/4, 8 bars)
        notes = [
          { freq: 220, duration: 0.4 }, { freq: 247, duration: 0.4 }, { freq: 262, duration: 0.4 }, { freq: 294, duration: 0.4 },
          { freq: 330, duration: 0.4 }, { freq: 294, duration: 0.4 }, { freq: 262, duration: 0.8 },
          { freq: 220, duration: 0.4 }, { freq: 247, duration: 0.4 }, { freq: 262, duration: 0.4 }, { freq: 294, duration: 0.4 },
          { freq: 330, duration: 0.4 }, { freq: 392, duration: 0.4 }, { freq: 440, duration: 0.8 }
        ]
      }

      let time = 0
      let totalDuration = 0
      notes.forEach(note => {
        setTimeout(() => {
          playSound(note.freq, note.duration, 'triangle')
        }, time * 1000)
        time += note.duration
        totalDuration += note.duration
      })

      // Add drum beat - simple 4/4 pattern
      const drumPattern: { type: 'kick' | 'snare' | 'hihat'; time: number; duration: number }[] = []

      // Number of bars (8 bars for all rounds)
      const bars = 8

      // Standard 4/4 drum pattern
      for (let bar = 0; bar < bars; bar++) {
        const barOffset = bar * 1.6 // Each bar is 1.6 seconds (4 beats × 0.4s)

        // Beat 1: Kick
        drumPattern.push({ type: 'kick', time: barOffset + 0, duration: 0.1 })
        drumPattern.push({ type: 'hihat', time: barOffset + 0, duration: 0.05 })

        // Beat 2: Hihat
        drumPattern.push({ type: 'hihat', time: barOffset + 0.4, duration: 0.05 })

        // Beat 3: Snare
        drumPattern.push({ type: 'snare', time: barOffset + 0.8, duration: 0.1 })
        drumPattern.push({ type: 'hihat', time: barOffset + 0.8, duration: 0.05 })

        // Beat 4: Hihat
        drumPattern.push({ type: 'hihat', time: barOffset + 1.2, duration: 0.05 })
      }

      drumPattern.forEach(drum => {
        setTimeout(() => {
          playDrum(drum.type, drum.duration)
        }, drum.time * 1000)
      })

      // Return total duration for accurate loop timing
      return totalDuration
    }

    // Play first loop and calculate exact duration
    const duration = playBGM()

    // Loop based on actual total duration (in milliseconds)
    if (duration) {
      bgmIntervalRef.current = setInterval(playBGM, duration * 1000)
    }

    return () => {
      if (bgmIntervalRef.current) {
        clearInterval(bgmIntervalRef.current)
        bgmIntervalRef.current = null
      }
    }
  }, [playSound, playDrum, gameState.tournamentRound, gameStarted, gameState.isGameOver, gameState.showVictory])

  // Auto pitch
  useEffect(() => {
    if (!gameStarted || gameState.isGameOver || gameState.showVictory || pitch) return

    pitchIntervalRef.current = setTimeout(() => {
      // Difficulty increases with tournament round and type
      const tournamentType = gameState.tournamentType
      const difficulty = gameState.tournamentRound

      // Available pitch types expand with difficulty
      let pitchTypes: PitchType[] = ['straight', 'fast']

      // Koshien tournament
      if (tournamentType === 'koshien') {
        if (difficulty >= 2) {
          pitchTypes.push('curve-left', 'curve-right', 'changeup')
        }
        if (difficulty >= 3) {
          pitchTypes.push('slider', 'sinker', 'gyroball')
        }
        if (difficulty >= 4) {
          pitchTypes.push('fastball')
        }
      }
      // NPB tournament - starts with all pitch types from round 1
      else if (tournamentType === 'npb') {
        pitchTypes = ['straight', 'fast', 'curve-left', 'curve-right', 'changeup', 'slider', 'sinker', 'gyroball', 'fastball']
      }
      // NLB tournament - even harder
      else if (tournamentType === 'nlb') {
        pitchTypes = ['fast', 'curve-left', 'curve-right', 'changeup', 'slider', 'sinker', 'gyroball', 'fastball']
      }

      const selectedType = pitchTypes[Math.floor(Math.random() * pitchTypes.length)]

      let vx = 0
      let vy = 4

      // Speed multiplier based on tournament type
      const speedMultiplier = tournamentType === 'koshien' ? 1.0 : tournamentType === 'npb' ? 1.2 : 1.4

      // Random control (targeting variation)
      // 70% chance of strike zone, 30% chance of ball (outside strike zone)
      const isIntentionalBall = Math.random() < 0.3
      const targetXOffset = isIntentionalBall
        ? (Math.random() < 0.5 ? 1 : -1) * (40 + Math.random() * 20)  // Ball: ±40-60px from center at home plate
        : (Math.random() - 0.5) * 40  // Strike zone: ±20px from center at home plate

      // Calculate angle (vx) needed to reach target position
      // Distance from pitcher to home: 200px (y direction)
      const pitcherY = 510 - 200
      const homeY = 510
      const distanceY = homeY - pitcherY  // 200px

      switch (selectedType) {
        case 'straight':
          vy = 4 * speedMultiplier
          vx = (targetXOffset / distanceY) * vy  // Angle to reach target
          break
        case 'curve-left':
          vx = ((-0.8 + (Math.random() - 0.5) * 0.4) + (targetXOffset / distanceY) * 3.5) * speedMultiplier
          vy = 3.5 * speedMultiplier
          break
        case 'curve-right':
          vx = ((0.8 + (Math.random() - 0.5) * 0.4) + (targetXOffset / distanceY) * 3.5) * speedMultiplier
          vy = 3.5 * speedMultiplier
          break
        case 'fast':
          vy = 7 * speedMultiplier
          vx = (targetXOffset / distanceY) * vy
          break
        case 'fastball':
          vy = (8 + difficulty * 0.3) * speedMultiplier
          vx = (targetXOffset / distanceY) * vy
          break
        case 'slider':
          // Strong breaking ball - curves sharply out of strike zone
          const baseSliderVx = ((difficulty >= 4 || tournamentType !== 'koshien') ? 2.5 : 1.5) + (Math.random() - 0.5) * 0.6
          vx = (baseSliderVx + (targetXOffset / distanceY) * 5) * speedMultiplier
          vy = 5 * speedMultiplier
          break
        case 'sinker':
          vx = ((0.5 + (Math.random() - 0.5) * 0.4) + (targetXOffset / distanceY) * 6) * speedMultiplier
          vy = 6 * speedMultiplier
          break
        case 'changeup':
          vy = 8 * speedMultiplier
          vx = (targetXOffset / distanceY) * vy
          break
        case 'gyroball':
          vy = 2 * speedMultiplier
          vx = (targetXOffset / distanceY) * vy
          break
      }

      const pitchId = Date.now()
      const displaySpeed = getPitchSpeed(vy)
      const displayType = getPitchName(selectedType)

      console.log('📍 PITCH CREATED:', {
        id: pitchId,
        type: selectedType,
        displayType: displayType,
        vy: vy,
        displaySpeed: displaySpeed,
        vx: vx,
        targetXOffset: targetXOffset
      })

      setPitch({
        x: 500,
        y: pitcherY,
        vx,
        vy,
        type: selectedType,
        active: true,
        startX: 500,
        startY: pitcherY,
        progress: 0,
        initialVy: vy,
        hasBeenJudged: false,
        id: pitchId
      })

      // Set pitch info for display
      setCurrentPitchInfo({
        type: displayType,
        speed: displaySpeed
      })

      console.log('✅ Display info set:', displayType, displaySpeed, 'km/h')

      playSound(300, 0.1)
    }, 2000 + Math.random() * 2000)

    return () => {
      if (pitchIntervalRef.current) clearTimeout(pitchIntervalRef.current)
    }
  }, [pitch, gameState.isGameOver, gameState.showVictory, gameState.tournamentRound, playSound, gameStarted])

  // Handle swing
  const handleSwing = useCallback(() => {
    if (!pitch || !pitch.active || ball) return

    console.log('🏏 SWING! Pitch:', {
      id: pitch.id,
      type: pitch.type,
      position: { x: pitch.x, y: pitch.y }
    })

    // Mark this pitch as judged BEFORE any async operations
    const currentPitchId = pitch.id
    lastJudgedPitchRef.current = currentPitchId

    // Full 360 degree swing
    let currentAngle = 0
    const swingDuration = 300
    const swingInterval = setInterval(() => {
      currentAngle += Math.PI * 2 / (swingDuration / 16)
      setSwingAngle(currentAngle)
      if (currentAngle >= Math.PI * 2) {
        clearInterval(swingInterval)
        setSwingAngle(0)
      }
    }, 16)

    // Check if ball is in hitting zone (near home plate)
    // Home plate width is about 30px (485-515), so bat hitting zone should be similar
    const homeY = 530 - 20
    const hitZone = pitch.y >= homeY - 100 && pitch.y <= homeY + 20 && Math.abs(pitch.x - 500) < 15

    if (hitZone) {
      console.log('💥 HIT!')
      const angle = (Math.random() - 0.5) * Math.PI / 3
      const speed = 8 + Math.random() * 4
      const vx = speed * Math.sin(angle)
      const vy = -speed * Math.cos(angle)

      setBall({
        x: pitch.x,
        y: pitch.y, // Hit position where bat meets ball
        vx: vx,
        vy: vy,
        active: true,
        hasScored: false,
        startX: pitch.x,
        startY: pitch.y,
        id: Date.now()
      })

      setPitch(null)
      // Keep pitch info displayed until next pitch
      playSound(800, 0.15, 'square')
      setBalls(0)
      setStrikes(0)
    } else {
      // Swing and miss - always count strike when swinging and missing
      console.log('❌ Swing and miss!')
      playSound(200, 0.2)
      setPitch(null)
      // Keep pitch info displayed until next pitch

      setStrikes(prev => {
        const newStrikes = prev + 1
        if (newStrikes >= maxStrikes) {
          handleStrike()
          return 0
        }
        return newStrikes
      })
    }
  }, [pitch, ball, playSound])

  // Handle strike/out
  const handleStrike = () => {
    setBalls(0)
    setStrikes(0)

    setGameState(prev => {
      const newOuts = prev.outs + 1

      if (newOuts >= 3) {
        if (prev.playerScore <= prev.cpuScore) {
          return {
            ...prev,
            isGameOver: true,
            isWinner: false
          }
        } else {
          return handleTournamentWin(prev)
        }
      }

      return {
        ...prev,
        outs: newOuts,
        bases: [false, false, false]
      }
    })

    setMessage('アウト!')
    setTimeout(() => setMessage(''), 1500)
  }

  // Handle tournament progression
  const handleTournamentWin = (state: GameState): GameState => {
    // Check if tournament is complete
    if (state.tournamentType === 'koshien' && state.tournamentRound >= 5) {
      // Move to NPB tournament - much harder than Koshien final
      setTimeout(() => {
        setPitch(null)
        setBall(null)
        setBalls(0)
        setStrikes(0)
        setGameState(prev => {
          const newCpuScore = 6 // Higher than Koshien final (which ends at round 5 = 3+4=7 score)
          return {
            ...prev,
            tournamentType: 'npb',
            tournamentRound: 1,
            round: 1,
            inning: 9,
            outs: 0,
            playerScore: 0,
            cpuScore: newCpuScore,
            bases: [false, false, false],
            cpuInningScores: generateInningScores(newCpuScore),
            playerInningScores: [0, 0, 0, 0, 0, 0, 0, 0, 0],
            showVictory: false,
            cpuHits: Math.floor(Math.random() * 5) + 9,
            cpuErrors: Math.floor(Math.random() * 2),
            playerHits: Math.floor(Math.random() * 4) + 3,
            playerErrors: Math.floor(Math.random() * 2)
          }
        })
      }, 3000)
      return { ...state, showVictory: true }
    } else if (state.tournamentType === 'npb' && state.tournamentRound >= 5) {
      // Move to NLB tournament
      setTimeout(() => {
        setPitch(null)
        setBall(null)
        setBalls(0)
        setStrikes(0)
        setGameState(prev => {
          const newCpuScore = 5
          return {
            ...prev,
            tournamentType: 'nlb',
            tournamentRound: 1,
            round: 1,
            inning: 9,
            outs: 0,
            playerScore: 0,
            cpuScore: newCpuScore,
            bases: [false, false, false],
            cpuInningScores: generateInningScores(newCpuScore),
            playerInningScores: [0, 0, 0, 0, 0, 0, 0, 0, 0],
            showVictory: false,
            cpuHits: Math.floor(Math.random() * 5) + 8,
            cpuErrors: Math.floor(Math.random() * 2),
            playerHits: Math.floor(Math.random() * 4) + 3,
            playerErrors: Math.floor(Math.random() * 2)
          }
        })
      }, 3000)
      return { ...state, showVictory: true }
    } else if (state.tournamentType === 'nlb' && state.tournamentRound >= 5) {
      // Final victory
      return {
        ...state,
        isGameOver: true,
        isWinner: true,
        showVictory: true
      }
    }

    // Continue in current tournament
    setTimeout(() => {
      setPitch(null)
      setBall(null)
      setBalls(0)
      setStrikes(0)
      setGameState(prev => {
        const baseScore = prev.tournamentType === 'koshien' ? 3 : prev.tournamentType === 'npb' ? 4 : 5
        const newCpuScore = baseScore + prev.tournamentRound
        return {
          ...prev,
          tournamentRound: prev.tournamentRound + 1,
          round: 1,
          inning: 9,
          outs: 0,
          playerScore: 0,
          cpuScore: newCpuScore,
          bases: [false, false, false],
          cpuInningScores: generateInningScores(newCpuScore),
          playerInningScores: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          showVictory: false,
          cpuHits: Math.floor(Math.random() * 5) + (prev.tournamentType === 'nlb' ? 8 : prev.tournamentType === 'npb' ? 7 : 5),
          cpuErrors: Math.floor(Math.random() * 2),
          playerHits: Math.floor(Math.random() * 4) + 3,
          playerErrors: Math.floor(Math.random() * 2)
        }
      })
    }, 3000)

    return {
      ...state,
      showVictory: true
    }
  }

  // Check hit result based on ball position
  const checkHitResult = (x: number, y: number): HitResult => {
    // Calculate angle and distance from home plate
    const dx = x - 500
    const dy = 530 - y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)

    // Must reach the fence (distance ~450+)
    if (distance < 400) {
      return 'OUT'
    }

    // Check if within fair territory (45 to 135 degrees)
    if (angle < Math.PI * 0.25 || angle > Math.PI * 0.75) {
      return 'OUT'
    }

    // Define fence zones matching visual display
    const zones = [
      { minAngle: Math.PI * 0.30, maxAngle: Math.PI * 0.38, result: 'OUT' as HitResult },
      { minAngle: Math.PI * 0.38, maxAngle: Math.PI * 0.44, result: '2B' as HitResult },
      { minAngle: Math.PI * 0.44, maxAngle: Math.PI * 0.48, result: '3B' as HitResult },
      { minAngle: Math.PI * 0.48, maxAngle: Math.PI * 0.52, result: 'HR' as HitResult },
      { minAngle: Math.PI * 0.52, maxAngle: Math.PI * 0.56, result: '3B' as HitResult },
      { minAngle: Math.PI * 0.56, maxAngle: Math.PI * 0.62, result: '2B' as HitResult },
      { minAngle: Math.PI * 0.62, maxAngle: Math.PI * 0.70, result: 'OUT' as HitResult },
    ]

    // Check H zone first (inner zone)
    if (angle >= Math.PI * 0.40 && angle <= Math.PI * 0.60 && distance < 480) {
      return 'H'
    }

    for (const zone of zones) {
      if (angle >= zone.minAngle && angle <= zone.maxAngle) {
        return zone.result
      }
    }

    return 'OUT'
  }

  // Process hit result
  const processHitResult = (result: HitResult) => {
    if (!result) return

    // Mark ball as scored to prevent double processing
    setBall(prev => prev ? { ...prev, hasScored: true } : null)
    setBalls(0)
    setStrikes(0)

    setGameState(prev => {
      let newScore = prev.playerScore
      let newBases = [...prev.bases]
      let newOuts = prev.outs
      let scoredThisPlay = 0

      switch (result) {
        case 'H':
          if (newBases[2]) scoredThisPlay++
          newBases = [true, newBases[0], newBases[1]]
          setMessage('ヒット!')
          playSound(600, 0.3)
          break
        case '2B':
          if (newBases[2]) scoredThisPlay++
          if (newBases[1]) scoredThisPlay++
          newBases = [false, true, newBases[0]]
          setMessage('ツーベース!')
          playSound(700, 0.3)
          break
        case '3B':
          scoredThisPlay += newBases.filter(b => b).length
          newBases = [false, false, true]
          setMessage('スリーベース!')
          playSound(800, 0.3)
          break
        case 'HR':
          scoredThisPlay += newBases.filter(b => b).length + 1
          newBases = [false, false, false]
          setMessage('ホームラン!!')
          playSound(1000, 0.5, 'square')
          break
        case 'OUT':
          newOuts++
          newBases = [false, false, false]
          setMessage('アウト!')
          playSound(200, 0.3)
          break
      }

      newScore += scoredThisPlay
      const newPlayerInningScores = [...prev.playerInningScores]
      newPlayerInningScores[8] += scoredThisPlay // 9th inning

      if (newOuts >= 3) {
        if (newScore <= prev.cpuScore) {
          return {
            ...prev,
            playerScore: newScore,
            playerInningScores: newPlayerInningScores,
            isGameOver: true,
            isWinner: false
          }
        } else {
          return handleTournamentWin({ ...prev, playerScore: newScore, playerInningScores: newPlayerInningScores })
        }
      }

      if (newScore > prev.cpuScore) {
        return handleTournamentWin({ ...prev, playerScore: newScore, playerInningScores: newPlayerInningScores, bases: newBases, outs: newOuts })
      }

      return {
        ...prev,
        playerScore: newScore,
        playerInningScores: newPlayerInningScores,
        bases: newBases,
        outs: newOuts
      }
    })

    setTimeout(() => setMessage(''), 1500)
  }

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const animate = () => {
      ctx.clearRect(0, 0, 1000, 550)

      // Draw grass background
      ctx.fillStyle = '#15803d'
      ctx.fillRect(0, 0, 1000, 550)

      // Draw outfield (grass) - 90 degree fan shape
      ctx.fillStyle = '#15803d'
      ctx.beginPath()
      ctx.moveTo(500, 530)
      ctx.arc(500, 530, 550, Math.PI * 0.75, Math.PI * 0.25, true)
      ctx.lineTo(500, 530)
      ctx.closePath()
      ctx.fill()

      // Draw grass pattern
      ctx.strokeStyle = '#14532d'
      ctx.lineWidth = 2
      for (let i = 100; i < 550; i += 30) {
        ctx.beginPath()
        ctx.arc(500, 530, i, Math.PI * 0.75, Math.PI * 0.25, true)
        ctx.stroke()
      }

      // Draw warning track
      ctx.fillStyle = '#92400e'
      ctx.beginPath()
      ctx.moveTo(500, 530)
      ctx.arc(500, 530, 550, Math.PI * 0.75, Math.PI * 0.25, true)
      ctx.lineTo(500, 530)
      ctx.arc(500, 530, 510, Math.PI * 0.25, Math.PI * 0.75)
      ctx.closePath()
      ctx.fill()

      // Draw outfield fence wall
      ctx.fillStyle = '#2d3748'
      ctx.beginPath()
      ctx.moveTo(500, 530)
      ctx.arc(500, 530, 510, Math.PI * 0.75, Math.PI * 0.25, true)
      ctx.lineTo(500, 530)
      ctx.arc(500, 530, 490, Math.PI * 0.25, Math.PI * 0.75)
      ctx.closePath()
      ctx.fill()


      // Draw fence top
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(500, 530, 510, Math.PI * 0.75, Math.PI * 0.25, true)
      ctx.stroke()

      // Draw left and right foul poles
      const foulPoleLeft = { x: 500 + Math.cos(Math.PI * 0.75) * 510, y: 530 - Math.sin(Math.PI * 0.75) * 510 }
      const foulPoleRight = { x: 500 + Math.cos(Math.PI * 0.25) * 510, y: 530 - Math.sin(Math.PI * 0.25) * 510 }

      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(foulPoleLeft.x, foulPoleLeft.y)
      ctx.lineTo(foulPoleLeft.x, foulPoleLeft.y - 20)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(foulPoleRight.x, foulPoleRight.y)
      ctx.lineTo(foulPoleRight.x, foulPoleRight.y - 20)
      ctx.stroke()

      // Draw infield (dirt) - square rotated 45 degrees
      const infield_size = 200
      const homeY = 530 - 20
      ctx.fillStyle = '#a67c52'
      ctx.beginPath()
      ctx.moveTo(500, homeY) // home
      ctx.lineTo(500 + infield_size, homeY - infield_size) // 1st
      ctx.lineTo(500, homeY - infield_size * 2) // 2nd
      ctx.lineTo(500 - infield_size, homeY - infield_size) // 3rd
      ctx.closePath()
      ctx.fill()

      // Draw foul lines (45 degree angles from home plate)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 4
      // Left foul line
      ctx.beginPath()
      ctx.moveTo(500, 530)
      ctx.lineTo(500 - 550, 530 - 550)
      ctx.stroke()
      // Right foul line
      ctx.beginPath()
      ctx.moveTo(500, 530)
      ctx.lineTo(500 + 550, 530 - 550)
      ctx.stroke()

      // Draw pitcher's mound
      const pitcherY = homeY - infield_size
      ctx.fillStyle = '#8b6f47'
      ctx.beginPath()
      ctx.arc(500, pitcherY, 30, 0, Math.PI * 2)
      ctx.fill()

      // Draw outfield zones on fence (90 degree span)
      const fenceRadius = 500
      const zones = [
        { startAngle: Math.PI * 0.30, endAngle: Math.PI * 0.38, label: 'OUT', color: '#ef4444' },
        { startAngle: Math.PI * 0.38, endAngle: Math.PI * 0.44, label: '2B', color: '#34d399' },
        { startAngle: Math.PI * 0.44, endAngle: Math.PI * 0.48, label: '3B', color: '#60a5fa' },
        { startAngle: Math.PI * 0.48, endAngle: Math.PI * 0.52, label: 'HR', color: '#fbbf24' },
        { startAngle: Math.PI * 0.52, endAngle: Math.PI * 0.56, label: '3B', color: '#60a5fa' },
        { startAngle: Math.PI * 0.56, endAngle: Math.PI * 0.62, label: '2B', color: '#34d399' },
        { startAngle: Math.PI * 0.62, endAngle: Math.PI * 0.70, label: 'OUT', color: '#ef4444' },
        { startAngle: Math.PI * 0.40, endAngle: Math.PI * 0.60, label: 'H', color: '#a78bfa' },
      ]

      zones.forEach((zone, idx) => {
        // Skip H zone for first pass (draw it last to be on top)
        if (idx === zones.length - 1) return

        // Draw colored section on fence
        ctx.fillStyle = zone.color
        ctx.beginPath()
        ctx.arc(500, 530, fenceRadius, zone.startAngle, zone.endAngle)
        ctx.arc(500, 530, fenceRadius - 30, zone.endAngle, zone.startAngle, true)
        ctx.closePath()
        ctx.fill()

        // Draw border lines
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(500 + Math.cos(zone.startAngle) * (fenceRadius - 30), 530 - Math.sin(zone.startAngle) * (fenceRadius - 30))
        ctx.lineTo(500 + Math.cos(zone.startAngle) * fenceRadius, 530 - Math.sin(zone.startAngle) * fenceRadius)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(500 + Math.cos(zone.endAngle) * (fenceRadius - 30), 530 - Math.sin(zone.endAngle) * (fenceRadius - 30))
        ctx.lineTo(500 + Math.cos(zone.endAngle) * fenceRadius, 530 - Math.sin(zone.endAngle) * fenceRadius)
        ctx.stroke()

        // Draw label
        const labelAngle = (zone.startAngle + zone.endAngle) / 2
        const labelX = 500 + Math.cos(labelAngle) * (fenceRadius - 15)
        const labelY = 530 - Math.sin(labelAngle) * (fenceRadius - 15)

        ctx.save()
        ctx.translate(labelX, labelY)
        ctx.rotate(-labelAngle + Math.PI / 2)
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 3
        ctx.font = 'bold 18px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.strokeText(zone.label, 0, 0)
        ctx.fillText(zone.label, 0, 0)
        ctx.restore()
      })

      // Draw H zone (center, overlapping)
      const hZone = zones[zones.length - 1]
      ctx.fillStyle = hZone.color
      ctx.beginPath()
      ctx.arc(500, 530, fenceRadius - 35, hZone.startAngle, hZone.endAngle)
      ctx.arc(500, 530, fenceRadius - 60, hZone.endAngle, hZone.startAngle, true)
      ctx.closePath()
      ctx.fill()

      // Draw H zone borders
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(500 + Math.cos(hZone.startAngle) * (fenceRadius - 60), 530 - Math.sin(hZone.startAngle) * (fenceRadius - 60))
      ctx.lineTo(500 + Math.cos(hZone.startAngle) * (fenceRadius - 35), 530 - Math.sin(hZone.startAngle) * (fenceRadius - 35))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(500 + Math.cos(hZone.endAngle) * (fenceRadius - 60), 530 - Math.sin(hZone.endAngle) * (fenceRadius - 60))
      ctx.lineTo(500 + Math.cos(hZone.endAngle) * (fenceRadius - 35), 530 - Math.sin(hZone.endAngle) * (fenceRadius - 35))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(500, 530, fenceRadius - 60, hZone.startAngle, hZone.endAngle)
      ctx.stroke()

      const hLabelAngle = (hZone.startAngle + hZone.endAngle) / 2
      const hLabelX = 500 + Math.cos(hLabelAngle) * (fenceRadius - 47)
      const hLabelY = 530 - Math.sin(hLabelAngle) * (fenceRadius - 47)

      ctx.save()
      ctx.translate(hLabelX, hLabelY)
      ctx.rotate(-hLabelAngle + Math.PI / 2)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.font = 'bold 18px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeText('H', 0, 0)
      ctx.fillText('H', 0, 0)
      ctx.restore()

      // Draw bases (squares)
      const basePositions = [
        { x: 500 + infield_size, y: homeY - infield_size }, // 1st
        { x: 500, y: homeY - infield_size * 2 }, // 2nd
        { x: 500 - infield_size, y: homeY - infield_size }, // 3rd
      ]

      basePositions.forEach((pos, i) => {
        ctx.save()
        ctx.translate(pos.x, pos.y)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = '#fff'
        ctx.fillRect(-15, -15, 30, 30)
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 2
        ctx.strokeRect(-15, -15, 30, 30)
        ctx.restore()

        // Draw runner if on base
        if (gameState.bases[i]) {
          ctx.fillStyle = '#ef4444'
          ctx.beginPath()
          ctx.arc(pos.x, pos.y - 30, 8, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillRect(pos.x - 5, pos.y - 22, 10, 18)
          ctx.fillRect(pos.x - 10, pos.y - 15, 5, 12)
          ctx.fillRect(pos.x + 5, pos.y - 15, 5, 12)
        }
      })

      // Home plate (pentagon)
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(500, homeY + 15)
      ctx.lineTo(485, homeY)
      ctx.lineTo(485, homeY - 15)
      ctx.lineTo(515, homeY - 15)
      ctx.lineTo(515, homeY)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw pitcher
      ctx.fillStyle = '#1e40af'
      ctx.beginPath()
      ctx.arc(500, pitcherY - 10, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(495, pitcherY, 10, 20)
      ctx.fillRect(490, pitcherY + 5, 5, 12)
      ctx.fillRect(505, pitcherY + 5, 5, 12)

      // Draw batter
      const batterX = 530
      const batterY = homeY - 60
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(batterX, batterY, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(batterX - 5, batterY + 10, 10, 20)
      ctx.fillRect(batterX - 10, batterY + 15, 5, 12)
      ctx.fillRect(batterX + 5, batterY + 15, 5, 12)

      // Draw bat
      ctx.save()
      ctx.translate(batterX, batterY + 15)
      ctx.rotate(-Math.PI / 4 + swingAngle)
      ctx.fillStyle = '#8b4513'
      ctx.fillRect(0, 0, 5, 40)
      ctx.restore()

      // Draw pitch
      if (pitch && pitch.active) {
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(pitch.x, pitch.y, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Draw ball
      if (ball && ball.active) {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [pitch, ball, gameState.bases, swingAngle, gameStarted])

  // Game loop - simple setInterval approach
  useEffect(() => {
    console.log('Game loop effect called, existing interval:', gameLoopIntervalRef.current)

    if (gameLoopIntervalRef.current) {
      console.log('Game loop already running, skipping')
      return
    }

    console.log('Game loop initialized')

    gameLoopIntervalRef.current = setInterval(() => {
      // Update pitch
      setPitch(prev => {
        if (!prev || !prev.active) {
          return prev
        }


        const newProgress = prev.progress + 0.02
        const homeY = 530 - 20
        const targetX = 500
        const targetY = homeY

        let newX = prev.x
        let newY = prev.y

        // Straight balls (straight, fast, fastball) - linear motion with angle
        const isStraightType = prev.type === 'straight' || prev.type === 'fast' || prev.type === 'fastball'

        if (isStraightType) {
          // Straight pitch - no curve, just linear motion
          newY = prev.y + prev.vy
          newX = prev.x + prev.vx
        } else if (prev.type === 'changeup') {
          const decelerationFactor = newProgress
          const minSpeed = prev.initialVy * 0.5
          const currentVy = prev.initialVy - (prev.initialVy - minSpeed) * decelerationFactor
          const finalVy = Math.max(currentVy, minSpeed)

          newY = prev.y + finalVy
          newX = prev.x + prev.vx  // Changeup also travels in straight line
        } else if (prev.type === 'gyroball') {
          const accelerationFactor = Math.pow(newProgress, 2)
          const maxSpeed = prev.initialVy * 5
          const currentVy = prev.initialVy + (maxSpeed - prev.initialVy) * accelerationFactor

          newY = prev.y + currentVy
          newX = prev.x + prev.vx  // Gyroball also travels in straight line
        } else {
          // Breaking balls (curve, slider, sinker) - use curve logic
          const isStrongBreak = Math.abs(prev.vx) > 1.5

          if (isStrongBreak) {
            const breakProgress = Math.pow(newProgress, 2)
            const finalBreakDistance = 90 + Math.random() * 15
            const parabolaX = breakProgress * finalBreakDistance * Math.sign(prev.vx)

            newY = prev.startY + (targetY - prev.startY) * newProgress
            newX = targetX + parabolaX
          } else {
            const maxCurveDistance = Math.abs(prev.vx) * 40
            const parabolaX = Math.sin(newProgress * Math.PI) * maxCurveDistance * Math.sign(prev.vx)

            newY = prev.startY + (targetY - prev.startY) * newProgress
            newX = targetX + parabolaX
          }
        }

        // Looking strike/ball judgment
        const shouldJudge = newY > homeY + 20
        const notJudged = !prev.hasBeenJudged
        const notLastJudged = lastJudgedPitchRef.current !== prev.id

        if (shouldJudge && notJudged && notLastJudged) {
          console.log('⚾ PITCH JUDGED:', {
            id: prev.id,
            type: prev.type,
            position: { x: newX, y: newY },
            isOverPlate: newX >= 485 && newX <= 515
          })
          lastJudgedPitchRef.current = prev.id

          const isOverHomePlate = newX >= 485 && newX <= 515

          if (isOverHomePlate) {
            console.log('👁️ Looking strike!')
            setStrikes(s => {
              const newStrikes = s + 1
              if (newStrikes >= maxStrikes) {
                handleStrike()
                return 0
              }
              return newStrikes
            })
            setMessage('見逃しストライク!')
            setTimeout(() => setMessage(''), 1000)
          } else {
            console.log('🟢 Ball!')
            setBalls(b => {
              const newBalls = b + 1
              if (newBalls >= maxBalls) {
                setGameState(gs => {
                  let newScore = gs.playerScore
                  let newBases = [...gs.bases]

                  if (newBases[2] && newBases[1] && newBases[0]) {
                    newScore++
                  }
                  if (newBases[1] && newBases[0]) {
                    newBases[2] = true
                  }
                  if (newBases[0]) {
                    newBases[1] = true
                  }
                  newBases[0] = true

                  setMessage('フォアボール!')
                  setTimeout(() => setMessage(''), 1500)

                  return {
                    ...gs,
                    playerScore: newScore,
                    bases: newBases
                  }
                })
                return 0
              }
              return newBalls
            })
          }
          // Keep pitch info displayed until next pitch
          return null
        }

        return {
          ...prev,
          x: newX,
          y: newY,
          progress: newProgress
        }
      })

      // Update ball
      setBall(prev => {
        if (!prev || !prev.active) return prev

        const newX = prev.x + prev.vx
        const newY = prev.y + prev.vy

        const dx = newX - prev.startX
        const dy = prev.startY - newY
        const distance = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx)

        if (distance >= 490 || newY < 0 || newX < 0 || newX > 1000) {
          if (!prev.hasScored && lastProcessedBallRef.current !== prev.id) {
            lastProcessedBallRef.current = prev.id
            const result = checkHitResult(newX, newY)
            processHitResult(result)
          }
          return null
        }

        if (angle < Math.PI * 0.25 || angle > Math.PI * 0.75) {
          if (distance > 300) {
            if (!prev.hasScored && lastProcessedBallRef.current !== prev.id) {
              lastProcessedBallRef.current = prev.id
              const result = checkHitResult(newX, newY)
              processHitResult(result)
            }
            return null
          }
        }

        return {
          ...prev,
          x: newX,
          y: newY
        }
      })
    }, 16)

    return () => {
      console.log('Game loop cleanup')
      if (gameLoopIntervalRef.current) {
        clearInterval(gameLoopIntervalRef.current)
        gameLoopIntervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restart game
  const restartGame = useCallback(() => {
    setGameState({
      round: 1,
      inning: 9,
      outs: 0,
      playerScore: 0,
      cpuScore: 3,
      bases: [false, false, false],
      tournamentRound: 1,
      tournamentType: 'koshien',
      isGameOver: false,
      isWinner: false,
      cpuInningScores: generateInningScores(3),
      playerInningScores: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      showVictory: false,
      cpuHits: Math.floor(Math.random() * 5) + 5,
      cpuErrors: Math.floor(Math.random() * 3),
      playerHits: Math.floor(Math.random() * 4) + 3,
      playerErrors: Math.floor(Math.random() * 2)
    })
    setPitch(null)
    setBall(null)
    setMessage('')
    setBalls(0)
    setStrikes(0)
    setCurrentPitchInfo(null)
  }, [])

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (gameState.isGameOver) {
          restartGame()
        } else {
          handleSwing()
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handleSwing, gameState.isGameOver, restartGame])

  // Touch/click controls for mobile
  const handleCanvasInteraction = useCallback(() => {
    if (gameState.isGameOver) {
      restartGame()
    } else {
      handleSwing()
    }
  }, [handleSwing, gameState.isGameOver, restartGame])

  const getTournamentInfo = (type: TournamentType, round: number) => {
    const roundNames = ['1回戦', '2回戦', '準々決勝', '準決勝', '決勝']

    if (type === 'koshien') {
      const opponents = ['桜丘高校', '北陵高校', '緑ヶ丘高校', '星陵高校', '王者高校']
      return {
        title: '甲子園トーナメント',
        roundName: roundNames[round - 1],
        opponent: opponents[round - 1]
      }
    } else if (type === 'npb') {
      const opponents = ['読売ジャイアンツ', '阪神タイガース', '広島カープ', '中日ドラゴンズ', '横浜ベイスターズ']
      return {
        title: 'NPBトーナメント',
        roundName: roundNames[round - 1],
        opponent: opponents[round - 1]
      }
    } else {
      const opponents = ['Yankees', 'Red Sox', 'Dodgers', 'Cubs', 'Astros']
      return {
        title: 'NLB Tournament',
        roundName: roundNames[round - 1],
        opponent: opponents[round - 1]
      }
    }
  }

  // Start screen - show before game starts
  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-gray-900 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-50"></div>

        {/* Start Screen */}
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h1 className="text-6xl font-bold mb-4 text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">
            甲子園トーナメント
          </h1>
          <h2 className="text-3xl font-bold mb-8 text-gray-300">野球盤ゲーム</h2>

          <div className="bg-gray-900 bg-opacity-90 border-4 border-gray-700 rounded-lg p-8 mb-8">
            <h3 className="text-xl font-bold mb-4 text-yellow-400">ゲームルール</h3>
            <div className="text-left text-gray-300 space-y-2 mb-6">
              <p>• 9回裏、3点差を追いかける逆転劇</p>
              <p>• サヨナラ勝ちで次の回戦へ進出</p>
              <p>• 5つの回戦を勝ち抜いて優勝を目指せ！</p>
              <p>• スペースキーまたは画面タップでスイング</p>
            </div>

            <h3 className="text-xl font-bold mb-4 text-yellow-400">音量設定</h3>
            <div className="flex items-center justify-center gap-4 mb-8">
              <span className="text-sm text-gray-400">🔇</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume * 100}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                className="w-64 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
                }}
              />
              <span className="text-sm text-gray-400">🔊</span>
              <span className="text-sm text-gray-300 w-12">{Math.round(volume * 100)}%</span>
            </div>

            <button
              onClick={() => setGameStarted(true)}
              className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white text-3xl font-bold py-6 px-16 rounded-lg shadow-[0_0_30px_rgba(34,197,94,0.5)] hover:shadow-[0_0_40px_rgba(34,197,94,0.7)] transition-all duration-300 transform hover:scale-105"
            >
              プレイボール！
            </button>
          </div>

          <div className="text-sm text-gray-500">
            <p>© 2025 野球盤ゲーム</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-gray-900 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-50"></div>

      {/* Rich Scoreboard */}
      <div className="w-full max-w-5xl mb-6 bg-gradient-to-b from-gray-800 to-gray-900 border-4 border-gray-600 rounded-lg shadow-2xl overflow-hidden relative z-10">
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 py-3 px-4 text-center border-b border-gray-600">
          <h1 className="text-2xl font-bold tracking-wide text-white drop-shadow-lg">{getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).title} - {getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).roundName}</h1>
        </div>

        <div className="p-6">
          {/* Scoreboard Table */}
          <div className="bg-gray-950 rounded-lg p-4 border-2 border-gray-700 mb-6 overflow-x-auto">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 px-2 text-gray-400 font-bold">TEAM</th>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(inning => (
                    <th key={inning} className="py-2 px-2 text-gray-400 font-bold">{inning}</th>
                  ))}
                  <th className="py-2 px-2 text-yellow-400 font-bold">R</th>
                  <th className="py-2 px-2 text-gray-400 font-bold">H</th>
                  <th className="py-2 px-2 text-gray-400 font-bold">E</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-700">
                  <td className="py-2 px-2 text-gray-300 font-bold">{getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).opponent}</td>
                  {gameState.cpuInningScores.map((score, i) => (
                    <td key={i} className="py-2 px-2 text-white">{score}</td>
                  ))}
                  <td className="py-2 px-2 text-yellow-400 font-bold text-lg">{gameState.cpuScore}</td>
                  <td className="py-2 px-2 text-gray-400">{gameState.cpuHits}</td>
                  <td className="py-2 px-2 text-gray-400">{gameState.cpuErrors}</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 text-green-400 font-bold">グッバイ高校</td>
                  {gameState.playerInningScores.map((score, i) => {
                    if (i === 8) {
                      // 9th inning
                      if (gameState.playerScore > gameState.cpuScore && score > 0) {
                        return <td key={i} className="py-2 px-2 text-white">{score}X</td>
                      } else if (score > 0) {
                        return <td key={i} className="py-2 px-2 text-white">{score}</td>
                      } else {
                        return <td key={i} className="py-2 px-2 text-white"></td>
                      }
                    }
                    return <td key={i} className="py-2 px-2 text-white">{score}</td>
                  })}
                  <td className="py-2 px-2 text-yellow-400 font-bold text-lg">{gameState.playerScore}</td>
                  <td className="py-2 px-2 text-gray-400">{gameState.playerHits}</td>
                  <td className="py-2 px-2 text-gray-400">{gameState.playerErrors}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Combined Info Row - Bases (with BSO on left), Pitch Info */}
          <div className="grid grid-cols-2 gap-4">
            {/* Base runners display with BSO */}
            <div className="flex justify-center items-center gap-3 bg-gray-950 rounded-lg py-3 px-3 border border-gray-700">
              {/* BSO on the left */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 font-bold w-3">B</span>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-full border ${
                          i < balls ? 'bg-green-600 border-green-500' : 'bg-gray-900 border-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 font-bold w-3">S</span>
                  <div className="flex gap-1">
                    {[0, 1].map(i => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-full border ${
                          i < strikes ? 'bg-yellow-600 border-yellow-500' : 'bg-gray-900 border-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 font-bold w-3">O</span>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-full border ${
                          i < gameState.outs ? 'bg-red-600 border-red-500' : 'bg-gray-900 border-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Vertical divider */}
              <div className="h-16 w-px bg-gray-700"></div>

              {/* Bases on the right */}
              <div className="flex flex-col items-center justify-center gap-1">
                <span className="text-xs text-gray-400">走者</span>
                <div className="flex gap-1">
                  {['1塁', '2塁', '3塁'].map((base, i) => (
                    <div
                      key={i}
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        gameState.bases[i] ? 'bg-gray-700 text-white border border-gray-600' : 'bg-gray-900 text-gray-500'
                      }`}
                    >
                      {base}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pitch info display */}
            {currentPitchInfo ? (
              <div className="flex justify-center items-center gap-3 bg-gray-950 rounded-lg py-3 px-3 border border-yellow-600">
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">球種</div>
                  <div className="text-sm font-bold text-yellow-400">{currentPitchInfo.type}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">球速</div>
                  <div className="text-sm font-bold text-yellow-400">{currentPitchInfo.speed} km/h</div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-950 rounded-lg py-3 px-3 border border-gray-700"></div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10">
        <canvas
          ref={canvasRef}
          width={1000}
          height={550}
          className="border-4 border-gray-800 bg-green-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-lg cursor-pointer"
          onClick={handleCanvasInteraction}
          onTouchStart={(e) => {
            e.preventDefault()
            handleCanvasInteraction()
          }}
        />

        {message && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-90 text-white text-4xl font-bold px-8 py-4 rounded-lg border-2 border-gray-700">
            {message}
          </div>
        )}

        {showInstructions && !gameState.isGameOver && (
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-90 p-4 rounded-lg text-sm border border-gray-700">
            <h3 className="font-bold mb-2 text-gray-200">操作方法</h3>
            <p className="text-gray-300">スペースキー or 画面タップ: スイング</p>
            <p className="mt-2 text-xs text-gray-400">9回裏から開始。サヨナラ勝ちで次の試合へ。</p>
            <p className="text-xs text-gray-400">同点または負けるとゲームオーバー。</p>
            <p className="mt-2 text-xs text-gray-400">ゲームオーバー時: スペース or タップで再開</p>
            <button
              onClick={() => setShowInstructions(false)}
              className="mt-2 bg-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-600 text-gray-200"
            >
              閉じる
            </button>
          </div>
        )}

        {!gameState.isGameOver && (
          <div className="absolute bottom-4 right-4 bg-black bg-opacity-90 p-4 rounded-lg text-sm border border-gray-700">
            <h3 className="font-bold mb-2 text-gray-200">音量設定</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">🔇</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume * 100}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
                }}
              />
              <span className="text-xs text-gray-400">🔊</span>
            </div>
          </div>
        )}

        {gameState.showVictory && !gameState.isGameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-95">
            <div className="text-center">
              <h2 className="text-5xl font-bold mb-4 text-yellow-400 animate-pulse">
                🎉 勝利！ 🎉
              </h2>
              <p className="text-2xl mb-6 text-gray-300">
                {getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).roundName}突破！
              </p>
              <p className="text-lg text-gray-400">
                次の試合に進みます...
              </p>
            </div>
          </div>
        )}

        {gameState.isGameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-95">
            <div className="text-center">
              <h2 className="text-5xl font-bold mb-4 text-gray-200">
                {gameState.isWinner ? '🏆 優勝おめでとう! 🏆' : 'GAME OVER'}
              </h2>
              <p className="text-2xl mb-6 text-gray-400">
                {gameState.isWinner
                  ? '全トーナメントを制覇しました！世界一です！'
                  : `${getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).roundName}敗退`}
              </p>
              <button
                onClick={restartGame}
                className="bg-gray-800 text-white px-8 py-3 rounded-lg text-xl font-bold hover:bg-gray-700 border border-gray-600"
              >
                もう一度プレイ
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-500 relative z-10">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="hover:text-gray-300 transition-colors"
        >
          {showInstructions ? '操作方法を隠す' : '操作方法を表示'}
        </button>
      </div>
    </div>
  )
}

export default App
