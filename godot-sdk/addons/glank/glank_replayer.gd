## Webアプリのバグ詳細画面「JSONをダウンロード」で書き出した入力ログ
## (InputLogRecorder.capture()互換のJSON)を読み込み、記録時と同じタイミングで再生する。
##
## このSDKは実機の入力(Godotの Input シングルトン)を書き換えられないため、ゲーム側の
## 入力読み取りコードを「再生中はGlankReplayerに、それ以外は通常のInputに問い合わせる」
## 形に差し替えて使う想定。get_key_down/get_key/get_key_up はGlankWatchedKeyのglyph単位で
## Input.is_action_just_pressed等と同じ意味の値を返す。
class_name GlankReplayer
extends Node

signal input_pressed(glyph: String, label: String)
signal input_released(glyph: String)
signal replay_finished

@export var playback_speed: float = 1.0

## シーン中で最後にplay()を呼んだGlankReplayer。ゲーム側の入力コードから
## GlankReplayer.active 経由で問い合わせられるようにするための簡易参照。
static var active: GlankReplayer = null

var _snapshot: Dictionary = {}
var _playback_time: float = 0.0
var _playing: bool = false

# 各要素は _snapshot.inputs のインデックス(int)をキーに使う
var _fired_press: Dictionary = {}
var _fired_release: Dictionary = {}
var _held_glyphs: Dictionary = {}
var _pressed_this_frame: Dictionary = {}
var _released_this_frame: Dictionary = {}


func is_loaded() -> bool:
	return not _snapshot.is_empty()


func is_playing() -> bool:
	return _playing


func duration_frames() -> int:
	return _snapshot.get("durationFrames", 0)


func current_frame() -> int:
	if _snapshot.is_empty():
		return 0
	var fps: float = _snapshot.get("fps", 60)
	return floori(_playback_time * fps)


func _exit_tree() -> void:
	if active == self:
		active = null


## Webアプリの「JSONをダウンロード」/「JSONをコピー」で得られるJSON文字列を読み込む。
func load_from_json(json_text: String) -> void:
	_snapshot = JSON.parse_string(json_text)
	if _snapshot == null:
		_snapshot = {}
	_reset_playback_state()


## ダウンロードしたJSONファイルをres://やuser://のパスから読み込む。
func load_from_file(path: String) -> bool:
	if not FileAccess.file_exists(path):
		push_warning("[Glank] GlankReplayer: 入力ログの読み込みに失敗しました: %s が見つかりません" % path)
		return false
	var f := FileAccess.open(path, FileAccess.READ)
	load_from_json(f.get_as_text())
	f.close()
	return true


func play() -> void:
	if _snapshot.is_empty():
		push_warning("[Glank] GlankReplayer: ログが読み込まれていません。load_from_json()を先に呼んでください。")
		return
	active = self
	_playing = true
	set_process(true)


func pause() -> void:
	_playing = false


func stop() -> void:
	_playing = false
	seek(0)


## 指定フレームまで巻き戻し/早送りする。押下/離上イベントは再発火しない(保持状態のみ復元する)。
func seek(frame: int) -> void:
	if _snapshot.is_empty():
		return
	var fps: float = _snapshot.get("fps", 60)
	_playback_time = float(frame) / fps if fps > 0 else 0.0
	_fired_press.clear()
	_fired_release.clear()
	_held_glyphs.clear()
	_pressed_this_frame.clear()
	_released_this_frame.clear()

	var inputs: Array = _snapshot.get("inputs", [])
	for i in inputs.size():
		var entry: Dictionary = inputs[i]
		if entry["frame"] > frame:
			continue
		_fired_press[i] = true
		var release_frame: int = entry["frame"] + maxi(entry.get("holdFrames", 0), 0)
		if release_frame <= frame:
			_fired_release[i] = true
		else:
			_held_glyphs[entry["key"]] = true


func _reset_playback_state() -> void:
	_playback_time = 0.0
	_fired_press.clear()
	_fired_release.clear()
	_held_glyphs.clear()
	_pressed_this_frame.clear()
	_released_this_frame.clear()


func _process(delta: float) -> void:
	_pressed_this_frame.clear()
	_released_this_frame.clear()

	if not _playing or _snapshot.is_empty():
		return

	_playback_time += delta * playback_speed
	var frame := current_frame()
	var inputs: Array = _snapshot.get("inputs", [])

	for i in inputs.size():
		var entry: Dictionary = inputs[i]
		if not _fired_press.has(i) and frame >= entry["frame"]:
			_fired_press[i] = true
			_pressed_this_frame[entry["key"]] = true
			_held_glyphs[entry["key"]] = true
			input_pressed.emit(entry["key"], entry.get("label", ""))

		var release_frame: int = entry["frame"] + maxi(entry.get("holdFrames", 0), 0)
		if _fired_press.has(i) and not _fired_release.has(i) and frame >= release_frame:
			_fired_release[i] = true
			_released_this_frame[entry["key"]] = true
			_held_glyphs.erase(entry["key"])
			input_released.emit(entry["key"])

	if _playing and frame >= duration_frames():
		_playing = false
		replay_finished.emit()


## 今フレームでglyphが押された瞬間か(Input.is_action_just_pressed相当)。
func get_key_down(glyph: String) -> bool:
	return _pressed_this_frame.has(glyph)


## glyphが押されたままか(Input.is_action_pressed相当)。
func get_key(glyph: String) -> bool:
	return _held_glyphs.has(glyph)


## 今フレームでglyphが離された瞬間か(Input.is_action_just_released相当)。
func get_key_up(glyph: String) -> bool:
	return _released_this_frame.has(glyph)
