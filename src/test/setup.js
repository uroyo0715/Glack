import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { vi } from 'vitest'

// mockClient.js は実際にsetTimeoutで200〜300ms待つダミー実装のため、
// Testing Libraryの既定1000msタイムアウトだと環境負荷次第でぎりぎり間に合わないことがある。余裕を持たせる。
configure({ asyncUtilTimeout: 5000 })

// jsdomは実際のメディア再生を持たず、play()/pause()は「not implemented」の警告を出すだけ
// （play()は例外を投げないPromiseの代わりにundefinedを返すため、VideoPlayer.jsx側のcatchが
// 効かず警告ログだけが残る）。テスト全体でこの未実装警告を出さないよう、ここでスタブする。
window.HTMLMediaElement.prototype.play = function play() {
  return Promise.resolve()
}
window.HTMLMediaElement.prototype.pause = function pause() {}
