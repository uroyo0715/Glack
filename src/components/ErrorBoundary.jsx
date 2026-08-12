import React from 'react'

// 予期しない描画エラーが起きた際、アプリ全体が無言でプロジェクト一覧まで巻き戻る
// （＝Reactがルート全体をアンマウントする）のを防ぎ、原因を特定できるようにするための安全網。
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[Glank] unexpected render error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="state-panel state-panel-error">
          <p>予期しないエラーが発生しました。開発者ツールのコンソールに詳細が出力されています。</p>
          <p className="mono">{String(this.state.error.message ?? this.state.error)}</p>
          <button onClick={() => window.location.reload()}>再読み込み</button>
        </div>
      )
    }
    return this.props.children
  }
}
