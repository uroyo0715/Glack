import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// mockClient.js は実際にsetTimeoutで200〜300ms待つダミー実装のため、
// Testing Libraryの既定1000msタイムアウトだと環境負荷次第でぎりぎり間に合わないことがある。余裕を持たせる。
configure({ asyncUtilTimeout: 5000 })
