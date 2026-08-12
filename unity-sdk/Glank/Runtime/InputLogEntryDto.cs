using System;

namespace Glank
{
    /// <summary>
    /// docs/api-spec.md の InputLogEntry と同じ形。JsonUtility でシリアライズするため public フィールドで持つ。
    /// </summary>
    [Serializable]
    public class InputLogEntryDto
    {
        /// <summary>クリップ先頭を0とした相対フレーム番号</summary>
        public int frame;

        /// <summary>ボタン表記。例: "←", "A"</summary>
        public string key;

        /// <summary>表示用の説明</summary>
        public string label;

        /// <summary>
        /// ボタンを保持していたフレーム数。押した瞬間のみの入力（トグル操作など）は0のままでよい。
        /// JsonUtility はフィールド省略ができないため、API仕様上は任意項目だが常に出力される。
        /// </summary>
        public int holdFrames;
    }
}
