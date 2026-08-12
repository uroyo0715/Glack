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
        public string tag; // "crash" | "visual" | "softlock"
        public string desc;
        public string who;
        public string build;
        public string platform;
        public string frequency; // "rare" | "sometimes" | "often" | "always" | "unknown"（省略/空文字はサーバー側で"unknown"扱い）
        public int fps;
        public int durationFrames;
        public InputLogEntryDto[] inputs;
    }
}
