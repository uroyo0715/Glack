@tool
extends EditorPlugin

# このSDKはランタイム専用(エディタ拡張機能は無い)。class_name付きスクリプトは
# アドオンを有効化しなくてもプロジェクト全体から使えるが、Godotの慣習に合わせて
# 通常のアドオンとして配布・有効化できるよう最小限のEditorPluginを用意している。


func _enter_tree() -> void:
	pass


func _exit_tree() -> void:
	pass
