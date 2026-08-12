# Glank Unity SDK（ドラフト v0.1）

Glankへ入力ログ付きバグ報告を送信するための最小SDK。
`docs/api-spec.md` の `POST /reports` に対応する。

## 導入方法

`unity-sdk/Glank` フォルダを、対象Unityプロジェクトの `Packages/` 以下に
コピー（またはUPMの `Add package from disk...` で `package.json` を指定）する。
依存パッケージなし（レガシー `Input` クラスのみ使用）。

## 構成

- `GlankConfig.cs` — APIサーバーのURL・APIキー・報告先プロジェクトIDを持つScriptableObject。
  `Assets > Create > Glank > Config` で作成し、`baseUrl` を
  `http://localhost:8787/api/v1`（または本番URL）に設定する。`projectId` は
  Webアプリのプロジェクト一覧画面でカードに表示されている番号を設定する
  （プロジェクトを跨いだ複数ゲーム運用を想定していないため、通常はゲームごとに固定値でよい）。
- `InputLogRecorder.cs` — 直近nバッファ秒分の入力をリングバッファで保持し続けるMonoBehaviour。
  監視するキーを `watchedKeys`（`KeyCode` + Glank上の表示グリフ + ラベル）に登録する。
- `BugReportTrigger.cs` — ホットキー（デフォルト `F12`）でバグ報告を送信するサンプル実装。
  既定では `replayWatcher`（`ReplayFolderWatcher`）が直近の録画ファイルを自動検出する。
  別の取得方法を使いたい場合は `GetLatestClipPath` に関数を差し込めば上書きできる。
- `ReplayFolderWatcher.cs` — OSのインスタントリプレイ機能が書き出した動画ファイルを検出するヘルパー。
  詳細は下記「動画録画について」を参照。
- `GlankClient.cs` — `multipart/form-data` で `video` ファイルと `metadata`（JSON文字列）を
  `POST {baseUrl}/reports` へ送信する。
- `GlankReplayer.cs` — Webアプリのバグ詳細画面「JSONをダウンロード」で書き出した入力ログを
  読み込み、記録時と同じタイミングで再生するMonoBehaviour。バグの再現に使う。詳細は下記
  「入力ログからの再現（GlankReplayer）」を参照。

## 動画録画について

このSDKは**録画のエンコード自体は行わない**。ゲーム側で常時フル画質の映像バッファを
メモリに保持し続ける方式は、720p・60fpsで30秒分だけでも数GBのメモリを消費し実行時負荷が
大きいため採用していない。代わりに、**OSのインスタントリプレイ機能**
（Windows: Xbox Game Barの背景録画 / NVIDIA ShadowPlay / AMD ReLive）に録画そのものを任せ、
SDKはそれらが書き出した動画ファイルを検出するだけにしている。GPUのハードウェアエンコーダーで
既に効率化された仕組みを流用するため、ゲーム本体への負荷はファイル検索のみでほぼゼロ。

### 設定手順（Windows / Xbox Game Bar の例）

1. Windowsの設定 > ゲーム > Xbox Game Bar で「プレイ中にバックグラウンドで録画する」を有効にする
2. キャプチャの設定で録画の長さ（直近何秒を保存するか）を指定する
3. `BugReportTrigger` の `replayWatcher.watchFolders` が既定で
   `%USERPROFILE%\Videos\Captures`（Game Barの既定保存先）を見るようになっている
4. ゲーム内でバグが起きたら `Win + Alt + G` を押して直近の録画を保存し、
   続けて `BugReportTrigger` のホットキー（既定 `F12`）を押して報告を送信する

ShadowPlayやReLiveを使う場合は、それぞれの設定画面で確認した保存先フォルダを
`replayWatcher.watchFolders` に追加すればよい。macOS/Linuxではこの既定実装は使えないため、
`GetLatestClipPath` に別の取得方法（外部キャプチャソフト連携など）を差し込む。

## セットアップ例

`config` と `inputLogRecorder` をInspectorで割り当てるだけで、動画は
`replayWatcher` が自動検出するため追加コードは不要（上記「動画録画について」参照）。
別の録画方法（Unity Recorderや自前のリプレイバッファ等）を使いたい場合のみ、
`GetLatestClipPath` を差し込んで上書きする。

```csharp
using Glank;
using UnityEngine;

public class BugReportSetup : MonoBehaviour
{
    [SerializeField] private BugReportTrigger trigger;

    private void Awake()
    {
        // 既定のOSインスタントリプレイ検出ではなく、自前のリプレイバッファを使いたい場合のみ差し込む
        trigger.GetLatestClipPath = () => MyReplayBuffer.Instance.GetLatestClipPath();
    }
}
```

`F12` を押すと、`InputLogRecorder` が保持している直近の入力ログと
`GetLatestClipPath()` が返す動画ファイルを合わせて `POST /reports` に送信する。
タイトルやタグをQA担当者に入力させたい場合は、`BugReportTrigger.SubmitReport(...)` を
自前のUIから呼び出す形に差し替える。

## 入力ログからの再現（GlankReplayer）

Webアプリのバグ詳細画面で入力ログを「テキスト」表示に切り替えると、
`JSONをダウンロード`（または`JSONをコピー`）で `InputLogSnapshot` 互換のJSONを取得できる。
これを `GlankReplayer` に読み込ませると、記録時と同じフレームタイミングで
`onInputPressed` / `onInputReleased` イベントが発火する。

`GlankReplayer` は実機の `UnityEngine.Input` を書き換えられないため、**ゲーム側の入力読み取り
コードを「再生中はGlankReplayerに、それ以外は通常のInputに問い合わせる」形に差し替える**必要がある。
`InputLogRecorder` の `watchedKeys` と同じglyph文字列（例: `"←"`, `"A"`）で問い合わせる。

```csharp
using Glank;
using UnityEngine;

public class PlayerInput : MonoBehaviour
{
    private bool JumpPressed()
    {
        var replayer = GlankReplayer.Active;
        if (replayer != null && replayer.IsPlaying)
        {
            return replayer.GetKeyDown("A"); // InputLogRecorderに登録したglyphと合わせる
        }
        return Input.GetKeyDown(KeyCode.Space);
    }
}
```

イベント駆動で再現したい場合は、Inspectorで `onInputPressed` / `onInputReleased` に
ゲーム側のアクション関数を直接ワイヤーすればよい（`GlankReplayer` コンポーネントを
シーンに置き、`Log File` にダウンロードしたJSONを `TextAsset` としてインポートして割り当てる）。

- `Play()` / `Pause()` / `Stop()` / `Seek(frame)` で再生を制御できる。
- `playbackSpeed` でスロー再生・早送りができる（フレームタイミングは記録時のfps基準で維持される）。
- `LoadFromJson(json)` / `LoadFromFile(path)` で実行時に動的にログを読み込むこともできる
  （例: Glank Web APIから取得したJSONをそのまま渡す）。

## 入力ログのフレーム番号について

- `InputLogRecorder` は `Time.frameCount`（絶対フレーム）で押下・離上を検知し、
  内部バッファには絶対フレームで保持する。
- `Capture()` 呼び出し時に、バッファの先頭フレームを0とした**相対フレーム番号**に変換する
  （`docs/api-spec.md` の `InputLogEntry.frame` と同じ意味）。
- `fps` はプロジェクト側で `InputLogRecorder` に設定した値がそのままAPIに送られる。
  可変フレームレートで動かしている場合、送信するfpsと実際の入力検知タイミングがずれる可能性がある点は注意。
  （`docs/api-spec.md` セクション4に記載の通り、可変fpsでの正確な同期はSDKの対応範囲外）

## 未対応・今後の検討事項

- macOS/Linux向けのインスタントリプレイ検出（現状`ReplayFolderWatcher`はWindows想定）
- OSのインスタントリプレイ保存ホットキー（Win+Alt+G等）と`BugReportTrigger`のホットキーの
  自動連携（現状は2つのキーを別々に押す必要がある）
- 新Input Systemパッケージへの対応
- 送信失敗時のリトライ・オフラインキュー
- QA向け入力用UI（タイトル・タグ入力フォーム）
- `GlankReplayer` はキー入力の再現のみ対応（乱数シードやゲーム内状態までは復元しないため、
  完全に同一の結果を保証するものではない）
