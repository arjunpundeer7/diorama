'use strict';

class UserError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'UserError';
    this.hint = hint;
  }
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: paint(1),
  dim: paint(2),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
};

const out = (...lines) => console.log(lines.join('\n'));

function table(rows, indent = '  ') {
  const plain = (s) => String(s).replace(/\x1b\[\d+m/g, '');
  const widths = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] || 0, plain(cell).length)));
  for (const row of rows) {
    const line = row.map((cell, i) => (i === row.length - 1 ? cell : cell + ' '.repeat(widths[i] - plain(cell).length))).join('  ');
    console.log(indent + line.trimEnd());
  }
}

module.exports = { UserError, c, out, table };
