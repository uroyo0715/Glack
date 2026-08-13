## メインスレッドが一定時間(既定10秒、freeze_threshold_secondsで変更可能)フレーム更新
## (Engine.get_process_frames()の進行)を止めていることを検知し、自動でバグ報告を送信する
## (tagは自動的に"softlock")。メインスレッド自体が詰まっている状況を想定しているため、
## 検知そのものは別スレッド(Thread)で行う(メインスレッドの_process()では、メインスレッドが
## 本当に固まった場合はその検知処理自体も止まってしまうため使えない)。
##
## ただし報告の送信(HTTPRequest等)はGodotのAPI上メインスレッドでしか安全に行えないため、
## 実際の送信は「別スレッドがフリーズを検知した後、メインスレッドが応答を再開した最初の
## _process()」で行われる。メインスレッドが完全にデッドロックして二度と応答しない場合、
## 原理的にどのような実装であっても報告を送信できない点に注意(ソフトウェア側の対処には
## 限界がある)。
##
## GlankConfig.auto_detection_enabledがfalseの間は何もしない(既定OFF)。
class_name FreezeWatchdog
extends Node

@export var config: GlankConfig
@export var trigger: BugReportTrigger

## この秒数フレームが進まなかったらフリーズとみなす
@export var freeze_threshold_seconds: float = 10.0

## 監視スレッドがフレーム更新をチェックする間隔(秒)
@export var poll_interval_seconds: float = 1.0

## フリーズ検知後、次のフリーズを検知できるようになるまでの最短間隔(秒)。
## 断続的なフリーズが続く場合に自動報告が乱発するのを防ぐ。
@export var cooldown_seconds: float = 60.0

var _mutex := Mutex.new()
var _thread: Thread
var _running := false
var _last_seen_frame: int = 0
var _last_seen_msec: int = 0
var _pending_submit := false
var _last_detected_msec: int = -2000000000


func _ready() -> void:
	_last_seen_frame = Engine.get_process_frames()
	_last_seen_msec = Time.get_ticks_msec()
	_running = true
	_thread = Thread.new()
	_thread.start(_watch_loop)


func _exit_tree() -> void:
	_running = false
	if _thread != null and _thread.is_started():
		_thread.wait_to_finish()


func _process(_delta: float) -> void:
	var should_submit := false
	_mutex.lock()
	var frame := Engine.get_process_frames()
	if frame != _last_seen_frame:
		_last_seen_frame = frame
		_last_seen_msec = Time.get_ticks_msec()
	if _pending_submit:
		_pending_submit = false
		should_submit = true
	_mutex.unlock()

	if should_submit:
		_submit_freeze_report()


func _watch_loop() -> void:
	while _running:
		OS.delay_msec(int(poll_interval_seconds * 1000.0))
		if config == null or not config.auto_detection_enabled:
			continue

		_mutex.lock()
		var now := Time.get_ticks_msec()
		var stuck_msec := now - _last_seen_msec
		var since_last_detected := now - _last_detected_msec
		if (
			stuck_msec >= int(freeze_threshold_seconds * 1000.0)
			and since_last_detected >= int(cooldown_seconds * 1000.0)
			and not _pending_submit
		):
			_pending_submit = true
			_last_detected_msec = now
		_mutex.unlock()


func _submit_freeze_report() -> void:
	if config == null or not config.auto_detection_enabled or trigger == null:
		return

	var who := OS.get_environment("USERNAME")
	if who == "":
		who = OS.get_environment("USER")

	trigger.submit_report(
		"[自動検知] フリーズ",
		["softlock"],
		"メインスレッドが約%d秒以上応答していませんでした。" % int(freeze_threshold_seconds),
		who,
		ProjectSettings.get_setting("application/config/version", "0.0.0"),
		OS.get_name(),
		"high"
	)
