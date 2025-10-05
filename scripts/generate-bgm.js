import scribble from 'scribbletune';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 出力ディレクトリを作成
const outputDir = join(__dirname, '../public/midi');
mkdirSync(outputDir, { recursive: true });

// ============================================
// ラウンド1: 明るく元気な応援チャント (Fメジャー)
// 王道進行 (Royal Road): IV-V-iii-vi (髭男dism、Mrs. GREEN APPLEスタイル)
// ============================================
const round1Progression = 'IV V iii vi'; // 王道進行 - JPOPの定番
const round1Chords = scribble.getChordsByProgression('F4 major', round1Progression);

// メロディパターン定義（一貫性のあるモチーフ）
const motifA = 'x---x-x-x-------'; // モチーフA: 軽快なリズム
const motifB = 'x-x---x-x-x-----'; // モチーフB: シンコペーション
const motifC = 'x---x---x-x-x-x-'; // モチーフC: 盛り上がり
const motifD = 'x-xxx-x-x-x-x---'; // モチーフD: サビの核心

// メロディ: Aメロ、Bメロ、サビの構成（モチーフを組み合わせる）
// スケール（音階）を使って完全な順次進行
const round1Scale = scribble.scale('F4 major'); // Fメジャースケール
const round1Melody = scribble.clip({
  notes: [
    ...round1Scale.slice(0, 5),  // F, G, A, Bb, C (下から上へ)
    ...round1Scale.slice(4, -1).reverse(),  // C, Bb, A, G (上から下へ)
  ],
  // Aメロ: モチーフAを繰り返し（落ち着いた導入）
  // Bメロ: モチーフBとCを組み合わせ（徐々に盛り上げる）
  // サビ: モチーフDを中心に（最高潮）
  pattern: motifA.repeat(4) +        // Aメロ
           (motifB + motifC).repeat(2) +  // Bメロ
           motifD.repeat(8),         // サビ
  subdiv: '8n'
});

// ベースライン（メロディと同じ長さに）
const round1Bass = scribble.clip({
  notes: scribble.getChordsByProgression('F2 major', round1Progression),
  pattern: 'x---x---x---x---'.repeat(4) +  // Aメロ: シンプル
           'x---x-x-x---x-x-'.repeat(4) +  // Bメロ: 少し動きを出す
           'x-x-x-x-x-x-x-x-'.repeat(8),   // サビ: リズミック
  subdiv: '16n'
});

// コード伴奏
const round1Chords1 = scribble.clip({
  notes: round1Chords,
  pattern: 'x-R-x-R-x-R-x-R-'.repeat(4),
  subdiv: '8n'
});

// ============================================
// ラウンド2: やや緊張感 (Aマイナー)
// カノン進行 (Canon): I-V-vi-iii-IV-I-IV-V
// ============================================
const round2Progression = 'I V vi iii IV I IV V'; // カノン進行
const round2Chords = scribble.getChordsByProgression('A3 minor', round2Progression);

const round2Melody = scribble.clip({
  notes: scribble.arp({
    chords: round2Chords,
    count: 8,
    order: '10234' // 跳躍パターン
  }),
  pattern: 'x-x-x---x-x-x-x-'.repeat(4),
  subdiv: '8n'
});

const round2Bass = scribble.clip({
  notes: scribble.getChordsByProgression('A1 minor', round2Progression),
  pattern: 'x---x---x---x-x-'.repeat(4),
  subdiv: '16n'
});

const round2Chords1 = scribble.clip({
  notes: round2Chords,
  pattern: 'x-R-x-R-x-R-x-R-'.repeat(4),
  subdiv: '8n'
});

// ============================================
// ラウンド3: シリアス (Dマイナー)
// Just The Two Of Us進行: IV-iii-vi-I (おしゃれなJPOP)
// ============================================
const round3Progression = 'IV iii vi I IV iii vi I'; // Just The Two Of Us進行
const round3Chords = scribble.getChordsByProgression('D3 minor', round3Progression);

const round3Melody = scribble.clip({
  notes: scribble.arp({
    chords: round3Chords,
    count: 8,
    order: '01243' // おしゃれなパターン
  }),
  pattern: 'x--x-x--x-x-x---'.repeat(4),
  subdiv: '8n'
});

const round3Bass = scribble.clip({
  notes: scribble.getChordsByProgression('D1 minor', round3Progression),
  pattern: 'x---x---x---x-x-'.repeat(4),
  subdiv: '16n'
});

const round3Chords1 = scribble.clip({
  notes: round3Chords,
  pattern: 'x-R-x-R-x-R-x-R-'.repeat(4),
  subdiv: '8n'
});

// ============================================
// ラウンド4: ドラマチック (Gマイナー)
// Pop-Punk進行: IV-I-V-vi (Mrs. GREEN APPLE "Magic"スタイル)
// ============================================
const round4Progression = 'IV I V vi IV I V vi'; // Pop-Punk進行
const round4Chords = scribble.getChordsByProgression('G3 minor', round4Progression);

const round4Melody = scribble.clip({
  notes: scribble.arp({
    chords: round4Chords,
    count: 8,
    order: '02341' // エネルギッシュ
  }),
  pattern: 'x-xx-x-x-xxx-x--'.repeat(4),
  subdiv: '8n'
});

const round4Bass = scribble.clip({
  notes: scribble.getChordsByProgression('G1 minor', round4Progression),
  pattern: 'x-x-x-x-x-x-x---'.repeat(4),
  subdiv: '8n'
});

const round4Chords1 = scribble.clip({
  notes: round4Chords,
  pattern: 'xxR-xxR-xxR-xxR-'.repeat(4),
  subdiv: '8n'
});

// ============================================
// ラウンド5: 壮大なクライマックス (Eマイナー)
// 感動進行: vi-IV-I-V (クライマックスに最適)
// ============================================
const round5Progression = 'vi IV I V vi IV I V'; // 感動進行
const round5Chords = scribble.getChordsByProgression('E3 minor', round5Progression);

const round5Melody = scribble.clip({
  notes: scribble.arp({
    chords: round5Chords,
    count: 8,
    order: '01234' // 上昇で感動的に
  }),
  pattern: 'x-x-xxx-x-x-xxxx'.repeat(4),
  subdiv: '8n'
});

const round5Bass = scribble.clip({
  notes: scribble.getChordsByProgression('E1 minor', round5Progression),
  pattern: 'x-x-x-x-x-x-x-x-'.repeat(4),
  subdiv: '8n'
});

const round5Chords1 = scribble.clip({
  notes: round5Chords,
  pattern: 'xxRxxxRxxxRxxxRx'.repeat(4),
  subdiv: '8n'
});

// MIDIファイルとして保存
scribble.midi([round1Melody, round1Bass, round1Chords1], join(outputDir, 'round1.mid'));
scribble.midi([round2Melody, round2Bass, round2Chords1], join(outputDir, 'round2.mid'));
scribble.midi([round3Melody, round3Bass, round3Chords1], join(outputDir, 'round3.mid'));
scribble.midi([round4Melody, round4Bass, round4Chords1], join(outputDir, 'round4.mid'));
scribble.midi([round5Melody, round5Bass, round5Chords1], join(outputDir, 'round5.mid'));

// JSONファイルとしても保存（ブラウザで読み込みやすい）
const rounds = [
  { melody: round1Melody, bass: round1Bass, chords: round1Chords1, name: 'round1' },
  { melody: round2Melody, bass: round2Bass, chords: round2Chords1, name: 'round2' },
  { melody: round3Melody, bass: round3Bass, chords: round3Chords1, name: 'round3' },
  { melody: round4Melody, bass: round4Bass, chords: round4Chords1, name: 'round4' },
  { melody: round5Melody, bass: round5Bass, chords: round5Chords1, name: 'round5' }
];

rounds.forEach(round => {
  // clipオブジェクト全体をJSONに保存
  const jsonData = {
    tracks: [
      {
        name: 'melody',
        clip: round.melody
      },
      {
        name: 'bass',
        clip: round.bass
      },
      {
        name: 'chords',
        clip: round.chords
      }
    ]
  };
  console.log(`${round.name} clip structure:`, Object.keys(round.melody)); // デバッグ用
  writeFileSync(join(outputDir, `${round.name}.json`), JSON.stringify(jsonData, null, 2));
});

console.log('✅ MIDI files generated successfully with chord progressions!');
console.log('  - round1.mid (Cメジャー - 明るく元気、王道進行: ' + round1Progression + ')');
console.log('  - round2.mid (Aマイナー - やや緊張感、カノン進行: ' + round2Progression + ')');
console.log('  - round3.mid (Dマイナー - シリアス、Just The Two Of Us進行: ' + round3Progression + ')');
console.log('  - round4.mid (Gマイナー - ドラマチック、Pop-Punk進行: ' + round4Progression + ')');
console.log('  - round5.mid (Eマイナー - 壮大なクライマックス、感動進行: ' + round5Progression + ')');
console.log('✅ JSON files also generated for browser playback!');
