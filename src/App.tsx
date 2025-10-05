import { useState, useEffect, useRef, useCallback } from 'react'
import * as Tone from 'tone'

type PitchType = 'straight' | 'curve-left' | 'curve-right' | 'fast' | 'slider' | 'sinker' | 'changeup' | 'fastball' | 'gyroball' | 'knuckleball' | 'cutter' | 'vanishing' | 'stopping'
type HitResult = 'H' | '2B' | '3B' | 'HR' | 'OUT' | null
type Base = boolean[]

type TournamentType = 'koshien' | 'npb' | 'mlb'

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
  isVisible?: boolean  // 消える魔球用
  isStopped?: boolean  // 止まる魔球用
  stopTimer?: number   // 止まる魔球のタイマー
  initialVy: number
  hasBeenJudged: boolean
  id: number
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 550 })
  const [isMobile, setIsMobile] = useState(false)

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
  const [bgmVolume, setBgmVolume] = useState(() => {
    const saved = localStorage.getItem('bgmVolume')
    return saved !== null ? parseFloat(saved) : 0.5
  }) // BGM音量 0.0 to 1.0
  const [seVolume, setSeVolume] = useState(() => {
    const saved = localStorage.getItem('seVolume')
    return saved !== null ? parseFloat(saved) : 0.5
  }) // SE音量 0.0 to 1.0
  const [debugMode, setDebugMode] = useState(false)
  const [debugPressStartTime, setDebugPressStartTime] = useState<number | null>(null)
  const maxBalls = 4
  const maxStrikes = 3

  const pitchIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastJudgedPitchRef = useRef<number>(0)
  const lastProcessedBallRef = useRef<number>(0)
  const gameLoopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toneSynthRef = useRef<Tone.PolySynth | null>(null)
  const bassSynthRef = useRef<Tone.Synth | null>(null)
  const guitarRef = useRef<Tone.PolySynth | null>(null)
  const kickRef = useRef<Tone.MembraneSynth | null>(null)
  const snareRef = useRef<Tone.NoiseSynth | null>(null)
  const hihatRef = useRef<Tone.MetalSynth | null>(null)
  const tonePartRef = useRef<Tone.Part | null>(null)
  const drumPartRef = useRef<Tone.Part | null>(null)

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
      'gyroball': 'ジャイロボール',
      'knuckleball': 'ナックルボール',
      'cutter': 'カットボール',
      'vanishing': '消える魔球',
      'stopping': '止まる魔球'
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

  // Save volume settings to localStorage
  useEffect(() => {
    localStorage.setItem('bgmVolume', bgmVolume.toString())
  }, [bgmVolume])

  useEffect(() => {
    localStorage.setItem('seVolume', seVolume.toString())
  }, [seVolume])

  // Handle canvas resize for mobile
  useEffect(() => {
    const updateCanvasSize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)

      if (mobile) {
        // Mobile: Vertical canvas - 550×880 (cropped from 1000×550 field)
        const maxWidth = window.innerWidth - 32
        const displayWidth = Math.min(maxWidth, 400)  // Max 400px wide
        const displayHeight = displayWidth * 1.6  // 1.6:1 aspect ratio (taller)
        setCanvasSize({ width: displayWidth, height: displayHeight })
      } else {
        // PC: use full size
        setCanvasSize({ width: 1000, height: 550 })
      }
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)

    return () => window.removeEventListener('resize', updateCanvasSize)
  }, [])

  // Volume refs to avoid recreating callbacks
  const bgmVolumeRef = useRef(bgmVolume)
  const seVolumeRef = useRef(seVolume)
  useEffect(() => {
    bgmVolumeRef.current = bgmVolume
  }, [bgmVolume])
  useEffect(() => {
    seVolumeRef.current = seVolume
  }, [seVolume])

  // Play sound effect
  const playSound = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (!audioContextRef.current || seVolumeRef.current === 0) return

    const oscillator = audioContextRef.current.createOscillator()
    const gainNode = audioContextRef.current.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContextRef.current.destination)

    oscillator.type = type
    oscillator.frequency.value = frequency

    // ラッパ風の音色の場合は、立ち上がりが速く減衰が緩やかなエンベロープを使用
    if (type === 'sawtooth') {
      const attackTime = 0.02 // 速いアタック
      gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.25 * seVolumeRef.current, audioContextRef.current.currentTime + attackTime)
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.15 * seVolumeRef.current, 0.0001), audioContextRef.current.currentTime + duration)
    } else {
      gainNode.gain.setValueAtTime(0.3 * seVolumeRef.current, audioContextRef.current.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01 * seVolumeRef.current, 0.0001), audioContextRef.current.currentTime + duration)
    }

    oscillator.start()
    oscillator.stop(audioContextRef.current.currentTime + duration)
  }, [])

  // 投球音: ボールが空気を切る「シュッ」という音（短く一気に大きくなる風切り音）
  const playPitchSound = useCallback(() => {
    if (!audioContextRef.current || seVolumeRef.current === 0) return

    const context = audioContextRef.current
    const now = context.currentTime

    // ホワイトノイズを作成
    const bufferSize = context.sampleRate * 0.04
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const noise = context.createBufferSource()
    noise.buffer = buffer

    // ハイパスフィルターで高周波のみ（風切り音）
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 4500

    const gain = context.createGain()
    // 一気に大きくなって、ピークから少し下げてから終わる（自然に）
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.3 * seVolumeRef.current, now + 0.03) // ピークに到達
    gain.gain.exponentialRampToValueAtTime(0.1 * seVolumeRef.current, now + 0.038) // 少し下げる
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04) // 自然に終わる

    noise.connect(highpass)
    highpass.connect(gain)
    gain.connect(context.destination)

    noise.start(now)
    noise.stop(now + 0.04)
  }, [])

  // 打球音: 木製バットに当たる乾いた「カッ」という音（スネアドラム風）
  const playBatSound = useCallback(() => {
    if (!audioContextRef.current || seVolumeRef.current === 0) return

    const context = audioContextRef.current
    const now = context.currentTime

    // スネアドラムのような乾いた音を作る
    // 1. ホワイトノイズ（スナッピー感）- より短く
    const bufferSize = context.sampleRate * 0.04
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1))
    }

    const noise = context.createBufferSource()
    noise.buffer = buffer

    // ハイパスフィルターでさらに高域のみ
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 7000 // 5000 → 7000（さらに高く）
    highpass.Q.value = 1.5

    const noiseGain = context.createGain()
    noiseGain.gain.setValueAtTime(0.8 * seVolumeRef.current, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

    noise.connect(highpass)
    highpass.connect(noiseGain)
    noiseGain.connect(context.destination)

    noise.start(now)

    // 2. 高周波トーン（金属的な響き）- さらに高く
    const osc = context.createOscillator()
    const oscGain = context.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(2000, now) // 800 → 2000（高く）
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.03) // 300 → 800

    oscGain.gain.setValueAtTime(0.4 * seVolumeRef.current, now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)

    osc.connect(oscGain)
    oscGain.connect(context.destination)

    osc.start(now)
    osc.stop(now + 0.04)
  }, [])

  // Start game with specific tournament type (debug mode)
  const startGameWithTournament = (tournamentType: TournamentType) => {
    const baseScore = tournamentType === 'koshien' ? 3 : tournamentType === 'npb' ? 4 : 5
    const cpuScore = baseScore

    setGameState({
      round: 1,
      inning: 9,
      outs: 0,
      playerScore: 0,
      cpuScore: cpuScore,
      bases: [false, false, false],
      tournamentRound: 1,
      tournamentType: tournamentType,
      isGameOver: false,
      isWinner: false,
      cpuInningScores: generateInningScores(cpuScore),
      playerInningScores: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      showVictory: false,
      cpuHits: Math.floor(Math.random() * 5) + (tournamentType === 'mlb' ? 8 : tournamentType === 'npb' ? 7 : 5),
      cpuErrors: Math.floor(Math.random() * 2),
      playerHits: Math.floor(Math.random() * 4) + 3,
      playerErrors: Math.floor(Math.random() * 2)
    })

    setGameStarted(true)
  }

  // Play drum beat (using noise) - 現在Tone.jsに移行したためコメントアウト
  /* const playDrum = useCallback((type: 'kick' | 'snare' | 'hihat', duration: number) => {
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
  }, []) */

  // Background music loop with Tone.js + MIDI
  useEffect(() => {
    if (!gameStarted || gameState.isGameOver || gameState.showVictory) {
      // Stop BGM
      if (tonePartRef.current) {
        tonePartRef.current.stop()
        tonePartRef.current.dispose()
        tonePartRef.current = null
      }
      if (drumPartRef.current) {
        drumPartRef.current.stop()
        drumPartRef.current.dispose()
        drumPartRef.current = null
      }
      Tone.getTransport().stop()
      return
    }

    const playBGM = async () => {
      // Tone.jsの初期化（ユーザーインタラクション後）
      await Tone.start()
      console.log('Tone.js started')

      // メロディ用 - モダンなFMシンセ（YOASOBIやヨルシカ風）
      if (!toneSynthRef.current) {
        toneSynthRef.current = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3,      // 倍音の美しさ
          modulationIndex: 10, // モジュレーションの深さ
          oscillator: {
            type: 'sine'
          },
          envelope: {
            attack: 0.01,
            decay: 0.1,
            sustain: 0.1,    // 短めの持続音
            release: 0.05    // 短いリリース（音の重なりを防ぐ）
          },
          modulation: {
            type: 'square'  // モダンなエッジ
          },
          modulationEnvelope: {
            attack: 0.01,
            decay: 0.1,
            sustain: 0.1,
            release: 0.05
          }
        }).toDestination()
        console.log('FM Synth created')
      }

      // Bass専用シンセサイザー - クリーンな正弦波
      if (!bassSynthRef.current) {
        bassSynthRef.current = new Tone.Synth({
          oscillator: {
            type: 'sine' // 正弦波（最もクリーンな音）
          },
          envelope: {
            attack: 0.1,
            decay: 0.3,
            sustain: 0.5,
            release: 1
          }
        }).toDestination()
        console.log('Bass synth created')
      }

      // キックドラム
      if (!kickRef.current) {
        kickRef.current = new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 10,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: 0.4,
            sustain: 0.01,
            release: 1.4,
            attackCurve: 'exponential'
          }
        }).toDestination()
      }

      // スネアドラム
      if (!snareRef.current) {
        snareRef.current = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: {
            attack: 0.001,
            decay: 0.2,
            sustain: 0
          }
        }).toDestination()
      }

      // ハイハット
      if (!hihatRef.current) {
        hihatRef.current = new Tone.MetalSynth({
          envelope: {
            attack: 0.001,
            decay: 0.1,
            release: 0.01
          },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5
        }).toDestination()
      }

      // エレキギター（コード用）
      if (!guitarRef.current) {
        guitarRef.current = new Tone.PolySynth(Tone.Synth, {
          oscillator: {
            type: 'square' // 矩形波（エレキギター風）
          },
          envelope: {
            attack: 0.01,
            decay: 0.2,
            sustain: 0.3,
            release: 0.4
          }
        }).toDestination()
      }

      // 音量調整（BGMは控えめに）
      toneSynthRef.current.volume.value = bgmVolume * 20 - 40 // -40dB to -20dB
      bassSynthRef.current.volume.value = bgmVolume * 20 - 40 // -40dB to -20dB
      guitarRef.current.volume.value = bgmVolume * 20 - 38 // -38dB to -18dB
      kickRef.current.volume.value = bgmVolume * 20 - 35 // -35dB to -15dB
      snareRef.current.volume.value = bgmVolume * 20 - 38 // -38dB to -18dB
      hihatRef.current.volume.value = bgmVolume * 20 - 42 // -42dB to -22dB（控えめ）

      // 既存のPartを停止
      if (tonePartRef.current) {
        tonePartRef.current.stop()
        tonePartRef.current.dispose()
      }

      Tone.getTransport().stop()
      Tone.getTransport().cancel() // すべてのスケジュールをクリア

      // JSONファイルをロード
      const round = gameState.tournamentRound
      const jsonFile = `/baseball/midi/round${round}.json`

      try {
        const response = await fetch(jsonFile)
        const data = await response.json()
        console.log('Music data loaded:', jsonFile)

        // Scribbletune clipデータからTone.js用のノート配列を作成
        const notes: { time: string; note: string; duration: string; isBass?: boolean; isGuitar?: boolean }[] = []

        data.tracks.forEach((track: any) => {
          // chordsトラックをスキップ
          if (track.name === 'chords') return

          const clip = track.clip
          let position = 0 // ステップ位置

          clip.forEach((step: any) => {
            // 各トラックの再生間隔を設定
            let interval = 2
            if (track.name === 'bass') {
              interval = 16
            } else if (track.name === 'melody') {
              // メロディは1つおきや3つおきなど変化をつける
              interval = position % 8 === 0 ? 1 : (position % 5 === 0 ? 3 : 2)
            } else if (track.name === 'chords') {
              interval = 4 // コードは4つおき
            }

            if (step.note && step.note !== null && position % interval === 0) {
              const noteArray = Array.isArray(step.note) ? step.note : [step.note]
              const length = step.length || 64 // デフォルト長さ

              // メロディは様々な音価を使用
              let duration = '4n'
              if (track.name === 'bass') {
                duration = '4n'
              } else if (track.name === 'melody') {
                // 位置によって音価を変える
                if (position % 8 === 0) {
                  duration = '4n.'  // 付点4分音符
                } else if (position % 6 === 0) {
                  duration = '2n'   // 2分音符
                } else if (position % 3 === 0) {
                  duration = '8n'   // 8分音符
                } else {
                  duration = '4n'   // 4分音符
                }
              } else {
                duration = length >= 64 ? '4n' : '8n'
              }

              noteArray.forEach((note: string) => {
                // 位置を小節:拍:16分音符の形式に変換
                const sixteenths = Math.floor(position / 2) // 2ステップ = 1/16分音符
                const measure = Math.floor(sixteenths / 16)
                const beat = Math.floor((sixteenths % 16) / 4)
                const subdivision = (sixteenths % 16) % 4
                const time = `${measure}:${beat}:${subdivision}`

                notes.push({
                  time: time,
                  note: note,
                  duration: duration,
                  isBass: track.name === 'bass',
                  isGuitar: track.name === 'chords'
                })
              })
            }
            position++
          })
        })

        console.log('Total notes:', notes.length)
        console.log('First 5 notes:', notes.slice(0, 5))

        // Tone.js Partを作成
        if (toneSynthRef.current && notes.length > 0) {
          console.log('Creating Part with', notes.length, 'notes from JSON')

          tonePartRef.current = new Tone.Part((time, value) => {
            // 各トラック専用のシンセで再生（bassは無効化）
            if (value.isBass) {
              // bassを消す
            } else if (value.isGuitar) {
              guitarRef.current?.triggerAttackRelease(value.note, value.duration, time)
            } else {
              // メロディ: 前の音を完全に停止してから新しい音を鳴らす
              if (toneSynthRef.current) {
                // 前の音を停止
                toneSynthRef.current.releaseAll(time)

                // 音符の長さを90%に短縮（音が重ならないように）
                const durationMap: {[key: string]: number} = {
                  '8n': 0.15,   // 8分音符 = 0.15秒 @ 80BPM
                  '4n': 0.3,    // 4分音符 = 0.3秒
                  '4n.': 0.45,  // 付点4分音符 = 0.45秒
                  '2n': 0.6     // 2分音符 = 0.6秒
                }
                const actualDuration = (durationMap[value.duration] || 0.3) * 0.85 // 85%に短縮

                toneSynthRef.current.triggerAttackRelease(value.note, actualDuration, time)
              }
            }
          }, notes).start(0)

          tonePartRef.current.loop = true
          tonePartRef.current.loopEnd = '4m' // 4小節でループ（短くして無音を減らす）

          Tone.getTransport().bpm.value = 80 // 120から80に変更（ゆっくりしたテンポ）

          // ドラムパターンを作成（キック、スネア、ハイハット）
          const drumNotes = [
            // キック
            { time: '0:0', type: 'kick' },
            { time: '0:2', type: 'kick' },
            { time: '1:0', type: 'kick' },
            { time: '1:2', type: 'kick' },
            { time: '2:0', type: 'kick' },
            { time: '2:2', type: 'kick' },
            { time: '3:0', type: 'kick' },
            { time: '3:2', type: 'kick' },
            // スネア（2拍目、4拍目）
            { time: '0:1', type: 'snare' },
            { time: '0:3', type: 'snare' },
            { time: '1:1', type: 'snare' },
            { time: '1:3', type: 'snare' },
            { time: '2:1', type: 'snare' },
            { time: '2:3', type: 'snare' },
            { time: '3:1', type: 'snare' },
            { time: '3:3', type: 'snare' },
            // ハイハット（8分音符）
            { time: '0:0:0', type: 'hihat' },
            { time: '0:0:2', type: 'hihat' },
            { time: '0:1:0', type: 'hihat' },
            { time: '0:1:2', type: 'hihat' },
            { time: '0:2:0', type: 'hihat' },
            { time: '0:2:2', type: 'hihat' },
            { time: '0:3:0', type: 'hihat' },
            { time: '0:3:2', type: 'hihat' },
            { time: '1:0:0', type: 'hihat' },
            { time: '1:0:2', type: 'hihat' },
            { time: '1:1:0', type: 'hihat' },
            { time: '1:1:2', type: 'hihat' },
            { time: '1:2:0', type: 'hihat' },
            { time: '1:2:2', type: 'hihat' },
            { time: '1:3:0', type: 'hihat' },
            { time: '1:3:2', type: 'hihat' }
          ]

          if (drumPartRef.current) {
            drumPartRef.current.stop()
            drumPartRef.current.dispose()
          }

          drumPartRef.current = new Tone.Part((time, value) => {
            if (value.type === 'kick') {
              kickRef.current?.triggerAttackRelease('C1', '8n', time)
            } else if (value.type === 'snare') {
              snareRef.current?.triggerAttackRelease('4n', time)
            } else if (value.type === 'hihat') {
              hihatRef.current?.triggerAttackRelease('32n', time)
            }
          }, drumNotes).start(0)

          drumPartRef.current.loop = true
          drumPartRef.current.loopEnd = '2m'

          Tone.getTransport().start()
          console.log('Transport started with JSON data and drums, BPM: 80')
        } else {
          console.error('No synth or no notes!', 'synth:', !!toneSynthRef.current, 'notes:', notes.length)
        }
      } catch (error) {
        console.error('Failed to load music:', error)
      }
    }

    playBGM()

    return () => {
      if (tonePartRef.current) {
        tonePartRef.current.stop()
        tonePartRef.current.dispose()
        tonePartRef.current = null
      }
      if (drumPartRef.current) {
        drumPartRef.current.stop()
        drumPartRef.current.dispose()
        drumPartRef.current = null
      }
      Tone.getTransport().stop()
    }
  }, [gameState.tournamentRound, gameStarted, gameState.isGameOver, gameState.showVictory, bgmVolume])

  // Auto pitch
  useEffect(() => {
    if (!gameStarted || gameState.isGameOver || gameState.showVictory || pitch) return

    pitchIntervalRef.current = setTimeout(() => {
      // Difficulty increases with tournament round and type
      const tournamentType = gameState.tournamentType
      const difficulty = gameState.tournamentRound

      // Available pitch types expand with difficulty
      let pitchTypes: PitchType[] = ['straight', 'fast']

      // Koshien tournament - no pitches over 200km (no fast, no fastball)
      if (tournamentType === 'koshien') {
        // Round 1: 160km straight only
        if (difficulty === 1) {
          pitchTypes = ['straight']
        } else if (difficulty >= 2) {
          pitchTypes = ['straight']  // 速球(220km)を除外
          pitchTypes.push('curve-left', 'curve-right', 'changeup')
        }
        if (difficulty >= 3) {
          pitchTypes.push('slider', 'sinker', 'gyroball')
        }
        // 甲子園では200km以上(fast, fastball)は投げない
      }
      // NPB tournament - no pitches over 300km (no fastball with high difficulty)
      else if (tournamentType === 'npb') {
        pitchTypes = ['straight', 'fast', 'curve-left', 'curve-right', 'changeup', 'slider', 'sinker', 'gyroball', 'knuckleball', 'cutter']
        // NPBでは300km以上は投げない（fastballは除外）
      }
      // MLB tournament - adds magical pitches, allows all speeds
      else if (tournamentType === 'mlb') {
        pitchTypes = ['fast', 'curve-left', 'curve-right', 'changeup', 'slider', 'sinker', 'gyroball', 'fastball', 'knuckleball', 'cutter', 'vanishing', 'stopping']
      }

      const selectedType = pitchTypes[Math.floor(Math.random() * pitchTypes.length)]

      let vx = 0
      let vy = 4

      // Speed multiplier based on tournament type
      const speedMultiplier = tournamentType === 'koshien' ? 1.0 : tournamentType === 'npb' ? 1.2 : 1.4

      // Random control (targeting variation)
      // 85% chance of strike zone, 15% chance of ball (outside strike zone)
      const isIntentionalBall = Math.random() < 0.15
      const targetXOffset = isIntentionalBall
        ? (Math.random() < 0.5 ? 1 : -1) * (30 + Math.random() * 15)  // Ball: ±30-45px from center at home plate
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
          vy = 5 * speedMultiplier  // 初速を遅く（180km → 140km）
          vx = (targetXOffset / distanceY) * vy
          break
        case 'gyroball':
          vy = 2 * speedMultiplier
          vx = (targetXOffset / distanceY) * vy
          break
        case 'knuckleball':
          // Wobbling ball with left-right oscillation
          vy = 3.5 * speedMultiplier
          vx = (targetXOffset / distanceY) * vy
          break
        case 'cutter':
          // Fast pitch with late sharp break
          vy = 7.5 * speedMultiplier
          vx = ((1.2 + (Math.random() - 0.5) * 0.3) + (targetXOffset / distanceY) * 6) * speedMultiplier
          break
        case 'vanishing':
          // Disappearing ball
          vy = 5 * speedMultiplier
          vx = (targetXOffset / distanceY) * vy
          break
        case 'stopping':
          // Ball that stops
          vy = 5 * speedMultiplier
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
        id: pitchId,
        isVisible: selectedType === 'vanishing' ? true : undefined,
        isStopped: selectedType === 'stopping' ? false : undefined,
        stopTimer: selectedType === 'stopping' ? 0 : undefined
      })

      // Set pitch info for display
      setCurrentPitchInfo({
        type: displayType,
        speed: displaySpeed
      })

      console.log('✅ Display info set:', displayType, displaySpeed, 'km/h')

      playPitchSound()
    }, 2000 + Math.random() * 2000)

    return () => {
      if (pitchIntervalRef.current) clearTimeout(pitchIntervalRef.current)
    }
  }, [pitch, gameState.isGameOver, gameState.showVictory, gameState.tournamentRound, playPitchSound, gameStarted])

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

      // Calculate timing-based angle (左打者)
      // pitch.y: homeY-100 (early/引張) to homeY+20 (late/流し打ち)
      const timing = (pitch.y - (homeY - 100)) / 120  // 0 (early) to 1 (late)

      // Angle mapping (左打者):
      // timing 0.0 (very early) -> +75° (right foul/引張ファウル)
      // timing 0.2 (early)      -> +45° (right pull/引張)
      // timing 0.5 (perfect)    -> 0° (center)
      // timing 0.8 (late)       -> -45° (left opposite field/流し打ち)
      // timing 1.0 (very late)  -> -75° (left foul/流し打ちファウル)

      // Convert to angle: +75° to -75° (wider range including foul territory)
      const baseAngle = (0.5 - timing) * Math.PI * 0.833  // 0.833 = 150°/180°

      // Add small random variation
      const randomVariation = (Math.random() - 0.5) * Math.PI * 0.1
      const angle = baseAngle + randomVariation

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
      playBatSound()
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
  }, [pitch, ball, playSound, playBatSound])

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
        outs: newOuts
        // ランナーはそのまま維持
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
      // Move to MLB tournament
      setTimeout(() => {
        setPitch(null)
        setBall(null)
        setBalls(0)
        setStrikes(0)
        setGameState(prev => {
          const newCpuScore = 5
          return {
            ...prev,
            tournamentType: 'mlb',
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
    } else if (state.tournamentType === 'mlb' && state.tournamentRound >= 5) {
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
          cpuHits: Math.floor(Math.random() * 5) + (prev.tournamentType === 'mlb' ? 8 : prev.tournamentType === 'npb' ? 7 : 5),
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
      { minAngle: Math.PI * 0.25, maxAngle: Math.PI * 0.34, result: 'OUT' as HitResult },
      { minAngle: Math.PI * 0.34, maxAngle: Math.PI * 0.40, result: 'H' as HitResult },
      { minAngle: Math.PI * 0.40, maxAngle: Math.PI * 0.45, result: '2B' as HitResult },
      { minAngle: Math.PI * 0.45, maxAngle: Math.PI * 0.48, result: '3B' as HitResult },
      { minAngle: Math.PI * 0.48, maxAngle: Math.PI * 0.52, result: 'HR' as HitResult },
      { minAngle: Math.PI * 0.52, maxAngle: Math.PI * 0.55, result: '3B' as HitResult },
      { minAngle: Math.PI * 0.55, maxAngle: Math.PI * 0.60, result: '2B' as HitResult },
      { minAngle: Math.PI * 0.60, maxAngle: Math.PI * 0.66, result: 'H' as HitResult },
      { minAngle: Math.PI * 0.66, maxAngle: Math.PI * 0.75, result: 'OUT' as HitResult },
    ]

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
          // ランナーはそのまま維持
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
      const canvasWidth = canvas.width
      const canvasHeight = canvas.height

      ctx.clearRect(0, 0, canvasWidth, canvasHeight)

      // Mobile: Crop-only viewport (no scaling, just translate)
      if (isMobile) {
        ctx.save()
        // Center horizontally: shift to show middle 550px of the 1000px field
        ctx.translate(-225, 0)
      }

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
        { startAngle: Math.PI * 0.25, endAngle: Math.PI * 0.34, label: 'OUT', color: '#ef4444' },
        { startAngle: Math.PI * 0.34, endAngle: Math.PI * 0.40, label: 'H', color: '#a78bfa' },
        { startAngle: Math.PI * 0.40, endAngle: Math.PI * 0.45, label: '2B', color: '#34d399' },
        { startAngle: Math.PI * 0.45, endAngle: Math.PI * 0.48, label: '3B', color: '#60a5fa' },
        { startAngle: Math.PI * 0.48, endAngle: Math.PI * 0.52, label: 'HR', color: '#fbbf24' },
        { startAngle: Math.PI * 0.52, endAngle: Math.PI * 0.55, label: '3B', color: '#60a5fa' },
        { startAngle: Math.PI * 0.55, endAngle: Math.PI * 0.60, label: '2B', color: '#34d399' },
        { startAngle: Math.PI * 0.60, endAngle: Math.PI * 0.66, label: 'H', color: '#a78bfa' },
        { startAngle: Math.PI * 0.66, endAngle: Math.PI * 0.75, label: 'OUT', color: '#ef4444' },
      ]

      zones.forEach((zone) => {

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
      if (pitch && pitch.active && (pitch.isVisible === undefined || pitch.isVisible === true)) {
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

      // Restore canvas state for mobile
      if (isMobile) {
        ctx.restore()
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [pitch, ball, gameState.bases, swingAngle, gameStarted, isMobile])

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
        let newVx = prev.vx
        let newVy = prev.vy
        let newIsVisible = prev.isVisible
        let newIsStopped = prev.isStopped
        let newStopTimer = prev.stopTimer

        // Straight balls (straight, fast, fastball) - linear motion with angle
        const isStraightType = prev.type === 'straight' || prev.type === 'fast' || prev.type === 'fastball'

        if (isStraightType) {
          // Straight pitch - no curve, just linear motion
          newY = prev.y + prev.vy
          newX = prev.x + prev.vx
        } else if (prev.type === 'changeup') {
          // チェンジアップ: progress 0.25を超えたら一気に半分の速度に（止まる魔球と同じ位置）
          const decelerationPoint = 0.25
          let currentVy = prev.initialVy

          if (newProgress >= decelerationPoint) {
            currentVy = prev.initialVy * 0.5  // 一気に半分の速度
          }

          newY = prev.y + currentVy
          newX = prev.x + prev.vx  // Changeup also travels in straight line
        } else if (prev.type === 'gyroball') {
          const accelerationFactor = Math.pow(newProgress, 2)
          const maxSpeed = prev.initialVy * 5
          const currentVy = prev.initialVy + (maxSpeed - prev.initialVy) * accelerationFactor

          newY = prev.y + currentVy
          newX = prev.x + prev.vx  // Gyroball also travels in straight line
        } else if (prev.type === 'knuckleball') {
          // Knuckleball - wobbles left and right
          const wobbleFrequency = 8
          const wobbleAmplitude = 2.5
          const wobbleOffset = Math.sin(newProgress * Math.PI * wobbleFrequency) * wobbleAmplitude

          newY = prev.y + prev.vy
          newX = prev.x + prev.vx + wobbleOffset
        } else if (prev.type === 'cutter') {
          // Cutter - fast pitch with late sharp break (like slider but faster)
          const breakProgress = Math.pow(newProgress, 3)  // Late break
          const finalBreakDistance = 60
          const parabolaX = breakProgress * finalBreakDistance * Math.sign(prev.vx)

          newY = prev.startY + (targetY - prev.startY) * newProgress
          newX = targetX + parabolaX
        } else if (prev.type === 'vanishing') {
          // Vanishing ball - disappears before hitting zone, reappears after
          const hittingZoneStart = 0.4
          const hittingZoneEnd = 0.7

          if (newProgress >= hittingZoneStart && newProgress <= hittingZoneEnd) {
            newIsVisible = false
          } else {
            newIsVisible = true
          }

          newY = prev.y + prev.vy
          newX = prev.x + prev.vx
        } else if (prev.type === 'stopping') {
          // Stopping ball - stops before hitting zone, then continues
          const stopZoneStart = 0.25  // Much earlier - before hitting zone
          const stopZoneEnd = 0.35
          const stopDuration = 20  // frames

          if (newProgress >= stopZoneStart && newProgress <= stopZoneEnd && !newIsStopped) {
            // Start stopping
            newIsStopped = true
            newStopTimer = 0
            newY = prev.y  // Stay at current position
            newX = prev.x
          } else if (newIsStopped && newStopTimer !== undefined && newStopTimer < stopDuration) {
            // Continue stopping
            newStopTimer = newStopTimer + 1
            newY = prev.y  // Stay at current position
            newX = prev.x
          } else if (newIsStopped && newStopTimer !== undefined && newStopTimer >= stopDuration) {
            // Resume motion
            newIsStopped = false
            newY = prev.y + prev.vy
            newX = prev.x + prev.vx
          } else {
            // Normal motion
            newY = prev.y + prev.vy
            newX = prev.x + prev.vx
          }
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
                setStrikes(0)  // ストライクもリセット
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
          progress: newProgress,
          vx: newVx,
          vy: newVy,
          isVisible: newIsVisible,
          isStopped: newIsStopped,
          stopTimer: newStopTimer
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

        // Foul ball detection (outside fair territory)
        if (angle < Math.PI * 0.25 || angle > Math.PI * 0.75) {
          if (distance > 300) {
            if (!prev.hasScored && lastProcessedBallRef.current !== prev.id) {
              lastProcessedBallRef.current = prev.id
              // Foul ball: add strike unless already at 2 strikes
              setMessage('ファウル!')
              setTimeout(() => setMessage(''), 1500)
              playSound(300, 0.3)

              setStrikes(s => {
                if (s < 2) {
                  return s + 1
                }
                return s // 2 strikes: no change
              })
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
    setBalls(0)
    setStrikes(0)
    setGameStarted(false)
  }, [])

  const continueGame = useCallback(() => {
    // 現在のトーナメントと回戦をそのままに、スコアとイニングをリセット
    setGameState(prev => {
      const newCpuScore = Math.floor(Math.random() * 3) + 3
      return {
        ...prev,
        inning: 9,
        outs: 0,
        playerScore: 0,
        cpuScore: newCpuScore,
        bases: [false, false, false],
        isGameOver: false,
        cpuInningScores: generateInningScores(newCpuScore),
        playerInningScores: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        cpuHits: Math.floor(Math.random() * 5) + 5,
        cpuErrors: Math.floor(Math.random() * 3),
        playerHits: Math.floor(Math.random() * 4) + 3,
        playerErrors: Math.floor(Math.random() * 2)
      }
    })
    setPitch(null)
    setBall(null)
    setMessage('')
    setBalls(0)
    setStrikes(0)
    setCurrentPitchInfo(null)
  }, [])

  const backToTop = useCallback(() => {
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
    setBalls(0)
    setStrikes(0)
    setGameStarted(false)
    setMessage('')
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
    const roundNamesShort = ['1回', '2回', '準々', '準決', '決勝']

    if (type === 'koshien') {
      const opponents = ['桜丘高校', '北陵高校', '緑ヶ丘高校', '星陵高校', '王者高校']
      return {
        title: '甲子園トーナメント',
        titleShort: '甲',
        roundName: roundNames[round - 1],
        roundNameShort: roundNamesShort[round - 1],
        opponent: opponents[round - 1]
      }
    } else if (type === 'npb') {
      const opponents = ['読売ジャイアンツ', '阪神タイガース', '広島カープ', '中日ドラゴンズ', '横浜ベイスターズ']
      return {
        title: 'NPBトーナメント',
        titleShort: 'NPB',
        roundName: roundNames[round - 1],
        roundNameShort: roundNamesShort[round - 1],
        opponent: opponents[round - 1]
      }
    } else {
      const opponents = ['Yankees', 'Red Sox', 'Dodgers', 'Cubs', 'Astros']
      return {
        title: 'MLB Tournament',
        titleShort: 'MLB',
        roundName: roundNames[round - 1],
        roundNameShort: roundNamesShort[round - 1],
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
        <div className="relative z-10 w-full max-w-2xl mx-auto text-center px-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4 text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">
            【9回裏】0点からの逆転劇が奇跡すぎたwww
          </h1>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-6 md:mb-8 text-gray-300">野球盤ゲーム</h2>

          <div className="bg-gray-900 bg-opacity-90 border-2 sm:border-4 border-gray-700 rounded-lg p-4 sm:p-6 md:p-8 mb-6 md:mb-8">
            <h3 className="text-lg sm:text-xl font-bold mb-3 md:mb-4 text-yellow-400">ゲームルール</h3>
            <div className="text-left text-sm sm:text-base text-gray-300 space-y-1.5 sm:space-y-2 mb-4 sm:mb-6">
              <p>• 9回裏、3点差を追いかける逆転劇</p>
              <p>• サヨナラ勝ちで次の回戦へ進出</p>
              <p>• 5つの回戦を勝ち抜いて優勝を目指せ！</p>
              <p>• スペースキーまたは画面タップでスイング</p>
            </div>

            <h3 className="text-lg sm:text-xl font-bold mb-3 md:mb-4 text-yellow-400">音量設定</h3>
            <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6 md:mb-8">
              <span
                className="text-xs sm:text-sm text-gray-400 cursor-pointer select-none"
                onMouseDown={() => setDebugPressStartTime(Date.now())}
                onMouseUp={() => {
                  if (debugPressStartTime && Date.now() - debugPressStartTime >= 3000) {
                    setDebugMode(true)
                  }
                  setDebugPressStartTime(null)
                }}
                onMouseLeave={() => setDebugPressStartTime(null)}
                onTouchStart={() => setDebugPressStartTime(Date.now())}
                onTouchEnd={() => {
                  if (debugPressStartTime && Date.now() - debugPressStartTime >= 3000) {
                    setDebugMode(true)
                  }
                  setDebugPressStartTime(null)
                }}
                onTouchCancel={() => setDebugPressStartTime(null)}
              >
                🔇
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-400 w-10">BGM</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={bgmVolume * 100}
                    onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
                    className="w-24 sm:w-40 md:w-56 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${bgmVolume * 100}%, #374151 ${bgmVolume * 100}%, #374151 100%)`
                    }}
                  />
                  <span className="text-xs sm:text-sm text-gray-300 w-8">{Math.round(bgmVolume * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-400 w-10">SE</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={seVolume * 100}
                    onChange={(e) => setSeVolume(Number(e.target.value) / 100)}
                    className="w-24 sm:w-40 md:w-56 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${seVolume * 100}%, #374151 ${seVolume * 100}%, #374151 100%)`
                    }}
                  />
                  <span className="text-xs sm:text-sm text-gray-300 w-8">{Math.round(seVolume * 100)}%</span>
                </div>
              </div>
              <span className="text-xs sm:text-sm text-gray-400">🔊</span>
            </div>

            <button
              onClick={() => setGameStarted(true)}
              className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white text-xl sm:text-2xl md:text-3xl font-bold py-4 sm:py-5 md:py-6 px-8 sm:px-12 md:px-16 rounded-lg shadow-[0_0_30px_rgba(34,197,94,0.5)] hover:shadow-[0_0_40px_rgba(34,197,94,0.7)] transition-all duration-300 transform hover:scale-105"
            >
              プレイボール！
            </button>

            {/* Period-limited tournament selection buttons (always visible) */}
            <div className="mt-6 space-y-3">
              <div className="text-sm text-yellow-400 font-bold mb-2">⚡ 期間限定！好きなトーナメントから開始</div>
              <button
                onClick={() => startGameWithTournament('npb')}
                className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-lg sm:text-xl font-bold py-3 px-6 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:shadow-[0_0_30px_rgba(59,130,246,0.7)] transition-all duration-300 transform hover:scale-105"
              >
                NPBトーナメントから開始
              </button>
              <button
                onClick={() => startGameWithTournament('mlb')}
                className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-lg sm:text-xl font-bold py-3 px-6 rounded-lg shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:shadow-[0_0_30px_rgba(168,85,247,0.7)] transition-all duration-300 transform hover:scale-105"
              >
                MLBトーナメントから開始
              </button>
            </div>

            {/* Debug mode indicator (hidden feature) */}
            {debugMode && (
              <div className="mt-4 text-xs text-red-400">
                🔧 デバッグモード有効
              </div>
            )}
          </div>

          <div className="text-xs sm:text-sm text-gray-500">
            <p>© 2025 【9回裏】0点からの逆転劇が奇跡すぎたwww</p>
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

      {/* Scoreboard */}
      {isMobile ? (
        /* Mobile Compact Scoreboard */
        <div className="w-full mx-2 mb-3 bg-gradient-to-b from-gray-800 to-gray-900 border-2 border-gray-600 rounded-lg shadow-2xl overflow-hidden relative z-10">
          <div className="p-2 space-y-2">
            {/* Title and Scores */}
            <div className="flex items-center justify-between text-sm">
              <div className="font-bold text-gray-300">{getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).title.replace('トーナメント', '')} - {getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).roundName}</div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400">{getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).opponent.charAt(0)}{gameState.cpuScore}</span>
                <span className="text-gray-500">-</span>
                <span className="text-yellow-400 font-bold">{gameState.playerScore}サ</span>
              </div>
            </div>

            {/* BSO and Pitch Info */}
            <div className="flex items-center justify-between bg-gray-950 rounded px-2 py-1.5 text-xs">
              {/* BSO in one line */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400">B</span>
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full ${i < balls ? 'bg-green-500' : 'bg-gray-700'}`} />
                ))}
                <span className="text-gray-400 ml-1">S</span>
                {[0, 1].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full ${i < strikes ? 'bg-yellow-500' : 'bg-gray-700'}`} />
                ))}
                <span className="text-gray-400 ml-1">O</span>
                {[0, 1].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full ${i < gameState.outs ? 'bg-red-500' : 'bg-gray-700'}`} />
                ))}
              </div>

              {/* Pitch Info */}
              {currentPitchInfo && (
                <div className="text-yellow-400 font-bold">
                  {currentPitchInfo.type}:{currentPitchInfo.speed}km/h
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* PC Rich Scoreboard */
        <div className="w-full max-w-5xl mb-6 mx-4 bg-gradient-to-b from-gray-800 to-gray-900 border-4 border-gray-600 rounded-lg shadow-2xl overflow-hidden relative z-10">
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 py-3 px-4 text-center border-b border-gray-600">
            <h1 className="text-2xl font-bold tracking-wide text-white drop-shadow-lg">{getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).title} - {getTournamentInfo(gameState.tournamentType, gameState.tournamentRound).roundName}</h1>
          </div>

          <div className="p-6">
          {/* Scoreboard Table */}
          <div className="bg-gray-950 rounded-lg p-2 md:p-4 border-2 border-gray-700 mb-4 md:mb-6 overflow-x-auto">
            <table className="w-full text-center text-xs md:text-sm">
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
                  <td className="py-2 px-2 text-green-400 font-bold">サヨナラ高校</td>
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
                    {[0, 1].map(i => (
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
      )}

      <div className="relative z-10 w-full flex justify-center">
        <canvas
          ref={canvasRef}
          width={isMobile ? 550 : 1000}
          height={isMobile ? 880 : 550}
          style={{
            width: `${canvasSize.width}px`,
            height: `${canvasSize.height}px`,
            maxWidth: '100%',
          }}
          className="border-4 border-gray-800 bg-green-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-lg cursor-pointer"
          onClick={handleCanvasInteraction}
          onTouchStart={handleCanvasInteraction}
        />

        {message && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-90 text-white text-2xl md:text-4xl font-bold px-4 md:px-8 py-2 md:py-4 rounded-lg border-2 border-gray-700">
            {message}
          </div>
        )}

        {!isMobile && showInstructions && !gameState.isGameOver && (
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-90 p-4 rounded-lg text-sm border border-gray-700 max-w-xs">
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

        {!isMobile && !gameState.isGameOver && (
          <div className="absolute bottom-4 right-4 bg-black bg-opacity-90 p-4 rounded-lg text-sm border border-gray-700">
            <h3 className="font-bold mb-2 text-gray-200">音量設定</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-10">BGM</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bgmVolume * 100}
                  onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
                  className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${bgmVolume * 100}%, #374151 ${bgmVolume * 100}%, #374151 100%)`
                  }}
                />
                <span className="text-xs text-gray-300 w-8">{Math.round(bgmVolume * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-10">SE</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={seVolume * 100}
                  onChange={(e) => setSeVolume(Number(e.target.value) / 100)}
                  className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${seVolume * 100}%, #374151 ${seVolume * 100}%, #374151 100%)`
                  }}
                />
                <span className="text-xs text-gray-300 w-8">{Math.round(seVolume * 100)}%</span>
              </div>
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
              <div className="flex flex-col gap-4">
                {!gameState.isWinner && (
                  <button
                    onClick={continueGame}
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg text-xl font-bold hover:bg-blue-500 border border-blue-500"
                  >
                    コンティニュー
                  </button>
                )}
                <button
                  onClick={restartGame}
                  className="bg-gray-800 text-white px-8 py-3 rounded-lg text-xl font-bold hover:bg-gray-700 border border-gray-600"
                >
                  初めからプレイ
                </button>
                <button
                  onClick={backToTop}
                  className="bg-gray-700 text-white px-8 py-3 rounded-lg text-xl font-bold hover:bg-gray-600 border border-gray-500"
                >
                  トップ画面に戻る
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: Instructions and Volume controls below canvas */}
      {isMobile && !gameState.isGameOver && (
        <div className="mt-3 mx-2 flex gap-2 relative z-10">
          {showInstructions && (
            <div className="flex-1 bg-black bg-opacity-90 p-3 rounded-lg text-xs border border-gray-700">
              <h3 className="font-bold mb-2 text-gray-200">操作方法</h3>
              <p className="text-gray-300">画面タップ: スイング</p>
              <p className="mt-2 text-xs text-gray-400">9回裏から開始。サヨナラ勝ちで次の試合へ。</p>
              <p className="text-xs text-gray-400">同点または負けるとゲームオーバー。</p>
              <p className="mt-2 text-xs text-gray-400">ゲームオーバー時: タップで再開</p>
              <button
                onClick={() => setShowInstructions(false)}
                className="mt-2 bg-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-600 text-gray-200"
              >
                閉じる
              </button>
            </div>
          )}
          <div className={`${showInstructions ? 'flex-1' : 'w-full'} bg-black bg-opacity-90 p-3 rounded-lg text-xs border border-gray-700`}>
            <h3 className="font-bold mb-2 text-gray-200">音量設定</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-10">BGM</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bgmVolume * 100}
                  onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${bgmVolume * 100}%, #374151 ${bgmVolume * 100}%, #374151 100%)`
                  }}
                />
                <span className="text-xs text-gray-300 w-8">{Math.round(bgmVolume * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-10">SE</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={seVolume * 100}
                  onChange={(e) => setSeVolume(Number(e.target.value) / 100)}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${seVolume * 100}%, #374151 ${seVolume * 100}%, #374151 100%)`
                  }}
                />
                <span className="text-xs text-gray-300 w-8">{Math.round(seVolume * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isMobile && (
        <div className="mt-4 text-sm text-gray-500 relative z-10">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="hover:text-gray-300 transition-colors"
          >
            {showInstructions ? '操作方法を隠す' : '操作方法を表示'}
          </button>
        </div>
      )}
    </div>
  )
}

export default App
