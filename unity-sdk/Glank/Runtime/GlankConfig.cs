using UnityEngine;

namespace Glank
{
    /// <summary>
    /// Glank APIサーバーへの接続設定。docs/api-spec.md の Base URL / X-Glank-Key に対応する。
    /// </summary>
    [CreateAssetMenu(fileName = "GlankConfig", menuName = "Glank/Config")]
    public class GlankConfig : ScriptableObject
    {
        [Tooltip("例: http://localhost:8787/api/v1 （末尾に /reports は付けない）")]
        public string baseUrl = "http://localhost:8787/api/v1";

        [Tooltip("POST /reports に付与する X-Glank-Key ヘッダー。サーバー側で GLANK_API_KEY が未設定なら空でよい")]
        public string apiKey = "";

        [Tooltip("報告先のGlankプロジェクトID。Web側のプロジェクト画面で確認できる")]
        public int projectId;
    }
}
