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
  レガシー `Input` クラスを使う（新Input Systemを使う場合は下記
  `InputLogRecorderNewInputSystem.cs` を参照）。
- `InputLogRecorderNewInputSystem.cs` — 新Input System（`com.unity.inputsystem`）版の
  `InputLogRecorder`。`Keyboard.current`を使う点以外は同じ挙動。ファイル全体が
  `#if ENABLE_INPUT_SYSTEM` で囲ってあるため、Input Systemパッケージを導入していない
  プロジェクトでは単純に無視される（コンパイルエラーにならない）。
- `BugReportTrigger.cs` — ホットキー（デフォルト `F12`）でバグ報告を送信するサンプル実装。
  既定では `replayWatcher`（`ReplayFolderWatcher`）が直近の録画ファイルを自動検出する。
  別の取得方法を使いたい場合は `GetLatestClipPath` に関数を差し込めば上書きできる。
  入力ログの取得元も `CaptureInputLog` で差し替え可能（新Input System版を使う場合等）。
- `ReplayFolderWatcher.cs` — OSのインスタントリプレイ機能が書き出した動画ファイルを検出するヘルパー。
  Windows/macOS/Linuxそれぞれの一般的な保存先が既定値に入る。詳細は下記「動画録画について」を参照。
- `GlankClient.cs` — `multipart/form-data` で `video` ファイルと `metadata`（JSON文字列）を
  `POST {baseUrl}/reports` へ送信する。送信結果は成功/再送可能な失敗/恒久的な失敗
  （`GlankSubmitOutcome`）の3種類に分類される。
- `GlankOfflineQueue.cs` — ネットワーク断やサーバー一時停止で送信できなかった報告を
  ディスクに退避し、一定間隔で自動的に再送するMonoBehaviour。詳細は下記
  「送信失敗時のリトライ（GlankOfflineQueue）」を参照。
- `GlankReportPromptUI.cs` — ホットキーで仮タイトルのまま即送信するのではなく、QA担当が
  タイトル・種類・詳細・発生頻度を入力してから送信できるようにする簡易フォームのロジック。
  詳細は下記「QA向け入力フォーム（GlankReportPromptUI）」を参照。
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
`replayWatcher.watchFolders` に追加すればよい。

### macOS / Linux について

- **macOS**: `replayWatcher.watchFolders` の既定値は `~/Movies`（QuickTime Playerで
  画面収録した場合の既定保存先）。OBS等を使う場合はその出力フォルダを追加する。
- **Linux**: OSの機能としての「インスタントリプレイ」に相当するものが無いため、既定値は
  空になっている。OBS Studioの「Replay Buffer」機能などサードパーティのツールを使い、
  その出力フォルダを `replayWatcher.watchFolders` に追加する。

いずれの場合も、`replayWatcher`任せにせず自前の取得方法（外部キャプチャソフト連携等）を
使いたい場合は `GetLatestClipPath` に差し込めば上書きできる。

**未対応の点**: OSのインスタントリプレイ保存ホットキー（Windowsの`Win+Alt+G`等）と
`BugReportTrigger`のホットキーの自動連携は行っていない（2つのキーを別々に押す必要がある）。
OS側のホットキーを自動でシミュレートする実装はプラットフォームごとに大きく異なり壊れやすいため、
現状は見送っている。

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

## 送信失敗時のリトライ（GlankOfflineQueue）

ネットワーク断やサーバーの一時停止で送信に失敗した場合、`BugReportTrigger`に
`GlankOfflineQueue`をアサインしておくと、その報告（動画ファイルのコピーを含む）を
`Application.persistentDataPath` 配下に退避し、一定間隔（既定60秒）で自動的に再送する。
ゲームを再起動してもキューは消えない。

```csharp
// シーンに GameObject を1つ作り、GlankOfflineQueue をアタッチして
// BugReportTrigger の offlineQueue にドラッグ&ドロップするだけでよい（コード不要）。
```

- 4xx等「再送しても直らない」失敗（`GlankSubmitOutcome.PermanentFailure`）はキューに積まれず、
  従来通りログにエラーが出るだけ（データ自体が不正なため再送しても解決しない）。
- ネットワーク断や5xx等「再送すれば直るかもしれない」失敗（`RetryableFailure`）だけがキューに積まれる。
- 何度再送しても`PermanentFailure`になった場合は、`Application.persistentDataPath/GlankQueue/_failed/`
  に移動される（無限に溜まり続けないようにするため）。中身（`metadata.json`と動画ファイル）は
  開発者が後から手動で確認できる。
- `offlineQueue.PendingCount` で待機中の件数、`offlineQueue.FlushNow()` で即座に再送を試みられる。

## QA向け入力フォーム（GlankReportPromptUI）

既定の`BugReportTrigger`はホットキーを押した瞬間に仮タイトル（`"(quick report)"`）で
即送信する。QA担当がタイトル・種類・詳細・発生頻度を入力してから送信したい場合は、
`GlankReportPromptUI`を使う。

**このスクリプトが提供するのはロジックのみ**（Canvas上のUI部品の配置はUnity Editor側の作業のため、
テキストファイルであるこのSDKには含められない）。以下の構成でHierarchyを組み、
それぞれのUI部品を`GlankReportPromptUI`のInspectorにアサインする（レガシーUI = `UnityEngine.UI`
のみを使用、TextMeshPro等の追加パッケージ不要）:

```
Canvas
└─ ReportPromptPanel（Image等。GlankReportPromptUIの panelRoot にアサイン）
   ├─ TitleInputField（InputField）      → titleField
   ├─ TagDropdown（Dropdown。選択肢: crash / visual / softlock の順） → tagDropdown
   ├─ DescInputField（InputField, Multi Line） → descField
   ├─ FrequencyDropdown（Dropdown。選択肢: rare / sometimes / often / always / unknown の順） → frequencyDropdown
   ├─ SubmitButton（Button）             → submitButton
   └─ CancelButton（Button）             → cancelButton
```

`GlankReportPromptUI`自体は`ReportPromptPanel`と同じGameObject、または任意の場所に
アタッチしてよい。`trigger`に`BugReportTrigger`をアサインし、`BugReportTrigger`側の
`promptUI`にこの`GlankReportPromptUI`をアサインすると、ホットキーで即送信する代わりに
このフォームが開くようになる。ゲームを一時停止したい場合は、`Show()`が呼ばれるタイミングを
フックして`Time.timeScale = 0`にする等、呼び出し側で行う（SDK側では強制しない）。

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

- OSのインスタントリプレイ保存ホットキー（Win+Alt+G等）と`BugReportTrigger`のホットキーの
  自動連携（現状は2つのキーを別々に押す必要がある。プラットフォームごとのホットキー
  シミュレーションは壊れやすいため見送っている。詳細は上記「macOS / Linux について」）
- `GlankReportPromptUI`はロジックのみ提供。実際のCanvas/UI部品の配置はUnity Editor側で
  手動で組む必要がある（テキストファイルのSDKにUnityプレハブ資産を含められないため）
- `GlankReplayer` はキー入力の再現のみ対応（乱数シードやゲーム内状態までは復元しないため、
  完全に同一の結果を保証するものではない）
- macOS/Linuxでの`ReplayFolderWatcher`の既定値は実機での動作確認がまだ済んでいない
  （Windows/Xbox Game Barでのみ実地確認済み）
