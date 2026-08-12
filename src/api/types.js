/**
 * @typedef {'crash' | 'visual' | 'softlock'} BugTag
 * @typedef {'todo' | 'in_progress' | 'review' | 'done'} BugStatus
 */

/**
 * @typedef {Object} InputLogEntry
 * @property {number} frame - 録画開始を0とした絶対フレーム番号
 * @property {string} key - ボタン表記（例: "←", "A"）
 * @property {string} label - 表示用の説明
 * @property {number} [holdFrames] - ボタンを保持していたフレーム数
 */

/**
 * @typedef {Object} BugListItem
 * @property {string|number} id
 * @property {string} title
 * @property {BugTag} tag
 * @property {string} tagLabel
 * @property {BugStatus} status
 * @property {string} desc
 * @property {string} who
 * @property {string} build
 * @property {string} platform
 * @property {string} frequency
 */

/**
 * @typedef {BugListItem & {
 *   videoUrl: string,
 *   fps: number,
 *   durationFrames: number,
 *   inputs: InputLogEntry[],
 * }} Bug
 */

export {}
