## ゲーム自体では録画を行わず、OSのインスタントリプレイ機能
## (Xbox Game Barの背景録画 / NVIDIA ShadowPlay / AMD ReLive など)が
## 書き出した動画ファイルを検出して使う。実行時コストはフォルダの列挙のみで、
## 常時録画バッファをゲーム側で保持する方式とは異なり無視できるレベル。
class_name GlankReplayFolderWatcher
extends RefCounted

## 録画ファイルの保存先候補(存在するものだけを検索する)
var watch_folders: PackedStringArray = _default_watch_folders()

## 検索対象とする拡張子
var extensions: PackedStringArray = [".mp4", ".mkv", ".avi", ".webm", ".mov"]

## この秒数より古い(=別の機会に録った)ファイルは無視する
var max_age_seconds: float = 300.0


static func _default_watch_folders() -> PackedStringArray:
	match OS.get_name():
		"Windows":
			var userprofile := OS.get_environment("USERPROFILE")
			if userprofile == "":
				return PackedStringArray()
			return PackedStringArray([userprofile.path_join("Videos/Captures")])
		"macOS":
			var home := OS.get_environment("HOME")
			if home == "":
				return PackedStringArray()
			return PackedStringArray([home.path_join("Movies")])
		_:
			# Linuxには「OSの機能としてのインスタントリプレイ」に相当する共通の既定保存先が無い
			# (OBS StudioのReplay Buffer等、サードパーティのツール任せになる)ため空にしておく。
			# 利用側でそのツールの出力フォルダをwatch_foldersに追加する。
			return PackedStringArray()


## 監視フォルダの中で最終更新日時が最も新しい動画ファイルのパスを返す。見つからなければ空文字。
func find_latest_clip() -> String:
	var latest_path := ""
	var latest_time := 0

	for folder in watch_folders:
		if not DirAccess.dir_exists_absolute(folder):
			continue
		var dir := DirAccess.open(folder)
		if dir == null:
			continue

		dir.list_dir_begin()
		var file_name := dir.get_next()
		while file_name != "":
			if not dir.current_is_dir():
				var ext := "." + file_name.get_extension().to_lower()
				if extensions.has(ext):
					var full_path := folder.path_join(file_name)
					var mtime := FileAccess.get_modified_time(full_path)
					if mtime > latest_time:
						latest_time = mtime
						latest_path = full_path
			file_name = dir.get_next()
		dir.list_dir_end()

	if latest_path == "":
		return ""

	if Time.get_unix_time_from_system() - latest_time > max_age_seconds:
		push_warning(
			"[Glank] 最新の録画ファイルが古すぎます。OSのインスタントリプレイ機能で" +
			"新しく保存してから再度お試しください。"
		)
		return ""

	return latest_path
