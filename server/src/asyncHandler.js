// Express 4はasyncルートハンドラ内で投げられた例外（rejectされたPromise）を自動キャッチしない。
// キャッチされない例外が起きると、レスポンスが一切返らずクライアント側がハングしたままになる
// （実際に deleteProjects の外部キー制約違反でこれが起きた）。
// このラッパーで catch し、next(err) 経由でエラーハンドリングミドルウェアに渡す。
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
