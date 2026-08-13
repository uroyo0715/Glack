## 既定のBugReportTriggerはホットキーを押した瞬間に仮タイトルで即送信する。QA担当が
## タイトル・種類・詳細・優先度を入力してから送信したい場合に使う。
##
## このスクリプトが提供するのはロジックのみ(Canvas上のUI部品の配置はシーン側の作業)。
## Control系ノードを組んで、それぞれをこのノードのInspectorにアサインする。
class_name GlankReportPromptUI
extends Node

@export var trigger: BugReportTrigger
@export var panel_root: Control
@export var title_field: LineEdit
@export var tag_option: OptionButton ## 選択肢: crash / visual / softlock の順を想定
@export var desc_field: TextEdit
@export var priority_option: OptionButton ## 選択肢: high / medium / low の順を想定
@export var submit_button: Button
@export var cancel_button: Button

const _TAGS := ["crash", "visual", "softlock"]
const _PRIORITIES := ["high", "medium", "low"]


func _ready() -> void:
	panel_root.visible = false
	submit_button.pressed.connect(_on_submit_pressed)
	cancel_button.pressed.connect(hide_form)


func show_form() -> void:
	panel_root.visible = true
	title_field.text = ""
	desc_field.text = ""
	title_field.grab_focus()
	# ゲームを一時停止したい場合は、ここをフックしてget_tree().paused = trueにする等、
	# 呼び出し側で行う(SDK側では強制しない)。


func hide_form() -> void:
	panel_root.visible = false


func _on_submit_pressed() -> void:
	var title := title_field.text.strip_edges()
	if title == "":
		return

	var tag: String = _TAGS[tag_option.selected] if tag_option.selected >= 0 else _TAGS[0]
	var priority: String = _PRIORITIES[priority_option.selected] if priority_option.selected >= 0 else _PRIORITIES[1]

	hide_form()

	var who := OS.get_environment("USERNAME")
	if who == "":
		who = OS.get_environment("USER")

	trigger.submit_report(
		title,
		[tag],
		desc_field.text,
		who,
		ProjectSettings.get_setting("application/config/version", "0.0.0"),
		OS.get_name(),
		priority
	)
