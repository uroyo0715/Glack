## バグ報告のトリガーからAPI送信までを繋ぐ実装。
## 動画の録画自体はSDKの範囲外。既定では replay_watcher (GlankReplayFolderWatcher) が
## OSのインスタントリプレイ(Xbox Game Bar / ShadowPlay / ReLive等)の出力フォルダから
## 最新の録画ファイルを探す。別の取得方法を使いたい場合は get_latest_clip_path に
## Callable(String を返す関数)を差し込めば、そちらが優先される。
class_name BugReportTrigger
extends Node

@export var config: GlankConfig
@export var input_log_recorder: InputLogRecorder
@export var report_hotkey: Key = KEY_F12

## 送信に失敗した場合の退避先(任意)。設定しておくと、ネットワーク断やサーバー一時停止などで
## 送信できなかった報告を自動で再送してくれる。未設定なら失敗時は諦めてログを出すだけ。
@export var offline_queue: GlankOfflineQueue

## 設定すると、ホットキーを押した際に仮タイトルで即送信する代わりにこのフォームを開き、
## QA担当がタイトル・種類・詳細・優先度を入力してから送信できるようになる(任意)。
@export var prompt_ui: GlankReportPromptUI

## 直近の録画クリップのファイルパスを返す関数。未設定の場合は replay_watcher を使う。
## 自前のキャプチャ処理を使いたい場合はここに差し込んで上書きできる。
var get_latest_clip_path: Callable

## 入力ログのキャプチャ処理を差し込んで上書きする(未設定なら input_log_recorder を使う)。
var capture_input_log: Callable

var replay_watcher := GlankReplayFolderWatcher.new()

var _http_request: HTTPRequest


func _ready() -> void:
	_http_request = HTTPRequest.new()
	add_child(_http_request)


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if event.physical_keycode != report_hotkey:
		return

	if prompt_ui != null:
		prompt_ui.show_form()
		return

	submit_report(
		"(quick report)",
		["crash"],
		"",
		_default_who(),
		ProjectSettings.get_setting("application/config/version", "0.0.0"),
		OS.get_name(),
		"medium"
	)


static func _default_who() -> String:
	var name := OS.get_environment("USERNAME") # Windows
	if name == "":
		name = OS.get_environment("USER") # macOS/Linux
	return name


func submit_report(
	title: String, tags: Array, desc: String, who: String, build: String, platform: String, priority: String
) -> void:
	if config == null or (input_log_recorder == null and not capture_input_log.is_valid()):
		push_error("[Glank] config / input_log_recorder(またはcapture_input_log)が設定されていません。")
		return

	var snapshot: Dictionary = (
		capture_input_log.call() if capture_input_log.is_valid() else input_log_recorder.capture()
	)
	var metadata := {
		"projectId": config.project_id,
		"title": title,
		"tags": tags,
		"desc": desc,
		"who": who,
		"build": build,
		"platform": platform,
		"priority": priority,
		"fps": snapshot["fps"],
		"durationFrames": snapshot["durationFrames"],
		"inputs": snapshot["inputs"],
	}

	var video_path: String = (
		get_latest_clip_path.call() if get_latest_clip_path.is_valid() else replay_watcher.find_latest_clip()
	)
	if video_path == "":
		push_warning(
			"[Glank] 録画ファイルが見つかりません。OSのインスタントリプレイ機能(Xbox Game Bar等)で" +
			"直近の録画を保存してから再度お試しください。送信を中止しました。"
		)
		return

	GlankClient.submit_report(_http_request, config, metadata, video_path, _make_submit_callback(metadata, video_path))


func _make_submit_callback(metadata: Dictionary, video_path: String) -> Callable:
	return func(outcome, message):
		match outcome:
			GlankClient.SubmitOutcome.SUCCESS:
				print("[Glank] report submitted: ", message)
			GlankClient.SubmitOutcome.RETRYABLE_FAILURE:
				if offline_queue != null:
					# ネットワーク断・サーバー一時停止等。オフラインキューに退避して後で再送する。
					offline_queue.enqueue(metadata, video_path)
				else:
					push_error("[Glank] report submission failed: %s" % message)
			GlankClient.SubmitOutcome.PERMANENT_FAILURE:
				push_error("[Glank] report submission failed: %s" % message)
