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
一切触れず、テストごとにインメモリDB（`GLANK_DB_PATH=:memory:`、`server/test/setup.mjs`で設定）を使う。

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

## 今後の実装ポイント

- `VideoPlayer.jsx`は現状タイマーによる再生シミュレーションで、
  アップロード済みの実動画（`videoUrl`）を実際に再生していない
- Unity SDK（`unity-sdk/Glank`）は実際のUnityプロジェクトでの動作確認がまだ済んでいない
