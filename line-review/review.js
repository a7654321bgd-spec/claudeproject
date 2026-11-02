// The review of «ДИНАСТИЯ» (VILLIAN & madk1d): each line of the second verse, plus the chorus line
// before it, gets a verdict like a move in a chess game review. Lines are quoted short and censored.
// Timing: from the drop at 62.39 s the track runs 56 bars and its second part has 28 lines (chorus 8,
// verse 12, chorus 8), so every line takes two bars; the verse starts on bar 16, where the bass
// pattern changes, and ends on bar 40 after the break at bar 39.
'use strict';

const GRADES = {
  brilliant: { label: 'Блестяще!!', mark: '!!', color: '#26c2b8', score: 100, eval: 1.4 },
  best: { label: 'Лучший ход', mark: '★', color: '#6dbb3c', score: 100, eval: 1.0 },
  excellent: { label: 'Отлично!', mark: '!', color: '#97c84a', score: 90, eval: 0.6 },
  good: { label: 'Хорошо', mark: '✓', color: '#8fa880', score: 75, eval: 0.25 },
  inaccuracy: { label: 'Неточность?!', mark: '?!', color: '#f0c43c', score: 50, eval: -0.45 },
  mistake: { label: 'Ошибка?', mark: '?', color: '#f08a2c', score: 25, eval: -0.9 },
};

// bar: where the line starts, counted in bars from the drop
const LINES = [
  { bar: 14, part: 'припев', quote: 'Мама говорила: «Выкинь н*хуй микрофон»', grade: 'brilliant',
    note: 'история андердога в одной строчке' },
  { bar: 16, part: 'куплет 2', quote: 'Я мог остаться тенью…', grade: 'good', note: 'спокойный заход' },
  { bar: 18, part: 'куплет 2', quote: '…стучать выше этих многоэтажек', grade: 'excellent', note: 'образ роста, двойной смысл' },
  { bar: 20, part: 'куплет 2', quote: 'Стала мамбл — так разбирай на цитаты', grade: 'brilliant', note: 'самоирония против хейтеров' },
  { bar: 22, part: 'куплет 2', quote: 'Твой друг чё, тоже стал рэпер?', grade: 'inaccuracy', note: 'шутка обрывается на полуслове' },
  { bar: 24, part: 'куплет 2', quote: 'Прости, но я немного на другом', grade: 'inaccuracy', note: 'проходная строчка' },
  { bar: 26, part: 'куплет 2', quote: 'Прощу тебя сейчас — не прощу себя потом', grade: 'best', note: 'зеркальная конструкция' },
  { bar: 28, part: 'куплет 2', quote: 'Мой диагноз — ненормальный', grade: 'good', note: 'панч про психолога держит' },
  { bar: 30, part: 'куплет 2', quote: 'Показывал свой рэп, но тебе было наплевать', grade: 'good', note: 'подводка к следующему ходу' },
  { bar: 32, part: 'куплет 2', quote: 'Забавно, как ты просишь со мной фотку', grade: 'inaccuracy', note: 'классический, но заезженный ход' },
  { bar: 34, part: 'куплет 2', quote: 'Никакого мит-н-грита…', grade: 'mistake', note: 'грубость ради рифмы' },
  { bar: 36, part: 'куплет 2', quote: 'Слить пол-ляма на футболку', grade: 'inaccuracy', note: 'флекс, который все уже слышали' },
  { bar: 38, part: 'куплет 2', quote: 'Мой любимый рэпер п*здит мои наработки', grade: 'brilliant', note: 'лучший панч трека' },
];
const SUMMARY_BAR = 40, END_BAR = 44;

module.exports = { GRADES, LINES, SUMMARY_BAR, END_BAR };
