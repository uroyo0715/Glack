# Glank API仕様（ドラフト v0.1）

バックエンドAPIと、Unity SDKからの入力ログ送信フォーマットの設計案。
実装前のレビュー用ドキュメント。フロントエンド（`src/`）は未接続。

## 1. 前提・方針

- **入力ログはフレーム番号を正とする。** 現行の`mockBugs.js`・`InputLogStrip.jsx`は秒(`t`)ベースだが、
  Unity SDK側は`Time.frameCount`相当の整数フレームで記録するほうが自然で、
  格闘ゲーム風フレームデータという見た目のコンセプトにも合う。
  秒への変換は「表示時にfpsで割る」の一方向にし、保存・送信・比較は常にフレーム単位で行う。
- 録画1本＝1つの「セッション」。fpsはセッション単位で固定値を記録する（可変フレームレート環境でも録画時に固定fpsへ正規化してSDK側で送る想定。可変対応は将来課題）。
- 認証: Unity SDKからの送信は単一プロジェクト運用を前提に、環境変数`GLANK_API_KEY`と比較する共通APIキー（`X-Glank-Key`ヘッダー）方式で確定（実装済み）。Web側の閲覧・操作は個人ログイン（セッションCookie）を必須とする方式で確定（実装済み、`server/src/auth.js`）。ユーザーはプロトタイプ用の固定シードのみで、本番導入時はユーザー管理の仕組みを別途設計する。
- 動画の保存先: デプロイ先（単一サーバー常設 or クラウドPaaS/コンテナ）が未確定のため、`server/src/storage.js`に保存処理を薄く分離し、現状はローカルディスク実装のみを提供。アップロードは現行どおりUnity SDK→APIサーバーへのmultipart POST（サーバー経由）を維持し、署名付きURLでのクラウド直接アップロードは採用しない。デプロイ先が決まった時点で`storage.js`の実装をS3 / Firebase Storage等に差し替える想定（APIのレスポンス形（`videoUrl`は文字列URL）は変わらない）。

## 2. データモデル

### 2.1 Bug / Report

```ts
interface Bug {
  id: string
  title: string
  // 'crash' | 'visual' | 'softlock' はプリセット（色分け表示あり）。
  // それ以外の任意の文字列も自由記述の種類として受け付ける（tagLabelはtagと同じ文字列になる）。
  tag: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  desc: string
  who: string            // 報告者 or QA担当者
  build: string          // e.g. "0.14.2-dev"
  platform: string       // e.g. "PC (Steam)"
  frequency: FrequencyLevel
  createdAt: string      // ISO8601

  videoUrl: string       // アップロード済み動画のURL（現状はAPIサーバーの/uploads配下。保存先はserver/src/storage.jsで抽象化）
  fps: number            // 録画時のフレームレート（例: 60）
  durationFrames: number // 動画の総フレーム数
  inputs: InputLogEntry[]
}

type FrequencyLevel = 'rare' | 'sometimes' | 'often' | 'always' | 'unknown'
// rare: まれ / sometimes: たまに / often: 再現しやすい / always: 毎回 / unknown: 再現条件不明
// ラベル定義は server/src/data.js の FREQUENCY_LABELS、フロントは src/data/mockBugs.js の FREQUENCY_OPTIONS
```

### 2.2 InputLogEntry（フレームデータ）

```ts
interface InputLogEntry {
  frame: number       // 録画開始を0とした絶対フレーム番号（整数）
  key: string          // ボタン表記。例: "←", "A", "RB"
  label: string        // 表示用の説明。例: "左移動", "ジャンプ"
  holdFrames?: number  // ボタンを保持していたフレーム数（押しっぱなし検出用、省略可）
}
```

`t`（秒）フィールドは廃止。フロント側で表示・同期に使う秒は都度 `frame / fps` で導出する。

### 2.3 フロント側の変換（実装時の参照用）

現在の`InputLogStrip.jsx:6,26`は下記のように秒同士を比較しているが、フレーム基準に置き換える。

```js
// Before（秒ベース）
const activeInput = bug.inputs.find((inp) => Math.abs(inp.t - elapsed) < 0.18)
const pct = (inp.t / bug.duration) * 100

// After（フレームベース）
const elapsedFrame = elapsed * bug.fps
const activeInput = bug.inputs.find((inp) => Math.abs(inp.frame - elapsedFrame) < TOLERANCE_FRAMES) // 例: 6フレーム
const pct = (inp.frame / bug.durationFrames) * 100
```

`bug.duration`（秒）は`durationFrames / fps`で置き換え可能なため、APIレスポンスとしては`durationFrames`のみ持てば十分（要る場合はフロントで算出）。

## 3. エンドポイント

Base path: `/api/v1`

### 3.0 認証エンドポイント（Web側）

Google OAuth 2.0（Authorization Code）でログインする。パスワード方式は廃止した
（ユーザー名とパスワード・表示名を別々に入力させる意味が薄く、ユーザー名を後から変更可能にしたいなら
そもそも不変のログインIDとして使うべきではない、という判断）。ログインIDはGoogleの`sub`（不変）、
`displayName`は初期値をGoogleプロフィール名としつつ、ログイン後にいつでも変更できる純粋な表示用の名前。
セッションはCookie(`glank_session`, HttpOnly)ベース。セッション自体は`sessions`テーブルに永続化しており
（インメモリ実装だと開発中の`--watch`自動再起動のたびに全ユーザーがログアウトさせられるため）、
サーバー再起動をまたいでもログイン状態が消えない。実装は`server/src/routes/auth.js` + `server/src/auth.js`。

- `GET /auth/google` — GoogleのOAuth同意画面へリダイレクト。CSRF対策のstateを`glank_oauth_state`
  Cookieに保存する。
- `GET /auth/google/callback` — Googleからのリダイレクト先。認可コードをトークンに交換し、IDトークンを
  検証（`google-auth-library`の`verifyIdToken`）。初回ログインならユーザーを自動作成し、
  `FRONTEND_URL`へリダイレクトしてセッションCookieを発行する。
- `POST /auth/logout` — Cookieを失効させる。`204`。
- `GET /auth/me` — ログイン中なら`{ email, displayName }`を返す。未ログインは`401`。
- `PATCH /auth/me` — body: `{ displayName }`。表示名をいつでも変更できる。要ログイン。

必要な環境変数（`server/.env`、`server/.env.example`参照）: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_REDIRECT_URI` / `FRONTEND_URL`。Google Cloud ConsoleでのOAuthクライアント発行はチームの
Googleアカウントで行う必要があり、コード側では代行できない。

### 3.0.5 プロジェクトエンドポイント

Webアプリのプロジェクト一覧画面（`src/pages/ProjectsPage.jsx`）に対応。実装は`server/src/routes/projects.js`。

**アクセス制御:** 1つのサーバーを複数チームがGoogleアカウントで共有するため、「ログインしているか」
だけでなく「そのプロジェクトの`projectMembers`に自分のemailが登録されているか」でアクセスを絞る。
非メンバーからは一覧に出てこず、直接IDを指定してアクセスしても`404`になる（存在自体を教えない）。
`GET/PATCH /reports*`系も同様にプロジェクト単位のメンバーシップでガードされる。

- `GET /projects` — 自分がメンバーのプロジェクトだけを返す。各要素は
  `{ id, name, imageUrl, bugCount }`（`bugCount`はそのプロジェクトに紐づくバグ報告数）。
- `POST /projects` — `multipart/form-data`。`name`（必須）と`image`（任意、ティザー画像）を受け取り、
  作成したプロジェクトを`201`で返す。作成者は自動的にそのプロジェクトのメンバーになる。
- `DELETE /projects` — body: `{ ids: number[] }`。指定したプロジェクトと、配下の全バグ報告・
  入力ログ・アップロード済み動画ファイルをまとめて削除する（カスケード削除、元に戻せない）。
  自分がメンバーでないidは黙って無視する。`{ deletedProjectIds: number[] }`を返す。
- `GET /projects/:id/members` — メンバー一覧を`{ email, displayName }[]`で返す。非メンバーは`404`。
  `displayName`は、そのemailで一度でもGoogleログインしたことがあれば入るが、招待されただけで
  まだ一度もログインしていないメンバーは`null`（フロント側はその場合emailを表示にフォールバックする）。
- `POST /projects/:id/members` — body: `{ emails: string[] }`。メンバーを追加する（招待）。
  招待されたユーザーはまだ一度もログインしていなくてもよく、そのemailで初めてGoogleログインした
  瞬間にそのプロジェクトが見えるようになる。email大文字小文字は区別しない。
- `DELETE /projects/:id/members` — body: `{ email }`。メンバーを1人削除する。非メンバーからの
  呼び出しは`404`。**そのプロジェクトの最後の1人は削除できない**（`400`。削除すると誰もアクセス
  できなくなり、UIからは復旧不能になるため）。

#### 3.0.6 ストレージ設定（self_hosted / managed）

各プロジェクトは、バグデータの保存先（DB）と動画・画像の保存先（ストレージ）を
チーム自前のもの（`self_hosted`、無料）か、Glankが用意する共有のもの（`managed`、
有料プラン。`isManagedAllowed`が立っているプロジェクトのみ選択可）かを選べる。
新規プロジェクトは常に`self_hosted`・未設定から始まり、Turso接続情報を設定するまで
`/reports*`系のエンドポイントは`409 { error, code: 'turso_not_configured' }`を返す。

self_hosted接続情報（Tursoの`url`/`authToken`、R2の各値）はAES-256-GCMで暗号化して
DBに保存し（`server/src/crypto.js`）、一度保存した値はAPI経由で平文では読み出せない
（設定済みかどうかの真偽値だけを返す）。

- `GET /projects/:id/storage` — `{ storageMode, isManagedAllowed, tursoConfigured, r2Configured }`を返す。非メンバーは`404`。
- `PATCH /projects/:id/storage` — body: `{ storageMode?, turso?: { url, authToken }, r2?: {...} }`。
  渡したフィールドだけ更新する部分更新。`storageMode: 'managed'`は`isManagedAllowed`が
  falseだと`403`。レスポンス形は`GET`と同じ（更新後の状態、秘密は含まない）。

### 3.1 `GET /reports`
一覧画面（テーブル/カンバン）用。

Query params: `status`, `tag`, `platform`, `build`, `who`, `q`（タイトル/説明の部分一致）

`build`・`who`は完全一致。フロントのフィルタUIはテキスト検索ではなく、
`GET /reports/facets`で取得した既存値からのプルダウン選択にしている（表記ゆれで
検索漏れが起きやすいため）。

Response: `Bug[]`（`inputs`は含めない軽量版でよい。一覧では不要なため）

```ts
type BugListItem = Omit<Bug, 'inputs' | 'videoUrl'>
```

### 3.1.5 `GET /reports/facets`
一覧画面の「ビルド」「報告者」絞り込みプルダウンの選択肢を作るための補助エンドポイント。

Query params: `projectId`（必須）

Response:
```ts
interface ReportFacets {
  builds: string[] // そのプロジェクトで実際に使われているbuild値（重複なし・昇順）
  whos: string[]    // 同様にwho値
}
```

### 3.2 `GET /reports/:id`
詳細画面用。`Bug`をフルで返す（`inputs`・`videoUrl`含む）。

### 3.3 `PATCH /reports/:id`
カンバンのドラッグ&ドロップやテーブルでのステータス変更に加え、報告後の
メタデータ修正（タイトル・ビルドバージョン・報告者など）にも使う部分更新API。
渡したフィールドだけが更新される（省略したフィールドは変更されない）。
`videoUrl`・`fps`・`durationFrames`・`inputs`（録画・入力ログ）は編集対象外。

Request body（すべて省略可、渡したものだけ更新）:
```ts
interface PatchReportBody {
  status?: Bug['status']
  title?: string
  tag?: Bug['tag']
  desc?: string
  who?: string
  build?: string
  platform?: string
  frequency?: FrequencyLevel
}
```
例（ステータス変更のみ）:
```json
{ "status": "in_progress" }
```
例（報告後にビルドバージョンだけ直す）:
```json
{ "build": "0.15.0-hotfix" }
```

`title`/`tag`/`desc`/`who`/`build`/`platform`を空文字で渡した場合は`400`。
`frequency`は未知の値だと`400`（`tag`はプリセット以外の自由記述も許可するため値のチェックはしない）。

Response: 更新後の`BugListItem`。

権限: ログイン済みユーザーであれば誰でも変更可（ロールによる制限なし）。少人数の信頼できるチーム運用を前提とした判断で、`requireAuth`ミドルウェアのみで確定（実装済み）。

### 3.4 `POST /reports`（Unity SDKからの新規報告）
Content-Type: `multipart/form-data`

Fields:
| フィールド | 型 | 説明 |
|---|---|---|
| `video` | file | 録画ファイル(mp4等) |
| `metadata` | json string | 下記`ReportMetadata`をJSON文字列化 |

```ts
interface ReportMetadata {
  projectId: number
  title: string
  tag: Bug['tag']
  desc: string
  who: string
  build: string
  platform: string
  frequency?: FrequencyLevel // 省略時は 'unknown' 扱い
  fps: number
  durationFrames: number
  inputs: InputLogEntry[]
}
```

Response: `201 Created`、作成された`Bug`（`status`は`todo`固定で開始）。

ヘッダー: `X-Glank-Key: <project_api_key>`（必須）

### 3.4.5 `POST /reports/manual`（Web UIからの手動作成）

Unity SDK連携がまだの場合や、動画を撮り損ねた場合に、Web UIから動画なしでテキストのみ報告するための経路。
`POST /reports`とは別で、APIキーではなくセッションCookie（`requireAuth` + プロジェクトメンバーシップ）で認可する。

Content-Type: `application/json`

```ts
interface ManualReportBody {
  projectId: number
  title: string
  tag: Bug['tag']
  desc: string
  who: string
  build: string
  platform: string
  frequency?: FrequencyLevel // 省略時は 'unknown' 扱い
}
```

Response: `201 Created`、作成された`Bug`。`videoUrl`は空文字、`fps`/`durationFrames`は`0`、
`inputs`は`[]`になる（動画・入力ログなしを表す）。フロント側（`BugDetailPage.jsx`）はこれを見て
動画プレイヤーと操作ログ帯を表示せず、代わりに「録画なし」の案内を出す。

### 3.5 `DELETE /reports/:id`
バグ報告を削除する。動画ファイルがある場合はあわせて削除する（`storage.js`経由）。
入力ログ（`bugInputs`）も一緒に削除する。

権限: `PATCH /reports/:id`と同様、ログイン済みのプロジェクトメンバーであれば誰でも削除可。
非メンバー・未ログイン・存在しないidはいずれも`404`（未ログインのみ`401`）。

Response: `200 OK`、`{ "deleted": true }`。取り消せない操作のため、フロント側は削除前に確認ダイアログを挟む。

## 4. Unity SDK 実装メモ（送信仕様の要点）

- SDKはリングバッファで直近Nフレームの入力を保持し、バグ報告トリガー（ホットキー等）が発火した時点で確定させて送信する想定。
- `frame`は録画クリップ内の相対フレーム番号（クリップ先頭=0）。ゲーム全体の`Time.frameCount`ではない。
- 同一フレームに複数入力がある場合は`InputLogEntry`を複数個、同じ`frame`値で入れてよい（配列内の順序は入力順を保持）。
- `holdFrames`は「そのキーが離されるまでの継続フレーム数」。離される前に録画が終わった場合は録画終了までのフレーム数を入れる。
- fpsは録画開始時に固定した値を使う。可変フレームレートで録画するなら、SDK側で一定fpsにリサンプリングしてから送る（このAPIでは可変fpsのタイムスタンプは受け付けない）。

## 5. 未確定事項（次回持ち越し）

現時点でなし。
