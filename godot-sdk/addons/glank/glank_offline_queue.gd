## 送信に失敗した報告(ネットワーク断・サーバー一時停止等、再送すれば直る可能性があるもの)を
## ディスクに退避しておき、一定間隔で再送を試みる。ゲームを再起動しても消えない
## (user://配下に保存するため)。
##
## 動画ファイルは元の場所(OSのインスタントリプレイ出力フォルダ等)からこのキュー用フォルダへ
## コピーする。元ファイルはOS側の設定で古い録画から自動的に消されることがあるため、
## キューに積んだ時点でコピーしておかないと、再送しようとした時にはファイルが無い、
## という事態になりかねないため。
class_name GlankOfflineQueue
extends Node

@export var config: GlankConfig

## 再送を試みる間隔(秒)
@export var retry_interval_seconds: float = 60.0

const _QUEUE_DIR := "user://glank_queue"
const _FAILED_DIR := "user://glank_queue/_failed"

var _flushing := false
var _http_request: HTTPRequest
var _timer: Timer


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(_QUEUE_DIR)
	DirAccess.make_dir_recursive_absolute(_FAILED_DIR)

	_http_request = HTTPRequest.new()
	add_child(_http_request)

	_timer = Timer.new()
	_timer.wait_time = retry_interval_seconds
	_timer.timeout.connect(flush_now)
	add_child(_timer)
	_timer.start()


## 現在キューに積まれている(再送待ちの)件数。
func pending_count() -> int:
	var dir := DirAccess.open(_QUEUE_DIR)
	if dir == null:
		return 0
	var count := 0
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if dir.current_is_dir() and name != "." and name != ".." and name != "_failed":
			count += 1
		name = dir.get_next()
	dir.list_dir_end()
	return count


func enqueue(metadata: Dictionary, video_path: String) -> void:
	var entry_dir := _QUEUE_DIR.path_join(str(Time.get_ticks_usec()))
	DirAccess.make_dir_recursive_absolute(entry_dir)

	var copied_video_path := entry_dir.path_join(video_path.get_file())
	DirAccess.copy_absolute(video_path, copied_video_path)

	var meta_with_video := metadata.duplicate()
	meta_with_video["_glankVideoFileName"] = video_path.get_file()
	var f := FileAccess.open(entry_dir.path_join("metadata.json"), FileAccess.WRITE)
	f.store_string(JSON.stringify(meta_with_video))
	f.close()


## 即座に再送を試みる。
func flush_now() -> void:
	if _flushing:
		return
	_flushing = true
	_flush_next()


func _next_entry_name() -> String:
	var dir := DirAccess.open(_QUEUE_DIR)
	if dir == null:
		return ""
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if dir.current_is_dir() and name != "." and name != ".." and name != "_failed":
			dir.list_dir_end()
			return name
		name = dir.get_next()
	dir.list_dir_end()
	return ""


func _flush_next() -> void:
	var entry_name := _next_entry_name()
	if entry_name == "":
		_flushing = false
		return

	var entry_dir := _QUEUE_DIR.path_join(entry_name)
	var meta_path := entry_dir.path_join("metadata.json")
	if not FileAccess.file_exists(meta_path):
		_remove_dir_recursive(entry_dir)
		_flush_next()
		return

	var f := FileAccess.open(meta_path, FileAccess.READ)
	var metadata: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()

	var video_file_name: String = metadata.get("_glankVideoFileName", "")
	metadata.erase("_glankVideoFileName")
	var video_path := entry_dir.path_join(video_file_name)

	GlankClient.submit_report(_http_request, config, metadata, video_path, func(outcome, message):
		match outcome:
			GlankClient.SubmitOutcome.SUCCESS:
				_remove_dir_recursive(entry_dir)
				_flush_next()
			GlankClient.SubmitOutcome.PERMANENT_FAILURE:
				push_error("[Glank] queued report permanently failed, moving to _failed: %s" % message)
				var failed_dir := _FAILED_DIR.path_join(entry_name)
				DirAccess.rename_absolute(entry_dir, failed_dir)
				_flush_next()
			GlankClient.SubmitOutcome.RETRYABLE_FAILURE:
				# まだ直っていない可能性が高いので、この周期はここで打ち切り次回のタイマーに回す。
				_flushing = false
	)


func _remove_dir_recursive(path: String) -> void:
	var dir := DirAccess.open(path)
	if dir == null:
		return
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if name != "." and name != "..":
			var full := path.path_join(name)
			if dir.current_is_dir():
				_remove_dir_recursive(full)
			else:
				DirAccess.remove_absolute(full)
		name = dir.get_next()
	dir.list_dir_end()
	DirAccess.remove_absolute(path)
