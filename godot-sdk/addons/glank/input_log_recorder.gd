## 直近buffer_seconds秒分の入力を常時リングバッファで保持し続け、バグ報告トリガー時に
## docs/api-spec.md 準拠のフレームベース入力ログとして取り出せるようにする。
## Godot標準の_input()コールバック(InputEventKey)でキー押下/離上を検知する。
class_name InputLogRecorder
extends Node

@export var watched_keys: Array[GlankWatchedKey] = []

## APIに送るfps。入力ログのフレーム番号はこのfpsを基準とみなす。
@export var fps: int = 60

## 何秒分の入力履歴を保持するか
@export var buffer_seconds: float = 10.0

# { frame: int, key: String, label: String, hold_frames: int, released: bool } の配列
var _buffer: Array = []
# Key(int) -> 上記と同じ形のDictionary(参照を保持し続け、離上時にhold_frames/releasedを更新する)
var _pressed: Dictionary = {}


func _buffer_frames() -> int:
	return maxi(1, roundi(fps * buffer_seconds))


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey) or event.echo:
		return

	var frame := Engine.get_process_frames()
	for wk in watched_keys:
		if wk.key != event.physical_keycode:
			continue
		if event.pressed:
			var entry := {
				"frame": frame,
				"key": wk.glyph,
				"label": wk.label,
				"hold_frames": 0,
				"released": false,
			}
			_buffer.append(entry)
			_pressed[wk.key] = entry
		elif _pressed.has(wk.key):
			var pressed_entry: Dictionary = _pressed[wk.key]
			pressed_entry["hold_frames"] = frame - pressed_entry["frame"]
			pressed_entry["released"] = true
			_pressed.erase(wk.key)

	var window_start := frame - _buffer_frames() + 1
	_buffer = _buffer.filter(func(e): return e["frame"] >= window_start)


## 現時点までの入力ログを、クリップ先頭を0とした相対フレーム番号に変換して返す。
## 押しっぱなしで未リリースのキーは、現在フレームまでのhold_framesを都度計算する。
func capture() -> Dictionary:
	var current_frame := Engine.get_process_frames()
	var window_start := maxi(0, current_frame - _buffer_frames() + 1)

	var inputs := []
	for e in _buffer:
		var hold_frames: int = e["hold_frames"] if e["released"] else current_frame - e["frame"]
		inputs.append({
			"frame": e["frame"] - window_start,
			"key": e["key"],
			"label": e["label"],
			"holdFrames": hold_frames,
		})

	return {
		"fps": fps,
		"durationFrames": current_frame - window_start + 1,
		"inputs": inputs,
	}
