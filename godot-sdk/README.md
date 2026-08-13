# Glank Godot SDK（ドラフト v0.1）

Glankへ入力ログ付きバグ報告を送信するための最小SDK（GDScript版）。
`docs/api-spec.md` の `POST /reports` に対応する。`unity-sdk/`（Unity/C#版）と機能的に対応する
構成になっているが、Godot/GDScriptの実際の言語仕様・エンジンAPIに基づいて設計し直している
（Unity版をそのまま置き換えただけの実装ではない）。

## 導入方法

`godot-sdk/addons/glank` フォルダを、対象Godotプロジェクトの `addons/glank` にコピーする。
Godotエディタで `プロジェクト > プロジェクト設定 > プラグイン` から「Glank Bug Report SDK」を
有効化する（`class_name` 付きスクリプトはアドオンを有効化しなくてもプロジェクト全体から使えるが、
配布・管理をGodotの慣習に合わせるため通常のアドオンとして提供している）。
依存パッケージなし（Godot標準機能のみ使用）。Godot 4系を想定。

## 構成

- `glank_config.gd` — APIサーバーのURL・APIキー・報告先プロジェクトID・自動検知の有効/無効を持つ
  `Resource`。FileSystemドックを右クリック `New Resource > GlankConfig` で作成し、`base_url` を
  `http://localhost:8787/api/v1`（または本番URL）に設定する。`project_id` はWebアプリの
  プロジェクト一覧画面でカードに表示されている番号を設定する。
- `glank_watched_key.gd` — `InputLogRecorder` が監視するキーと、Glank上での表示グリフ・ラベルを
  持つ小さな`Resource`。
- `input_log_recorder.gd` — 直近`buffer_seconds`秒分の入力を常時リングバッファで保持し続ける
  `Node`。`_input(event)` で `InputEventKey` を検知する（Godot標準のイベント駆動方式。Unity版の
  ように毎フレームポーリングしない）。`watched_keys` に `GlankWatchedKey` を登録する。
- `bug_report_trigger.gd` — ホットキー（既定 `F12`）でバグ報告を送信する実装。既定では
  `replay_watcher`（`GlankReplayFolderWatcher`）が直近の録画ファイルを自動検出する。別の取得方法を
  使いたい場合は `get_latest_clip_path` に `Callable`（`String` を返す関数）を差し込めば上書きできる。
  入力ログの取得元も `capture_input_log` で差し替え可能。
- `replay_folder_watcher.gd` — OSのインスタントリプレイ機能が書き出した動画ファイルを検出する
  ヘルパー。Windows/macOS/Linuxそれぞれの一般的な保存先が既定値に入る。詳細は下記
  「動画録画について」を参照。
- `glank_client.gd` — `multipart/form-data` で `video` ファイルと `metadata`（JSON文字列）を
  `POST {base_url}/reports` へ送信する。GodotのHTTPRequestにはmultipart組み立てのヘルパーが
  無いため、boundaryを手動で挟んだ`PackedByteArray`を`request_raw()`で送る。送信結果は
  成功/再送可能な失敗/恒久的な失敗（`GlankClient.SubmitOutcome`）の3種類に分類される。
- `glank_offline_queue.gd` — ネットワーク断やサーバー一時停止で送信できなかった報告を
  `user://glank_queue` に退避し、一定間隔で自動的に再送する`Node`。詳細は下記
  「送信失敗時のリトライ（GlankOfflineQueue）」を参照。
- `glank_report_prompt_ui.gd` — ホットキーで仮タイトルのまま即送信するのではなく、QA担当が
  タイトル・種類・詳細・優先度を入力してから送信できるようにする簡易フォームのロジック。
- `glank_replayer.gd` — Webアプリのバグ詳細画面「JSONをダウンロード」で書き出した入力ログを
  読み込み、記録時と同じタイミングで再生する`Node`。バグの再現に使う。
- `crash_detector.gd` / `freeze_watchdog.gd` — クラッシュ・フリーズを自動検知して報告を送信する
  （既定OFF）。詳細は下記「自動検知（クラッシュ/フリーズ）」を参照。

## 動画録画について

このSDKは**録画のエンコード自体は行わない**。ゲーム側では録画せず、**OSのインスタントリプレイ機能**
（Windows: Xbox Game Barの背景録画 / NVIDIA ShadowPlay / AMD ReLive）に録画そのものを任せ、
SDKはそれらが書き出した動画ファイルを検出するだけにしている。

**Unity版との違い**: Unity版には後日、ゲーム自身がリングバッファで直近n秒を保持しmp4として
書き出す `InstantReplayVideoRecorder`（CyberAgent製OSSを利用）を追加したが、Godotには同等の
「標準的なmp4を、プラットフォームネイティブのハードウェアエンコーダー経由で書き出せる、
信頼できるMITライセンスのOSS」が見当たらなかった。近い機能を持つアドオンはGIF出力であり、
Glankの動画パイプライン（`<video>`再生前提）と噛み合わない。そのためGodot版は現時点で
`ReplayFolderWatcher`によるOS依存方式のみを提供する（Unity版が当初持っていた制約と同じ）。
今後、Godot向けの適切なOSSが見つかった場合や、自前でネイティブエンコーダー連携を実装する
場合に追加を検討する。

### 設定手順（Windows / Xbox Game Bar の例）

1. Windowsの設定 > ゲーム > Xbox Game Bar で「プレイ中にバックグラウンドで録画する」を有効にする
2. キャプチャの設定で録画の長さ（直近何秒を保存するか）を指定する
3. `BugReportTrigger` の `replay_watcher.watch_folders` が既定で
   `%USERPROFILE%\Videos\Captures`（Game Barの既定保存先）を見るようになっている
4. ゲーム内でバグが起きたら `Win + Alt + G` を押して直近の録画を保存し、
   続けて `BugReportTrigger` のホットキー（既定 `F12`）を押して報告を送信する

ShadowPlayやReLiveを使う場合は、それぞれの設定画面で確認した保存先フォルダを
`replay_watcher.watch_folders` に追加すればよい。

### macOS / Linux について

- **macOS**: `replay_watcher.watch_folders` の既定値は `~/Movies`（QuickTime Playerで
  画面収録した場合の既定保存先）。OBS等を使う場合はその出力フォルダを追加する。
- **Linux**: OSの機能としての「インスタントリプレイ」に相当するものが無いため、既定値は
  空になっている。OBS Studioの「Replay Buffer」機能などサードパーティのツールを使い、
  その出力フォルダを `replay_watcher.watch_folders` に追加する。

いずれの場合も、`replay_watcher`任せにせず自前の取得方法を使いたい場合は
`get_latest_clip_path` に差し込めば上書きできる。

## セットアップ例

シーンに `BugReportTrigger` をアタッチしたNodeを置き、`config` と `input_log_recorder` を
Inspectorで割り当てるだけで、動画は `replay_watcher` が自動検出するため追加コードは不要。

```gdscript
extends Node

@onready var trigger: BugReportTrigger = $BugReportTrigger

func _ready() -> void:
    # 既定のOSインスタントリプレイ検出ではなく、自前の取得方法を使いたい場合のみ差し込む
    trigger.get_latest_clip_path = func(): return MyReplayBuffer.get_latest_clip_path()
```

`F12` を押すと、`InputLogRecorder` が保持している直近の入力ログと、`replay_watcher`
（または`get_latest_clip_path`）が返す動画ファイルを合わせて `POST /reports` に送信する。

## 送信失敗時のリトライ（GlankOfflineQueue）

ネットワーク断やサーバーの一時停止で送信に失敗した場合、`BugReportTrigger`に
`GlankOfflineQueue`をアサインしておくと、その報告（動画ファイルのコピーを含む）を
`user://glank_queue` 配下に退避し、一定間隔（既定60秒）で自動的に再送する。
ゲームを再起動してもキューは消えない。

- 4xx等「再送しても直らない」失敗（`PERMANENT_FAILURE`）は`user://glank_queue/_failed`に
  移動される（無限に溜まり続けないようにするため）。中身は開発者が後から手動で確認できる。
- ネットワーク断や5xx等「再送すれば直るかもしれない」失敗（`RETRYABLE_FAILURE`）は次回の
  タイマー周期まで温存される。
- `offline_queue.pending_count()` で待機中の件数、`offline_queue.flush_now()` で即座に
  再送を試みられる。

## QA向け入力フォーム（GlankReportPromptUI）

既定の`BugReportTrigger`はホットキーを押した瞬間に仮タイトル（`"(quick report)"`）で
即送信する。QA担当がタイトル・種類・詳細・優先度を入力してから送信したい場合は、
`GlankReportPromptUI`を使う。

**このスクリプトが提供するのはロジックのみ**（Control系ノードの配置はシーン側の作業のため、
テキストファイルであるこのSDKには含められない）。以下の構成でシーンを組み、それぞれの
ノードを`GlankReportPromptUI`のInspectorにアサインする:

```
PanelRoot (Control等。panel_root にアサイン)
├─ TitleField (LineEdit)         → title_field
├─ TagOption (OptionButton。選択肢: crash / visual / softlock の順) → tag_option
├─ DescField (TextEdit)          → desc_field
├─ PriorityOption (OptionButton。選択肢: high / medium / low の順) → priority_option
├─ SubmitButton (Button)         → submit_button
└─ CancelButton (Button)         → cancel_button
```

`trigger`に`BugReportTrigger`をアサインし、`BugReportTrigger`側の`prompt_ui`にこの
`GlankReportPromptUI`をアサインすると、ホットキーで即送信する代わりにこのフォームが開くように
なる。ゲームを一時停止したい場合は、`show_form()`が呼ばれるタイミングをフックして
`get_tree().paused = true`にする等、呼び出し側で行う（SDK側では強制しない）。

## 入力ログからの再現（GlankReplayer）

Webアプリのバグ詳細画面で入力ログを「テキスト」表示に切り替えると、
`JSONをダウンロード`（または`JSONをコピー`）でJSONを取得できる。これを`GlankReplayer`に
読み込ませると、記録時と同じフレームタイミングで`input_pressed`/`input_released`シグナルが
発火する。

`GlankReplayer`は実機の`Input`シングルトンを書き換えられないため、**ゲーム側の入力読み取り
コードを「再生中はGlankReplayerに、それ以外は通常のInputに問い合わせる」形に差し替える**
必要がある。`InputLogRecorder`の`watched_keys`と同じglyph文字列（例: `"←"`, `"A"`）で問い合わせる。

```gdscript
extends Node

func jump_pressed() -> bool:
    var replayer := GlankReplayer.active
    if replayer != null and replayer.is_playing():
        return replayer.get_key_down("A") # InputLogRecorderに登録したglyphと合わせる
    return Input.is_action_just_pressed("jump")
```

イベント駆動で再現したい場合は、`input_pressed`/`input_released`シグナルにゲーム側の
アクション関数を直接connectすればよい。

- `play()` / `pause()` / `stop()` / `seek(frame)` で再生を制御できる。
- `playback_speed` でスロー再生・早送りができる（フレームタイミングは記録時のfps基準で維持される）。
- `load_from_json(json)` / `load_from_file(path)` で実行時に動的にログを読み込むこともできる
  （例: Glank Web APIから取得したJSONをそのまま渡す）。

## 自動検知（クラッシュ/フリーズ）

ホットキーによる手動報告とは別に、**クラッシュ**と**フリーズ**の2種類に限定して自動検知・
自動報告できる。**両方とも既定で無効。** `GlankConfig.auto_detection_enabled` をtrueにしない限り
何もしない（配布ビルドに含める場合、意図せず大量の自動報告が飛ぶのを防ぐため）。

### CrashDetector

GodotのMainLoopが持つ`NOTIFICATION_CRASH`通知（デスクトッププラットフォームでクラッシュ
ハンドラが有効な場合に、エンジンがクラッシュする直前に送られる）を`_notification()`で拾い、
自動で送信する（tag: `crash`）。

**Unity版との重要な違い**: GDScriptには例外処理（try/catch）が無く、Unity版の
`Application.logMessageReceived`のように「スクリプトの例外・エラーログを検知する」ことは
できない。Godot版が拾えるのはOSレベルのネイティブクラッシュのみで、検知から通知までの猶予は
ごく短い（プラットフォームによっては数秒）ため、報告の送信が間に合わないことがある
（best-effort）。

**未検証の注意点**: `NOTIFICATION_CRASH`が通常の`Node`（SceneTree/MainLoop自体ではなく）の
`_notification()`にも届くかどうかは、Godot公式ドキュメントで明確に確認できなかった。
導入後、実際に動作確認することを推奨する。

### FreezeWatchdog

既定10秒（`freeze_threshold_seconds`で変更可能）フレーム更新（`Engine.get_process_frames()`の
進行）が止まっていることを検知したら自動で送信する（tag: `softlock`）。メインスレッドが
詰まっている状況を想定しているため、検知そのものは別スレッド（`Thread`+`Mutex`）で行う。

ただし報告の送信自体はGodotのAPI上メインスレッドでしか安全に行えないため、実際の送信は
「フリーズを検知した後、メインスレッドが応答を再開した最初の`_process()`」で行われる。
メインスレッドが完全にデッドロックして二度と応答しない場合、原理的にどのような実装でも
報告を送信できない点に注意（ソフトウェア側の対処には限界がある）。

### セットアップ

シーンに`CrashDetector`・`FreezeWatchdog`をアタッチしたNodeを置き、それぞれの`config`
（`GlankConfig`）と`trigger`（`BugReportTrigger`）をInspectorでアサインするだけでよい
（コード不要）。`GlankConfig.auto_detection_enabled`をtrueにすると有効になる。

## 入力ログのフレーム番号について

- `InputLogRecorder`は`Engine.get_process_frames()`（絶対フレーム）で押下・離上を検知し、
  内部バッファには絶対フレームで保持する。
- `capture()`呼び出し時に、バッファの先頭フレームを0とした**相対フレーム番号**に変換する
  （`docs/api-spec.md`の`InputLogEntry.frame`と同じ意味）。
- `fps`はプロジェクト側で`InputLogRecorder`に設定した値がそのままAPIに送られる。
  可変フレームレートで動かしている場合、送信するfpsと実際の入力検知タイミングがずれる可能性が
  ある点は注意。

## 未対応・今後の検討事項

- リングバッファでの自前動画録画（Unity版の`InstantReplayVideoRecorder`相当）は、
  Godotに信頼できるOSSが見当たらないため未実装（上記「動画録画について」参照）
- `CrashDetector`の`NOTIFICATION_CRASH`が通常のNodeに届くかは未検証
- `CrashDetector`・`FreezeWatchdog`・`GlankOfflineQueue`・`GlankClient`のmultipart送信を含め、
  このSDK全体が実際のGodotエディタ/エクスポートしたビルドでの動作確認がまだ済んでいない
  （この環境にGodotが無く、C#プロジェクトの場合と同様にコードレビューベースでのみ検証している。
  各APIはGodot公式ドキュメント・実例を調べた上で実装しているが、導入後に実機で確認すること）
- OSのインスタントリプレイ保存ホットキー（Win+Alt+G等）と`BugReportTrigger`のホットキーの
  自動連携は行っていない（2つのキーを別々に押す必要がある。Unity版と同じ制約）
- `GlankReportPromptUI`はロジックのみ提供。実際のUI部品の配置はGodotエディタ側で
  手動で組む必要がある
- `GlankReplayer`はキー入力の再現のみ対応（乱数シードやゲーム内状態までは復元しないため、
  完全に同一の結果を保証するものではない）
- macOS/Linuxでの`ReplayFolderWatcher`の既定値は実機での動作確認がまだ済んでいない
