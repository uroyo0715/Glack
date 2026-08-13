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
  // 1件の報告に複数のタグを付けられる。既定のプリセットは無く（プロジェクトごとに
  // 「選択肢の管理」で追加する）、色分けもしない。自由記述したタグはtagLabelsの対応する
  // 要素がtagsと同じ文字列になる。
  tags: string[]
  tagLabels: string[]
  status: 'todo' | 'in_progress' | 'review' | 'done'
  desc: string
  who: string            // 報告者 or QA担当者
  assignee: string       // 対応者。空文字は未割り当て（whoとは別で、報告後に誰が対応するか割り当てる）
  build: string          // e.g. "0.14.2-dev"
  platform: string       // e.g. "PC (Steam)"
  priority: PriorityLevel
  createdAt: string      // ISO8601

  videoUrl: string       // アップロード済み動画のURL（現状はAPIサーバーの/uploads配下。保存先はserver/src/storage.jsで抽象化）
  fps: number            // 録画時のフレームレート（例: 60）
  durationFrames: number // 動画の総フレーム数
  inputs: InputLogEntry[]
}

type PriorityLevel = 'high' | 'medium' | 'low'
// high: 高 / medium: 中 / low: 低
// ラベル定義は server/src/data.js の PRIORITY_LABELS、フロントは src/data/mockBugs.js の PRIORITY_OPTIONS
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
  `{ id, name, imageUrl, gameEngine, bugCount, hiddenFieldOptions, customFieldOptions }`
  （`bugCount`はそのプロジェクトに紐づくバグ報告数、`gameEngine`は`'unity' | 'godot' | 'other' | ''`
  （空文字は未設定。UnityとGodot両方のSDKを提供しているため、どちらを使っているプロジェクトか
  見分けられるようにするための項目）、`hiddenFieldOptions`は3.0.7、`customFieldOptions`は3.0.8参照）。
- `POST /projects` — `multipart/form-data`。`name`（必須）、`image`（任意、ティザー画像）、
  `gameEngine`（任意、`'unity' | 'godot' | 'other'`。未知の値は`400`）を受け取り、
  作成したプロジェクトを`201`で返す。作成者は自動的にそのプロジェクトのメンバーになる。
- `PATCH /projects/:id` — `multipart/form-data`。`name`・`image`・`gameEngine`はいずれも任意で、
  渡した方だけ更新する部分更新（プロジェクト一覧カードの「編集」から使う）。`name`を渡して
  空文字の場合は`400`。`gameEngine`が未知の値の場合も`400`。`image`を渡して差し替える場合、
  古い画像ファイルは削除する。ストレージ未設定（self_hostedでR2未設定）の間は
  `409 { error, code: 'r2_not_configured' }`。更新後のプロジェクトを返す。非メンバーは`404`。
- `PATCH /projects/:id/image` — `multipart/form-data`。`image`（必須）で作成後のティザー画像を
  差し替える。古い画像ファイルは削除する。ストレージ未設定（self_hostedでR2未設定）の間は
  `409 { error, code: 'r2_not_configured' }`。更新後のプロジェクトを返す。非メンバーは`404`。
- `DELETE /projects/:id/image` — 画像を外す（`imageUrl: null`に戻す）。ファイルも削除する。
  更新後のプロジェクトを返す。非メンバーは`404`。
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
チーム自前のもの（`self_hosted`、プロジェクトごとにTurso/R2の設定が必要）か、
Glankが用意する共有のもの（`managed`、プロジェクトごとの設定不要。プロジェクト単位500MB・
全体8GBの上限あり）かを選べる。`isManagedAllowed`が立っているプロジェクトのみmanagedを選択可
（新規プロジェクトは既定でtrue。他チームへの提供等でmanaged利用を制限したい場合のゲートとして
残している）。新規プロジェクトは`storageMode: self_hosted`・未設定から始まり、`managed`へ切り替える
かTurso接続情報を設定するまで`/reports*`系のエンドポイントは`409 { error, code: 'turso_not_configured' }`
を返す。

self_hosted接続情報（Tursoの`url`/`authToken`、R2の各値）はAES-256-GCMで暗号化して
DBに保存し（`server/src/crypto.js`）、一度保存した値はAPI経由で平文では読み出せない
（設定済みかどうかの真偽値だけを返す）。

- `GET /projects/:id/storage` — `{ storageMode, isManagedAllowed, tursoConfigured, r2Configured, configuredByName, configuredFromSavedConfig }`
  を返す。非メンバーは`404`。`configuredByName`はTurso/R2を最後に設定した人の表示名
  （誰も設定していなければ`null`）。`configuredFromSavedConfig`は、直近の設定が
  `POST /projects/:id/storage/apply-saved`による適用だった場合に`true`（Web UIはこの間、
  「名前を付けて保存」フォームを隠す。既に名前が付いている設定を同じ内容のまま
  もう一度保存する意味がないため）。`PATCH /projects/:id/storage`で手入力すると`false`に戻る。
- `PATCH /projects/:id/storage` — body: `{ storageMode?, turso?: { url, authToken }, r2?: {...} }`。
  渡したフィールドだけ更新する部分更新。`storageMode: 'managed'`は`isManagedAllowed`が
  falseだと`403`。レスポンス形は`GET`と同じ（更新後の状態、秘密は含まない）。`turso`/`r2`を
  渡すと、その接続情報を入力した本人（ログインユーザー）が`configuredByName`として記録される
  （このAPI単体では下記の「名前を付けて保存」は行わない。呼び出せるようにしたい場合は
  別途`POST /projects/:id/storage/saved-configs`を呼ぶ）。

##### 名前を付けて保存した設定の呼び出し（呼び出せるのは保存した本人のみ）

Turso/R2の接続情報は、ユーザーが任意の名前を付けて明示的に保存でき（`savedStorageConfigs`
テーブル、`ownerEmail`単位）、別のプロジェクトのストレージ設定時に選んで適用できる。
プロジェクトに自動で紐付くわけではないため、プロジェクト数が増えても一覧が際限なく増えたり、
同じ接続情報がプロジェクトの数だけ重複して並んだりしない。`ownerEmail`で厳密に絞り込むため、
**他のメンバーは自分以外が保存した接続情報を一覧にも取得にも呼び出せない**（プロジェクト
メンバーであることは適用先プロジェクトに対して要求するが、それだけでは他人の保存済み設定は見えない）。

- `GET /storage/saved-configs` — ログイン中の自分が保存した接続情報の一覧。各要素:
  `{ id, name, hasTurso, hasR2, updatedAt }`。秘密の値自体は含まない。プロジェクトには
  紐付かないため`:id`は不要。
- `POST /projects/:id/storage/saved-configs` — body: `{ name }`。`:id`のプロジェクトが
  現在持っているTurso/R2接続情報に、指定した名前を付けて保存する（同じ名前で保存し直すと
  上書き）。Turso/R2どちらも未設定なら`400`。非メンバーは`404`。
- `DELETE /storage/saved-configs/:configId` — 自分が保存した設定を削除する。他人の`configId`
  を指定しても何も起きない（サイレントに無視）。
- `POST /projects/:id/storage/apply-saved` — body: `{ savedConfigId }`。指定した保存済み設定
  （自分が所有するものに限る。他人のIDを指定しても`404`）を`:id`のプロジェクトにコピーして適用する。
  レスポンス形は`GET /projects/:id/storage`と同じ。

#### 3.0.7 選択肢の管理（タグ・優先度・プラットフォームのプリセット非表示）

タグ（`tag`）・優先度（`priority`）・プラットフォームはプリセットの選択肢を持つが、
プロジェクト（＝ゲーム）ごとに使わない項目（例: タグの`CRASH`）を報告フォームの
プルダウンから隠せる。設定はプロジェクト単位でメンバー全員に共通で反映され、
既存の報告データ自体は変更しない（隠した値を持つ既存の報告は表示上そのまま見える）。

- `PATCH /projects/:id/field-options` — body: `{ tag?: string[], priority?: string[], platform?: string[] }`
  （非表示にするプリセットのvalue一覧）。渡したフィールドだけ更新する部分更新。
  レスポンスは更新後の`{ tag, priority, platform }`。非メンバーは`404`。

#### 3.0.8 独自のタグ・プラットフォーム項目（追加/削除）

プリセットの非表示（3.0.7）とは別に、プロジェクト独自のタグ・プラットフォーム項目を追加できる
（優先度は固定3段階のため対象外）。追加した項目はプロジェクトメンバーなら誰でも削除できる。

- `POST /projects/:id/custom-options` — body: `{ field: 'tag' | 'platform', value: string }`。
  レスポンスは更新後の`{ tag, platform }`（プロジェクトの`customFieldOptions`）。非メンバーは`404`。
- `DELETE /projects/:id/custom-options` — body: `{ field: 'tag' | 'platform', value: string }`。
  レスポンスは`POST`と同じ形。

### 3.1 `GET /reports`
一覧画面（テーブル/カンバン）用。

Query params: `status`, `tag`, `priority`, `platform`, `build`, `who`, `assignee`, `q`（タイトル/説明の部分一致）。
`tag`は完全一致ではなく「そのバグの`tags`配列にこの値が含まれるか」で絞り込む。

`build`・`who`・`assignee`は完全一致。フロントのフィルタUIはテキスト検索ではなく、
`GET /reports/facets`で取得した既存値からのプルダウン選択にしている（表記ゆれで
検索漏れが起きやすいため）。

`assignee`に予約値`__unassigned__`（`UNASSIGNED_FILTER_VALUE`, `server/src/data.js`）を渡すと、
「未割り当て（`assignee === ''`）」で絞り込める。実際の対応者名として使われることは無い前提の値。

Response: `Bug[]`（`inputs`は含めない軽量版でよい。一覧では不要なため）

```ts
type BugListItem = Omit<Bug, 'inputs' | 'videoUrl'>
```

### 3.1.5 `GET /reports/facets`
一覧画面の「ビルド」「報告者」「対応者」「タグ」絞り込みの選択肢を作るための補助エンドポイント。
`tags`は「選択肢の管理」で追加した独自項目や自由記述で使われたタグも含むため、絞り込みチップに
新しく付けたタグがすぐ反映される（3.0.7で非表示にしたプリセットはフロント側で除く）。

Query params: `projectId`（必須）

Response:
```ts
interface ReportFacets {
  builds: string[]    // そのプロジェクトで実際に使われているbuild値（重複なし・昇順）
  whos: string[]      // 同様にwho値
  assignees: string[] // 同様にassignee値（空文字は除く）
  tags: string[]      // 同様に実際に使われているtags配列の要素（重複なし・昇順）
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
  tags?: string[] // 空配列は不可（最低1つ必要）
  desc?: string
  who?: string
  assignee?: string // 対応者。他のフィールドと違い空文字を許可する（未割り当てに戻す）
  build?: string
  platform?: string
  priority?: PriorityLevel
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

`title`/`desc`/`who`/`build`/`platform`を空文字で渡した場合は`400`。`tags`を渡す場合は
空配列だと`400`（プリセット以外の自由記述も許可するため個々の値のチェックはしない）。
`priority`は未知の値だと`400`。`assignee`だけは空文字を許可する（未割り当てに戻す操作のため）。

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
  tags: string[] // 空配列は不可（最低1つ必要）
  desc: string
  who: string
  build: string
  platform: string
  priority?: PriorityLevel // 省略時は 'medium' 扱い
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
  tags: string[] // 空配列は不可（最低1つ必要）
  desc: string
  who: string
  build: string
  platform: string
  priority?: PriorityLevel // 省略時は 'medium' 扱い
}
```

Response: `201 Created`、作成された`Bug`。`videoUrl`は空文字、`fps`/`durationFrames`は`0`、
`inputs`は`[]`になる（動画・入力ログなしを表す）。フロント側（`BugDetailPage.jsx`）はこれを見て
動画プレイヤーと操作ログ帯を表示せず、代わりに「録画なし」の案内を出す。

### 3.4.6 `PATCH /reports/:id/video`（あとから動画を付け足す/差し替える）

`/reports/manual`で動画なしのまま作成した報告に、あとから動画ファイルを追加できるようにする経路。
`multipart/form-data`。既に動画がある報告に対して呼ぶと差し替え（古いファイルは削除）になる。
`requireAuth` + プロジェクトメンバーシップで認可。ストレージ未設定（self_hostedでR2未設定）の間は
`409 { error, code: 'r2_not_configured' }`。

```ts
interface AttachVideoForm {
  video: File
  fps: number // 正の数値。実際の入力ログ(bugInputs)は追加されないため、再生時間の計算にのみ使う
  durationFrames: number // 正の数値
}
```

Response: 更新後の`Bug`（`inputs`は引き続き`[]`のまま。実際の操作ログは無いため、
動画プレイヤーのみ有効になり操作ログ帯は表示されない）。非メンバー/存在しない報告は`404`。

### 3.5 `DELETE /reports/:id`
バグ報告を削除する。動画ファイルがある場合はあわせて削除する（`storage.js`経由）。
入力ログ（`bugInputs`）も一緒に削除する。

権限: `PATCH /reports/:id`と同様、ログイン済みのプロジェクトメンバーであれば誰でも削除可。
非メンバー・未ログイン・存在しないidはいずれも`404`（未ログインのみ`401`）。

Response: `200 OK`、`{ "deleted": true }`。取り消せない操作のため、フロント側は削除前に確認ダイアログを挟む。

### 3.6 バグ報告内のコメント（スレッド）

権限は他の`/reports/:id`系と同様、ログイン済みのプロジェクトメンバーであれば誰でも閲覧・投稿可。
非メンバー・未ログイン・存在しないidはいずれも`404`（未ログインのみ`401`）。

- `GET /reports/:id/comments` — 投稿順（古い順）のフラットな配列を返す。`parentCommentId`で
  返信関係が分かる（ツリーへの組み立てはフロント側で行う）。
  ```ts
  interface Comment {
    id: number
    bugId: number
    authorEmail: string
    authorDisplayName: string // 投稿時点の表示名のスナップショット（後で改名しても過去コメントの表示は変わらない）
    body: string
    createdAt: string
    parentCommentId: number | null // 特定のコメントへの返信の場合、その親コメントのid。トップレベルはnull
  }
  ```
- `POST /reports/:id/comments` — body: `{ body: string, parentCommentId?: number }`。
  `body`が空文字は`400`。`parentCommentId`を渡すとそのコメントへの返信になる（同じ報告内の
  既存コメントでなければ`400`）。`authorEmail`/`authorDisplayName`はセッションのユーザー情報から
  自動的に付与される。`201 Created`、作成された`Comment`。
- `DELETE /reports/:id/comments/:commentId` — コメントを削除する。**投稿者本人のみ**削除可能
  （それ以外は`403`）。削除すると、そのコメントへの返信も再帰的にまとめて削除される。
  非メンバー・存在しないcommentIdは`404`。Response: `{ "deleted": true }`。

報告自体を削除（`DELETE /reports/:id`）すると、紐づくコメントもまとめて削除される。

### 3.7 SDKのダウンロード

Webアプリのヘルプページ（「SDK連携の使い方」）からSDKフォルダをzipでダウンロードできるように
するための経路。ログイン不要（コード自体は非公開情報ではないため）。

- `GET /sdk/:engine` — `:engine`は`unity`または`godot`。`unity-sdk/Glank`（または
  `godot-sdk/addons/glank`）フォルダをサーバー上でzip化してストリーミングで返す
  （`server/src/routes/sdk.js`。リポジトリ直下のこれらのフォルダがサーバーの実行環境に
  存在することが前提）。未知の`engine`は`404`。

## 4. Unity SDK 実装メモ（送信仕様の要点）

- SDKはリングバッファで直近Nフレームの入力を保持し、バグ報告トリガー（ホットキー等）が発火した時点で確定させて送信する想定。
- `frame`は録画クリップ内の相対フレーム番号（クリップ先頭=0）。ゲーム全体の`Time.frameCount`ではない。
- 同一フレームに複数入力がある場合は`InputLogEntry`を複数個、同じ`frame`値で入れてよい（配列内の順序は入力順を保持）。
- `holdFrames`は「そのキーが離されるまでの継続フレーム数」。離される前に録画が終わった場合は録画終了までのフレーム数を入れる。
- fpsは録画開始時に固定した値を使う。可変フレームレートで録画するなら、SDK側で一定fpsにリサンプリングしてから送る（このAPIでは可変fpsのタイムスタンプは受け付けない）。

## 5. 未確定事項（次回持ち越し）

現時点でなし。
