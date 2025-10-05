import scribble from 'scribbletune';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 出力ディレクトリを作成
const outputDir = join(__dirname, '../public/midi');
mkdirSync(outputDir, { recursive: true });

// ラウンド1: 明るく元気な応援チャント
const round1 = scribble.clip({
  notes: scribble.scale('C4 major').slice(0, 5), // C D E F G
  pattern: 'x-x-x-x-x-x-x-x-', // Aメロ
  subdiv: '8n'
});

const round1B = scribble.clip({
  notes: scribble.scale('C4 major').slice(2, 7), // E F G A B
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round1C = scribble.clip({
  notes: scribble.scale('C5 major').slice(0, 6), // C5 D5 E5 F5 G5 A5
  pattern: 'x-x-x-xx-x-x-xx-',
  subdiv: '8n'
});

// ラウンド2: やや緊張感
const round2 = scribble.clip({
  notes: scribble.scale('A3 minor').slice(0, 5),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round2B = scribble.clip({
  notes: scribble.scale('A3 minor').slice(3, 8),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round2C = scribble.clip({
  notes: scribble.scale('A4 minor').slice(0, 6),
  pattern: 'xx-x-x-xx-x-x-x-',
  subdiv: '8n'
});

// ラウンド3: シリアス
const round3 = scribble.clip({
  notes: scribble.scale('G3 minor').slice(0, 5),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round3B = scribble.clip({
  notes: scribble.scale('G3 minor').slice(3, 8),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round3C = scribble.clip({
  notes: scribble.scale('G4 minor').slice(0, 6),
  pattern: 'xx-x-x-xx-x-x-x-',
  subdiv: '8n'
});

// ラウンド4: ドラマチック
const round4 = scribble.clip({
  notes: scribble.scale('F3 minor').slice(0, 5),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round4B = scribble.clip({
  notes: scribble.scale('F3 minor').slice(3, 8),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round4C = scribble.clip({
  notes: scribble.scale('F4 minor').slice(0, 6),
  pattern: 'xx-x-x-xx-x-x-x-',
  subdiv: '8n'
});

// ラウンド5: 壮大なクライマックス
const round5 = scribble.clip({
  notes: scribble.scale('A2 minor').slice(0, 5),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round5B = scribble.clip({
  notes: scribble.scale('A2 minor').slice(3, 8),
  pattern: 'x-x-x-x-x-x-x-',
  subdiv: '8n'
});

const round5C = scribble.clip({
  notes: scribble.scale('A3 minor').slice(0, 6),
  pattern: 'xx-x-x-xx-x-x-x-',
  subdiv: '8n'
});

// MIDIファイルとして保存
scribble.midi([round1, round1B, round1C], join(outputDir, 'round1.mid'));
scribble.midi([round2, round2B, round2C], join(outputDir, 'round2.mid'));
scribble.midi([round3, round3B, round3C], join(outputDir, 'round3.mid'));
scribble.midi([round4, round4B, round4C], join(outputDir, 'round4.mid'));
scribble.midi([round5, round5B, round5C], join(outputDir, 'round5.mid'));

console.log('✅ MIDI files generated successfully!');
console.log('  - round1.mid (明るく元気)');
console.log('  - round2.mid (やや緊張感)');
console.log('  - round3.mid (シリアス)');
console.log('  - round4.mid (ドラマチック)');
console.log('  - round5.mid (壮大)');
