/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'subject-case': [0],
    'scope-case': [0],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'refactor',
        'docs',
        'test',
        'style',
        'perf',
        'build',
        'ci',
        'revert',
      ],
    ],
  },
  parserPreset: {
    parserOpts: {
      headerPattern: /^(?:(RES-\d+):\s)?(\w+)(?:\(([^)]+)\))?:\s(.+)$/,
      headerCorrespondence: ['ticket', 'type', 'scope', 'subject'],
    },
  },
};
