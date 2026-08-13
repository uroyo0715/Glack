## Glank APIサーバーへの接続設定。docs/api-spec.md の Base URL / X-Glank-Key に対応する。
## Godotエディタで新規リソースとして作成し(FileSystemを右クリック > New Resource > GlankConfig)、
## .tres として保存して各ノードのInspectorに割り当てる。
class_name GlankConfig
extends Resource

## 例: http://localhost:8787/api/v1 （末尾に /reports は付けない）
@export var base_url: String = "http://localhost:8787/api/v1"

## POST /reports に付与するX-Glank-Keyヘッダー。サーバー側でGLANK_API_KEYが未設定なら空でよい
@export var api_key: String = ""

## 報告先のGlankプロジェクトID。Web側のプロジェクト一覧画面でカードに表示されている番号
@export var project_id: int = 0

## クラッシュ・フリーズの自動検知/自動報告を有効にする。既定false。
## 配布ビルドに含める場合、意図せず大量の自動報告が飛ぶのを防ぐため既定で無効にしている。
@export var auto_detection_enabled: bool = false
