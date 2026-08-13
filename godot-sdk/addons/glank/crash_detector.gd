## OSネイティブのクラッシュを検知したら自動でバグ報告を送信する(tagは自動的に"crash")。
## GodotのNOTIFICATION_CRASH通知(デスクトッププラットフォームでクラッシュハンドラが
## 有効な場合に、エンジンがクラッシュする直前に送られる)を使う。
##
## 重要な制約(Unity版との違い): GDScriptには例外処理(try/catch)が無く、Unity版のように
## 「スクリプトの例外・エラーログを検知する」ことはできない。ここで拾えるのはOSレベルの
## ネイティブクラッシュのみ。また通知からプロセス終了までの猶予はごく短い
## (プラットフォームによっては数秒)ため、報告の送信は間に合わないことがある(best-effort)。
##
## 未検証の注意点: NOTIFICATION_CRASHが通常のNode(SceneTree/MainLoop自体ではなく)の
## _notification()にも届くかどうかは、Godot公式ドキュメントで明確に確認できなかった。
## 導入後、実際に(意図的にクラッシュを起こすなどして)動作確認することを推奨する。
##
## GlankConfig.auto_detection_enabledがfalseの間は何もしない(既定OFF)。
class_name CrashDetector
extends Node

@export var config: GlankConfig
@export var trigger: BugReportTrigger


func _notification(what: int) -> void:
	if what != NOTIFICATION_CRASH:
		return
	if config == null or not config.auto_detection_enabled or trigger == null:
		return

	var who := OS.get_environment("USERNAME")
	if who == "":
		who = OS.get_environment("USER")

	trigger.submit_report(
		"[自動検知] クラッシュ",
		["crash"],
		"NOTIFICATION_CRASHを検知しました。",
		who,
		ProjectSettings.get_setting("application/config/version", "0.0.0"),
		OS.get_name(),
		"high"
	)
