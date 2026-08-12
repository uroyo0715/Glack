# Glank (prototype)

インディーゲーム開発者向けの軽量バグ報告ツールのフロントエンド試作。

## 起動方法

### フロントエンドのみ（モックデータ）

```bash
npm install
npm run dev
```

`.env` が無ければモッククライアント（`src/data/mockBugs.js`）が使われる。
http://localhost:5173 でカンバン一覧画面が開く。
カードをクリックすると、動画プレイヤーと操作ログ帯（フレーム表示）が
同期するバグ詳細画面に遷移する。

### バックエンドも含めて起動

```bash
# ターミナル1: APIサーバー
cd server
npm install
npm run dev        # http://localhost:8787/api/v1

# ターミナル2: フロントエンド
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:8787/api/v1
npm install
npm run dev
```

`VITE_API_BASE_URL` が設定されているとフロントエンドは自動でバックエンドAPIを使う
（`src/api/index.js`）。API仕様は [docs/api-spec.md](docs/api-spec.md) を参照。

## テスト

```bash
# バックエンド（node:test、追加パッケージ不要）
cd server
npm test

# フロントエンド（Vitest + React Testing Library）
npm test
```

バックエンドはAPIの結合テストとリポジトリ層の単体テスト。`server/glank.sqlite`（実データ）には
一切触れず、テストごとに一意なファイルベースの一時DB（`server/test/setup.mjs`で`GLANK_DB_PATH`を
設定）を使う（`:memory:`は使わない。理由は`server/src/db.js`のコメント参照）。

フロントエンドは`src/api/mockClient.js`の単体テストと、主要コンポーネント
（`LoginPage`/`FilterBar`/`ProjectsPage`）のテスト、`App.jsx`の結合テスト
（ログイン→プロジェクト→バグ一覧→詳細→ステータス変更→戻る、まで一連の導線）を含む。
`.env.test`で`VITE_API_BASE_URL`を空にし、実バックエンドではなく必ずモッククライアントを
使うようにしている。

## 構成

- `src/pages/BugListPage.jsx` — カンバン形式の一覧画面（未対応/対応中/確認待ち/完了）
- `src/pages/BugDetailPage.jsx` — バグ詳細画面
- `src/components/VideoPlayer.jsx` — 録画動画のプレイヤー（現状はダミー表示 + 再生シミュレーション）
- `src/components/InputLogStrip.jsx` — 格闘ゲームのフレームデータ風、操作ログの帯（フレーム番号基準で同期）
- `src/data/mockBugs.js` — ダミーのバグ報告データ（`src/api/mockClient.js` から利用）
- `src/api/` — APIクライアント層。`VITE_API_BASE_URL`の有無で実API/モックを自動切り替え
- `server/` — バックエンド（Express, SQLite）。`docs/api-spec.md`の実装

## デプロイ（無料・カード登録不要の構成）

- **DB**: [Turso](https://turso.tech)（libSQL、SQLite互換）。`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
  を設定すると自動でそちらを使う（未設定時はローカルのsqliteファイル）。
- **動画・画像ストレージ**: Cloudflare R2（S3互換、無料枠10GB）。`R2_ACCOUNT_ID` /
  `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` を設定すると
  自動でそちらを使う（未設定時はローカルディスク `server/uploads`）。
- **サーバー本体**: Render（無料Webサービス、カード登録不要）を想定。`server/`をルートにした
  Node Webサービスとして、ビルドコマンドなし・起動コマンド`npm start`でデプロイする。
- 必要な環境変数は `server/.env.example` を参照（Google OAuth・Turso・R2 いずれも同じ形式）。

## 今後の実装ポイント

- `VideoPlayer.jsx`は現状タイマーによる再生シミュレーションで、
  アップロード済みの実動画（`videoUrl`）を実際に再生していない
- Unity SDK（`unity-sdk/Glank`）は実際のUnityプロジェクトでの動作確認がまだ済んでいない
