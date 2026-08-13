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
  動画の取得元は `GetLatestClipPathAsync`（非同期・優先）→ `GetLatestClipPath`（同期）→
  `replayWatcher`（`ReplayFolderWatcher`、既定のフォールバック）の順で決まる。
  入力ログの取得元も `CaptureInputLog` で差し替え可能（新Input System版を使う場合等）。
  詳細は下記「動画録画について」を参照。
- `InstantReplayVideoRecorder.cs` — OSの設定に依存せず、ゲーム自身が直近n秒をリングバッファで
  保持し、トリガー時にmp4として書き出す（推奨）。`GLANK_INSTANT_REPLAY` スクリプティング定義
  シンボルを追加した場合のみコンパイルされる。詳細は下記「動画録画について」を参照。
- `ReplayFolderWatcher.cs` — OSのインスタントリプレイ機能が書き出した動画ファイルを検出するヘルパー
  （フォールバック用）。Windows/macOS/Linuxそれぞれの一般的な保存先が既定値に入る。
  詳細は下記「動画録画について」を参照。
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
- `CrashDetector.cs` / `FreezeWatchdog.cs` — クラッシュ・フリーズを自動検知して報告を送信する
  （既定OFF）。詳細は下記「自動検知（クラッシュ/フリーズ）」を参照。

## 動画録画について

### 推奨: `InstantReplayVideoRecorder`（ゲーム自身がリングバッファで保持）

**既定の推奨方式は `InstantReplayVideoRecorder` を使うこと。** OS側でXbox Game Bar/ShadowPlay/
ReLive等を事前に有効化していないプレイヤーの環境では動画が存在しない、という
`ReplayFolderWatcher`（後述）の弱点を解消するため、ゲーム自身が直近n秒のゲームプレイを
リングバッファとして保持し、トリガー時にその場でmp4として書き出す。

内部では [InstantReplay for Unity](https://github.com/CyberAgentGameEntertainment/InstantReplay)
（CyberAgent製、MIT License）を使う。プラットフォームネイティブのハードウェアエンコーダー
（Windows: Media Foundation / macOS,iOS: VideoToolbox / Android: MediaCodec）を通すため、
常時バッファし続けてもCPU負荷は小さい。**Linuxのみ、システムにインストール済みのffmpegが必要**
（PATHに通っている必要がある。配布先の環境に依存するため、Linux版を配布する場合は別途案内が必要）。
Unity 2022.3以降が必要。

**導入手順:**

1. Unity Package ManagerでInstantReplay本体を追加する
   （`Window > Package Manager > + > Add package from git URL...`）:
   ```
   https://github.com/CyberAgentGameEntertainment/InstantReplay.git?path=Packages/jp.co.cyberagent.instant-replay#release
   ```
   （依存パッケージの導入方法を含む詳細はInstantReplay本体のREADMEを参照）
2. `Project Settings > Player > Scripting Define Symbols` に `GLANK_INSTANT_REPLAY` を追加する
   （このシンボルが無いと `InstantReplayVideoRecorder.cs` はコンパイルされない。未導入のプロジェクトで
   コンパイルエラーにならないようにするための明示的なガード）
3. シーンに `InstantReplayVideoRecorder` をアタッチしたGameObjectを1つ置く
4. 下記「セットアップ例」の通り `BugReportTrigger.GetLatestClipPathAsync` に配線する

### フォールバック: `ReplayFolderWatcher`（OSのインスタントリプレイ機能に頼る）

`InstantReplayVideoRecorder`を導入しない場合、または導入コストをかけたくない場合向けに、
従来の方式も引き続き使える。ゲーム側では録画せず、**OSのインスタントリプレイ機能**
（Windows: Xbox Game Barの背景録画 / NVIDIA ShadowPlay / AMD ReLive）に録画そのものを任せ、
SDKはそれらが書き出した動画ファイルを検出するだけにする。ゲーム本体への負荷はファイル検索のみで
ほぼゼロだが、**プレイヤーが事前にOS側の機能を有効化していないと動画が存在しない**という制約がある。

#### 設定手順（Windows / Xbox Game Bar の例）

1. Windowsの設定 > ゲーム > Xbox Game Bar で「プレイ中にバックグラウンドで録画する」を有効にする
2. キャプチャの設定で録画の長さ（直近何秒を保存するか）を指定する
3. `BugReportTrigger` の `replayWatcher.watchFolders` が既定で
   `%USERPROFILE%\Videos\Captures`（Game Barの既定保存先）を見るようになっている
4. ゲーム内でバグが起きたら `Win + Alt + G` を押して直近の録画を保存し、
   続けて `BugReportTrigger` のホットキー（既定 `F12`）を押して報告を送信する

ShadowPlayやReLiveを使う場合は、それぞれの設定画面で確認した保存先フォルダを
`replayWatcher.watchFolders` に追加すればよい。

#### macOS / Linux について（`ReplayFolderWatcher`使用時）

- **macOS**: `replayWatcher.watchFolders` の既定値は `~/Movies`（QuickTime Playerで
  画面収録した場合の既定保存先）。OBS等を使う場合はその出力フォルダを追加する。
- **Linux**: OSの機能としての「インスタントリプレイ」に相当するものが無いため、既定値は
  空になっている。OBS Studioの「Replay Buffer」機能などサードパーティのツールを使い、
  その出力フォルダを `replayWatcher.watchFolders` に追加する。

**未対応の点**: OSのインスタントリプレイ保存ホットキー（Windowsの`Win+Alt+G`等）と
`BugReportTrigger`のホットキーの自動連携は行っていない（2つのキーを別々に押す必要がある）。
OS側のホットキーを自動でシミュレートする実装はプラットフォームごとに大きく異なり壊れやすいため、
現状は見送っている。

## セットアップ例

`config` と `inputLogRecorder` をInspectorで割り当てるだけで動画も自動で取得される
（`InstantReplayVideoRecorder`を導入していれば優先的にそちらが、していなければ
`replayWatcher` がフォールバックとして使われる。上記「動画録画について」参照）。

```csharp
using Glank;
using UnityEngine;

public class BugReportSetup : MonoBehaviour
{
    [SerializeField] private BugReportTrigger trigger;
#if GLANK_INSTANT_REPLAY
    [SerializeField] private InstantReplayVideoRecorder instantReplay;
#endif

    private void Awake()
    {
#if GLANK_INSTANT_REPLAY
        // 導入していれば、OSのインスタントリプレイ検出より優先してこちらを使う
        trigger.GetLatestClipPathAsync = instantReplay.GetLatestClipPathAsync;
#else
        // 独自のリプレイバッファ実装を使いたい場合のみ差し込む（同期版の例）
        // trigger.GetLatestClipPath = () => MyReplayBuffer.Instance.GetLatestClipPath();
#endif
    }
}
```

`F12` を押すと、`InputLogRecorder` が保持している直近の入力ログと、上記の優先順で
解決された動画ファイルを合わせて `POST /reports` に送信する。

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
   ├─ PriorityDropdown（Dropdown。選択肢: high / medium / low の順） → priorityDropdown
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

## 自動検知（クラッシュ/フリーズ）

ホットキーによる手動報告とは別に、**クラッシュ**と**フリーズ**の2種類に限定して自動検知・
自動報告できる。対象をこの2種類に絞っているのは、透明化やテクスチャ崩れのような見た目の不具合は
画面解析（コンピュータビジョン）が必要でコストが見合わないのと、そもそもGlankが目指しているのは
「人間にしか気づけない主観的な違和感を拾う」ことだから（そちらは引き続きホットキーでの手動報告が対象）。

**両方とも既定で無効。** `GlankConfig.autoDetectionEnabled` をtrueにしない限り何もしない
（配布ビルドに含める場合、意図せず大量の自動報告が飛ぶのを防ぐため）。有効化する前に、
実機に近い環境で自動検知の挙動（誤検知しないか、報告が乱発しないか）を十分確認すること。

自動検知した報告は、既存の`BugReportTrigger.SubmitReport`にそのまま乗るため、動画・入力ログの
取得元（`InstantReplayVideoRecorder`優先→`ReplayFolderWatcher`フォールバック）や送信失敗時の
リトライ（`GlankOfflineQueue`）は手動報告と共通で機能する。タイトルは`"[自動検知] クラッシュ"` /
`"[自動検知] フリーズ"`となり、手動報告と見分けられるようにしている。

### CrashDetector

`Application.logMessageReceived`を監視し、`LogType.Exception`（未処理の例外）を検知したら
自動で送信する（tag: `crash`）。`LogType.Error`は既定では対象外（アセット読み込み失敗など、
クラッシュではない単なるエラーログまで拾うと誤検知が増えるため）。`LogType.Error`も対象にしたい
場合は、`treatAllErrorsAsFatal`を有効にするか、`IsFatalError`に個別の判定条件
（メッセージのパターンマッチ等）を差し込む:

```csharp
crashDetector.IsFatalError = (condition, stackTrace) => condition.Contains("FATAL");
```

連続クラッシュで自動報告が乱発しないよう、既定30秒のクールダウンがある（`cooldownSeconds`）。

### FreezeWatchdog

既定10秒（`freezeThresholdSeconds`で変更可能）フレーム更新（`Time.frameCount`の進行）が
止まっていることを検知したら自動で送信する（tag: `softlock`）。メインスレッドが詰まっている
状況を想定しているため、検知そのものは別スレッドで行う（メインスレッドのUpdate/コルーチンでは、
メインスレッドが本当に固まった場合はその検知処理自体も止まってしまうため使えない）。

ただし報告の送信（入力ログの取得・UnityWebRequest送信等）はUnity APIの制約上メインスレッドでしか
行えないため、実際の送信は「フリーズを検知した後、メインスレッドが応答を再開した最初のUpdate()」で
行われる。**メインスレッドが完全にデッドロックして二度と応答しない場合、原理的にどのような実装でも
報告を送信できない**点に注意（ソフトウェア側の対処には限界があり、外部プロセスによるハング
ウォッチドッグ等、SDKの範囲外の仕組みでのみ対応可能）。

断続的なフリーズが続く場合に自動報告が乱発しないよう、既定60秒のクールダウンがある
（`cooldownSeconds`）。

### セットアップ

シーンに`CrashDetector`・`FreezeWatchdog`をアタッチしたGameObjectを置き、それぞれの
`config`（`GlankConfig`）と`trigger`（`BugReportTrigger`）をInspectorでアサインするだけでよい
（コード不要）。`GlankConfig.autoDetectionEnabled`をtrueにすると有効になる。

## 入力ログのフレーム番号について

- `InputLogRecorder` は `Time.frameCount`（絶対フレーム）で押下・離上を検知し、
  内部バッファには絶対フレームで保持する。
- `Capture()` 呼び出し時に、バッファの先頭フレームを0とした**相対フレーム番号**に変換する
  （`docs/api-spec.md` の `InputLogEntry.frame` と同じ意味）。
- `fps` はプロジェクト側で `InputLogRecorder` に設定した値がそのままAPIに送られる。
  可変フレームレートで動かしている場合、送信するfpsと実際の入力検知タイミングがずれる可能性がある点は注意。
  （`docs/api-spec.md` セクション4に記載の通り、可変fpsでの正確な同期はSDKの対応範囲外）

## 未対応・今後の検討事項

- `InstantReplayVideoRecorder`はLinuxのみ、システムにインストール済みのffmpegが必要
  （プレイヤー環境依存のため、Linux版を配布する場合は別途案内が必要）
- OSのインスタントリプレイ保存ホットキー（Win+Alt+G等）と`BugReportTrigger`のホットキーの
  自動連携（`ReplayFolderWatcher`使用時のみの制約。現状は2つのキーを別々に押す必要がある。
  プラットフォームごとのホットキーシミュレーションは壊れやすいため見送っている。詳細は上記
  「macOS / Linux について」）
- `GlankReportPromptUI`はロジックのみ提供。実際のCanvas/UI部品の配置はUnity Editor側で
  手動で組む必要がある（テキストファイルのSDKにUnityプレハブ資産を含められないため）
- `GlankReplayer` はキー入力の再現のみ対応（乱数シードやゲーム内状態までは復元しないため、
  完全に同一の結果を保証するものではない）
- macOS/Linuxでの`ReplayFolderWatcher`の既定値は実機での動作確認がまだ済んでいない
  （Windows/Xbox Game Barでのみ実地確認済み）
- `InstantReplayVideoRecorder`・`BugReportTrigger`の非同期パスは実機（実際のUnityビルド環境）
  での動作確認がまだ済んでいない（このSDKはC#プロジェクトとしてUnity環境の外で開発しているため。
  依存するInstantReplay本体のAPIはpublicなソースを基に実装しているが、導入後に実機で確認すること）
- `CrashDetector`・`FreezeWatchdog`も同様に実機での動作確認がまだ済んでいない。特に
  `FreezeWatchdog`は別スレッドでの監視を伴うため、対象プラットフォームでのスレッド動作
  （モバイル・コンソール等、プラットフォームによってはスレッド生成に制約がある場合がある）を
  導入前に確認すること
