using System;

namespace Glank
{
    /// <summary>
    /// docs/api-spec.md 3.4 `POST /reports` の multipart フィールド `metadata` に載せるJSONの形。
    /// JsonUtility.ToJson(this) でそのままシリアライズできる。
    /// </summary>
    [Serializable]
    public class ReportMetadata
    {
        public int projectId;
        public string title;
        public string[] tags; // 例: {"crash"} または {"crash", "visual"}（1件の報告に複数の種類を付けられる）
        public string desc;
        public string who;
        public string build;
        public string platform;
        public string priority; // "high" | "medium" | "low"（省略/空文字はサーバー側で"medium"扱い）
        public int fps;
        public int durationFrames;
        public InputLogEntryDto[] inputs;
    }
}
