<template>
  <div class="schematic-box" role="img" :aria-label="`ASCII-схема: ${categoryLabel}`">
    <pre class="schematic-pre">{{ asciiArt }}</pre>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { CATEGORY_META } from '@/lib/categoryMeta';

const props = defineProps({
  category: {
    type: String,
    default: 'OTHER',
  },
  letter: {
    type: String,
    default: null,
  },
});

const SCHEMATICS = {
  I: [
    '      |---| |---|',
    '  [===|   |=|   |===]',
    '  [===|   |=|   |===]',
    '      |---| |---|',
    '         |   |',
    '      ===| O |===',
    '         |---|',
  ].join('\n'),

  S: [
    '    +-------+-------+',
    '[###|   |   |   |   |###]',
    '[###|   |   |   |   |###]',
    '    +-------+-------+',
    '          | |',
    '       +--[o]--+',
    '       |   O   |',
    '       +-------+',
    '          / \\',
  ].join('\n'),

  N: [
    '        +-------+',
    '        |  NAV  |',
    '  +====+|  (O)  |+====+',
    '  |####||       ||####|',
    '  +====+|  ===  |+====+',
    '        +-------+',
    '           | |',
    '          /   \\',
    '         o     o',
  ].join('\n'),

  T: [
    '       +---------+',
    '      /|         |\\',
    '     / |  APERT  | \\',
    '    |  |  [ O ]  |  |',
    '    |  +---------+  |',
    '    \\  |         |  /',
    '     \\ |  INSTR  | /',
    '      \\|         |/',
    '       +====+====+',
    '          [###]',
  ].join('\n'),

  W: [
    '         +-----+',
    '         | MET |',
    '      +--+ [o] +--+',
    '      |  |     |  |',
    '      +--+ === +--+',
    '         +-----+',
    '            |',
    '      [###########]',
    '      [###########]',
  ].join('\n'),

  X: [
    '         +-----+',
    '        /|     |\\',
    '       + |  O  | +',
    '        \\|     |/',
    '         +-----+',
    '           / \\',
    '          o   o',
  ].join('\n'),
};

const SCHEMATIC_KEY_BY_LETTER = {
  I: 'I',
  S: 'S',
  O: 'S',
  R: 'S',
  N: 'N',
  T: 'T',
  W: 'W',
  '×': 'X',
  X: 'X',
};

const categoryLetter = computed(() => {
  if (props.letter) return props.letter;
  const cat = props.category;
  if (cat && CATEGORY_META[cat]?.letter) {
    return CATEGORY_META[cat].letter;
  }
  return 'X';
});

const categoryLabel = computed(() => {
  const cat = props.category;
  if (cat && CATEGORY_META[cat]?.labelRu) {
    return CATEGORY_META[cat].labelRu;
  }
  return 'КОСМИЧЕСКИЙ АППАРАТ';
});

const asciiArt = computed(() => {
  const letter = categoryLetter.value;
  const key = SCHEMATIC_KEY_BY_LETTER[letter] || 'X';
  return SCHEMATICS[key] || SCHEMATICS.X;
});
</script>

<style scoped>
.schematic-box {
  border: 1px solid var(--ink);
  border-radius: 0;
  background: var(--surface);
  padding: 8px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.schematic-pre {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  line-height: 1.1;
  color: var(--ink);
  margin: 0;
  white-space: pre;
  user-select: none;
}
</style>
