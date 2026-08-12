// node --test --import ./test/setup.mjs で先読みされる。
// db.js が読み込まれる前に環境変数をセットし、実データ(glank.sqlite)を一切使わせない。
//
// :memory: は使わない。@libsql/client のローカルsqlite3バックエンドでは、
// db.transaction() が新しい接続を作る際に :memory: だと別の空DBに切り替わってしまい、
// トランザクション後の全クエリが "no such table" で壊れる（実際に確認済み）。
// ファイルベースの一時DBならこの問題が起きないため、テストごとに一意な一時ファイルを使う。
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

process.env.GLANK_DB_PATH = path.join(os.tmpdir(), `glank-test-${process.pid}-${crypto.randomUUID()}.sqlite`)
