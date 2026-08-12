import { createClient } from '@libsql/client'
import path from 'node:path'

// 本番はTurso（TURSO_DATABASE_URL/TURSO_AUTH_TOKENを設定）、それ以外（開発・テスト）は
// ローカルのsqliteファイルを使う。どちらも同じ@libsql/client経由なのでアプリ側のコードは
// 環境によって分岐する必要がない。
// 注: GLANK_DB_PATH=:memory: は使わない。@libsql/client のローカルsqlite3バックエンドでは
// db.transaction() が新しい接続を作る際に :memory: だと別の空DBに切り替わってしまい、
// トランザクション後の全クエリが壊れる（実際に確認済み）。テストはファイルベースの一時DBを使う
// （test/setup.mjs参照）。
function resolveDbUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL
  const p = process.env.GLANK_DB_PATH || path.join(import.meta.dirname, '..', 'glank.sqlite')
  return `file:${p}`
}

const DB_URL = resolveDbUrl()
export const isRemoteDb = /^(libsql|https?):\/\//.test(DB_URL)

export const db = createClient({
  url: DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    googleId TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    displayName TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    imageUrl TEXT
  );

  CREATE TABLE IF NOT EXISTS bugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    tag TEXT NOT NULL,
    tagLabel TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT NOT NULL,
    who TEXT NOT NULL,
    build TEXT NOT NULL,
    platform TEXT NOT NULL,
    frequency TEXT NOT NULL,
    videoUrl TEXT NOT NULL,
    fps INTEGER NOT NULL,
    durationFrames INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bugInputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bugId INTEGER NOT NULL REFERENCES bugs(id),
    seq INTEGER NOT NULL,
    frame INTEGER NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    holdFrames INTEGER
  );

  -- セッションをインメモリで持つと、開発中の --watch 自動再起動のたびに
  -- 全ユーザーが問答無用でログアウトさせられてしまう（実際に何度も起きた）。
  -- DBに永続化し、サーバー再起動をまたいでもログイン状態を保つ。
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    googleId TEXT NOT NULL REFERENCES users(googleId),
    createdAt TEXT NOT NULL
  );

  -- プロジェクトへのアクセス制御。ログインしているだけでは見えず、そのプロジェクトの
  -- メンバー（emailで管理。招待時点ではまだGoogleログインしていない場合もあるためgoogleIdではなくemailで持つ）
  -- だけが閲覧・操作できる。
  CREATE TABLE IF NOT EXISTS projectMembers (
    projectId INTEGER NOT NULL REFERENCES projects(id),
    email TEXT NOT NULL,
    addedAt TEXT NOT NULL,
    PRIMARY KEY (projectId, email)
  );
`)

// マイグレーション: プロジェクト機能導入前に作られたDBには bugs.projectId が存在しない。
// 既存データを失わないよう、ALTER TABLEで列を追加し、初期プロジェクトへ割り当てる。
async function migrateAddProjectIdIfNeeded() {
  const { rows: columns } = await db.execute('PRAGMA table_info(bugs)')
  const hasProjectId = columns.some((c) => c.name === 'projectId')
  if (hasProjectId) return

  const { rows: existingProjects } = await db.execute('SELECT id FROM projects ORDER BY id LIMIT 1')
  let projectId = existingProjects[0]?.id
  if (!projectId) {
    const result = await db.execute({
      sql: 'INSERT INTO projects (name, imageUrl) VALUES (?, ?)',
      args: ['Nightfall Trail', null],
    })
    projectId = result.lastInsertRowid
  }
  await db.execute(`ALTER TABLE bugs ADD COLUMN projectId INTEGER NOT NULL DEFAULT ${Number(projectId)}`)
}

await migrateAddProjectIdIfNeeded()

// マイグレーション: メンバー制導入前に作られたプロジェクトは誰もメンバーになっていない
// （＝誰からも見えなくなってしまう）ため、既存ユーザー全員を既存プロジェクト全ての
// メンバーとして登録し、導入前と同じ見え方を維持する。以降の新規プロジェクトは
// 作成者だけがメンバーになる。
async function migrateBackfillProjectMembers() {
  const { rows: projectsWithoutMembers } = await db.execute(
    'SELECT id FROM projects WHERE id NOT IN (SELECT DISTINCT projectId FROM projectMembers)'
  )
  if (projectsWithoutMembers.length === 0) return

  const { rows: users } = await db.execute('SELECT email FROM users')
  if (users.length === 0) return

  const now = new Date().toISOString()
  for (const project of projectsWithoutMembers) {
    for (const user of users) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO projectMembers (projectId, email, addedAt) VALUES (?, ?, ?)',
        args: [project.id, user.email.toLowerCase(), now],
      })
    }
  }
}

await migrateBackfillProjectMembers()

const SEED_BUGS = [
  {
    title: '崖から落ちた直後にゲームがフリーズする',
    tag: 'crash',
    tagLabel: 'CRASH',
    status: 'todo',
    desc: '2段ジャンプ後に崖端で着地すると、まれに操作を受け付けなくなる。BGMは鳴り続ける。',
    who: 'tanaka_qa',
    build: '0.14.2-dev',
    platform: 'PC (Steam)',
    frequency: 'rare',
    videoUrl: '/uploads/seed-1.mp4',
    fps: 60,
    durationFrames: 252,
    inputs: [
      { frame: 18, key: '←', label: '左移動' },
      { frame: 54, key: 'A', label: 'ジャンプ' },
      { frame: 69, key: 'A', label: '二段ジャンプ' },
      { frame: 144, key: '←', label: '左移動（継続）', holdFrames: 12 },
      { frame: 186, key: 'B', label: '着地直後に攻撃' },
      { frame: 216, key: '—', label: '入力なし（フリーズ）' },
    ],
  },
  {
    title: 'インベントリを開くとアイコンが一瞬透ける',
    tag: 'visual',
    tagLabel: 'VISUAL',
    status: 'in_progress',
    desc: 'メニューを高速で開閉すると装備アイコンが数フレーム透明になる。見た目のみの問題。',
    who: 'yamada_dev',
    build: '0.14.1-dev',
    platform: 'PC (Steam)',
    frequency: 'often',
    videoUrl: '/uploads/seed-2.mp4',
    fps: 60,
    durationFrames: 156,
    inputs: [
      { frame: 12, key: 'I', label: 'インベントリを開く' },
      { frame: 30, key: 'I', label: '閉じる' },
      { frame: 39, key: 'I', label: '再度開く' },
      { frame: 84, key: '→', label: 'タブ切り替え' },
    ],
  },
  {
    title: '特定の会話後にキャラが動けなくなる',
    tag: 'softlock',
    tagLabel: 'SOFTLOCK',
    status: 'review',
    desc: '村長との会話イベント終了後、稀に移動入力が反映されなくなる（再現条件不明）。',
    who: 'sato_playtest',
    build: '0.13.9-dev',
    platform: 'Switch',
    frequency: 'unknown',
    videoUrl: '/uploads/seed-3.mp4',
    fps: 60,
    durationFrames: 300,
    inputs: [
      { frame: 24, key: 'E', label: '会話を開始' },
      { frame: 108, key: 'E', label: '選択肢を選ぶ' },
      { frame: 234, key: 'E', label: '会話終了' },
      { frame: 258, key: '←', label: '入力しても反応なし' },
    ],
  },
  {
    title: 'タイトル画面でボタン連打すると多重遷移する',
    tag: 'crash',
    tagLabel: 'CRASH',
    status: 'done',
    desc: 'スタートボタンを連打すると同じシーンが二重に読み込まれ、UIが重なって表示される。',
    who: 'tanaka_qa',
    build: '0.14.0-dev',
    platform: 'PC (Steam)',
    frequency: 'always',
    videoUrl: '/uploads/seed-4.mp4',
    fps: 60,
    durationFrames: 108,
    inputs: [
      { frame: 6, key: 'A', label: 'スタート連打 1' },
      { frame: 13, key: 'A', label: 'スタート連打 2' },
      { frame: 20, key: 'A', label: 'スタート連打 3' },
    ],
  },
  {
    title: '橋の上でカメラがマップ外にめり込む',
    tag: 'visual',
    tagLabel: 'VISUAL',
    status: 'todo',
    desc: '橋の中央付近でカメラを最大まで引くと、地形の外側が見えてしまう。',
    who: 'yamada_dev',
    build: '0.14.2-dev',
    platform: 'PC (Steam)',
    frequency: 'often',
    videoUrl: '/uploads/seed-5.mp4',
    fps: 60,
    durationFrames: 126,
    inputs: [
      { frame: 18, key: 'R', label: 'カメラを引く' },
      { frame: 66, key: 'R', label: 'カメラを引く（継続）', holdFrames: 30 },
    ],
  },
  {
    title: 'セーブ直後にロードするとアイテム欄が空になる',
    tag: 'crash',
    tagLabel: 'CRASH',
    status: 'in_progress',
    desc: 'クイックセーブ直後にクイックロードすると、稀にインベントリデータが初期化される。',
    who: 'sato_playtest',
    build: '0.14.1-dev',
    platform: 'PC (Steam)',
    frequency: 'rare',
    videoUrl: '/uploads/seed-6.mp4',
    fps: 60,
    durationFrames: 204,
    inputs: [
      { frame: 12, key: 'F5', label: 'クイックセーブ' },
      { frame: 36, key: 'F9', label: 'クイックロード' },
    ],
  },
  {
    title: 'ボス戦後の会話でテキストが途切れる',
    tag: 'softlock',
    tagLabel: 'SOFTLOCK',
    status: 'todo',
    desc: '長いセリフの途中でボイスが止まり、次の選択肢に進めなくなることがある。',
    who: 'tanaka_qa',
    build: '0.14.2-dev',
    platform: 'Switch',
    frequency: 'rare',
    videoUrl: '/uploads/seed-7.mp4',
    fps: 60,
    durationFrames: 276,
    inputs: [
      { frame: 30, key: 'E', label: '会話送り 1' },
      { frame: 108, key: 'E', label: '会話送り 2' },
      { frame: 234, key: 'E', label: '会話送り 3（反応なし）' },
    ],
  },
  {
    title: 'マップ切り替え時に一瞬フレームレートが落ちる',
    tag: 'visual',
    tagLabel: 'VISUAL',
    status: 'review',
    desc: 'エリア間の切り替え時、0.5秒ほど極端にカクつく。ロード自体は正常。',
    who: 'yamada_dev',
    build: '0.14.0-dev',
    platform: 'PC (Steam)',
    frequency: 'always',
    videoUrl: '/uploads/seed-8.mp4',
    fps: 60,
    durationFrames: 120,
    inputs: [{ frame: 24, key: '→', label: 'エリア境界を通過' }],
  },
  {
    title: '装備変更後にステータス表示が更新されない',
    tag: 'visual',
    tagLabel: 'VISUAL',
    status: 'done',
    desc: '武器を変更しても攻撃力の表示が旧値のまま。実際のダメージ計算には影響なし。',
    who: 'sato_playtest',
    build: '0.13.8-dev',
    platform: 'Switch',
    frequency: 'always',
    videoUrl: '/uploads/seed-9.mp4',
    fps: 60,
    durationFrames: 96,
    inputs: [
      { frame: 12, key: 'I', label: '装備画面を開く' },
      { frame: 54, key: 'A', label: '武器を変更' },
    ],
  },
]

async function seedIfEmpty() {
  // users はGoogleログイン時に findOrCreateUser() で自動作成されるためシード不要。

  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM projects')
  if (rows[0].n !== 0) return

  const projectResult = await db.execute({
    sql: 'INSERT INTO projects (name, imageUrl) VALUES (?, ?)',
    args: ['Nightfall Trail', null],
  })
  const projectId = projectResult.lastInsertRowid

  for (const seedBug of SEED_BUGS) {
    const bugResult = await db.execute({
      sql: `INSERT INTO bugs
          (projectId, title, tag, tagLabel, status, description, who, build, platform, frequency, videoUrl, fps, durationFrames)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        projectId,
        seedBug.title,
        seedBug.tag,
        seedBug.tagLabel,
        seedBug.status,
        seedBug.desc,
        seedBug.who,
        seedBug.build,
        seedBug.platform,
        seedBug.frequency,
        seedBug.videoUrl,
        seedBug.fps,
        seedBug.durationFrames,
      ],
    })
    const bugId = bugResult.lastInsertRowid
    let seq = 0
    for (const input of seedBug.inputs) {
      await db.execute({
        sql: 'INSERT INTO bugInputs (bugId, seq, frame, key, label, holdFrames) VALUES (?, ?, ?, ?, ?, ?)',
        args: [bugId, seq, input.frame, input.key, input.label, input.holdFrames ?? null],
      })
      seq += 1
    }
  }
}

await seedIfEmpty()
