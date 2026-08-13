## docs/api-spec.md 3.4 `POST /reports` への送信。
## GodotのHTTPRequestにはmultipart/form-dataの組み立てヘルパーが無いため、手動でboundaryを
## 挟んだPackedByteArrayを組み立ててrequest_raw()で送る。
class_name GlankClient
extends RefCounted

enum SubmitOutcome {
	SUCCESS, ## 送信成功
	RETRYABLE_FAILURE, ## ネットワーク断・タイムアウト・サーバー側の一時的な問題(5xx等)。後で再送すれば成功しうる
	PERMANENT_FAILURE, ## 不正なリクエスト(4xx)や動画ファイルの読み込み失敗等。再送しても直らない
}

const _BOUNDARY := "GlankFormBoundary7d1f2c3a9e"


## http_requestには呼び出し側のシーンに置いた(add_childした)HTTPRequestノードを渡す。
## 完了すると (outcome: SubmitOutcome, message: String) を引数にcallbackを呼ぶ。
static func submit_report(
	http_request: HTTPRequest,
	config: GlankConfig,
	metadata: Dictionary,
	video_path: String,
	callback: Callable
) -> void:
	if not FileAccess.file_exists(video_path):
		callback.call(SubmitOutcome.PERMANENT_FAILURE, "video read failed: file not found: %s" % video_path)
		return

	var video_bytes := FileAccess.get_file_as_bytes(video_path)
	var body := _build_multipart_body(metadata, video_path, video_bytes)

	var headers := PackedStringArray([
		"Content-Type: multipart/form-data; boundary=%s" % _BOUNDARY,
	])
	if config.api_key != "":
		headers.append("X-Glank-Key: %s" % config.api_key)

	var err := http_request.request_raw(
		"%s/reports" % config.base_url, headers, HTTPClient.METHOD_POST, body
	)
	if err != OK:
		callback.call(SubmitOutcome.RETRYABLE_FAILURE, "request_raw failed with error %d" % err)
		return

	# request_rawが正常に開始できた場合のみ接続する(失敗時に接続したままにしておくと、
	# 二度と発火しないシグナルが残り続けてしまうため)。CONNECT_ONE_SHOTで1回限りにし、
	# 発火後は自動的に切断される。
	http_request.request_completed.connect(
		_on_request_completed.bind(callback), CONNECT_ONE_SHOT
	)


static func _build_multipart_body(
	metadata: Dictionary, video_path: String, video_bytes: PackedByteArray
) -> PackedByteArray:
	var body := PackedByteArray()
	body.append_array(("--%s\r\n" % _BOUNDARY).to_utf8_buffer())
	body.append_array("Content-Disposition: form-data; name=\"metadata\"\r\n".to_utf8_buffer())
	body.append_array("Content-Type: application/json\r\n\r\n".to_utf8_buffer())
	body.append_array(JSON.stringify(metadata).to_utf8_buffer())
	body.append_array(("\r\n--%s\r\n" % _BOUNDARY).to_utf8_buffer())
	body.append_array((
		"Content-Disposition: form-data; name=\"video\"; filename=\"%s\"\r\n" % video_path.get_file()
	).to_utf8_buffer())
	body.append_array("Content-Type: video/mp4\r\n\r\n".to_utf8_buffer())
	body.append_array(video_bytes)
	body.append_array(("\r\n--%s--\r\n" % _BOUNDARY).to_utf8_buffer())
	return body


static func _on_request_completed(
	result: int, response_code: int, _headers: PackedStringArray, body_bytes: PackedByteArray, callback: Callable
) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300:
		callback.call(SubmitOutcome.SUCCESS, body_bytes.get_string_from_utf8())
		return

	var message := "%d %s" % [response_code, body_bytes.get_string_from_utf8()]
	# ConnectionError相当(サーバーに届いていない)や5xx(サーバー側の一時的な問題)は再送で直る
	# 可能性がある。4xx(レスポンスは返ってきているがリクエスト自体が悪い)は再送しても
	# また同じ理由で失敗するだけ。
	var is_retryable := result != HTTPRequest.RESULT_SUCCESS or response_code == 0 or response_code >= 500
	callback.call(
		SubmitOutcome.RETRYABLE_FAILURE if is_retryable else SubmitOutcome.PERMANENT_FAILURE,
		message
	)
