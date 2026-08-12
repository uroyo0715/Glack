using System;
using System.Collections.Generic;
using UnityEngine;

namespace Glank
{
    /// <summary>監視対象のキーと、Glank側での表示用ラベル。</summary>
    [Serializable]
    public class WatchedKey
    {
        public KeyCode key;
        public string glyph = "?";
        public string label = "";
    }

    /// <summary>
    /// 直近 bufferSeconds 分の入力を常時リングバッファに保持し、バグ報告トリガー時に
    /// docs/api-spec.md 準拠のフレームベース入力ログとして取り出せるようにする。
    /// レガシー Input クラス（Input.GetKeyDown/GetKeyUp）で検知する。
    /// </summary>
    public class InputLogRecorder : MonoBehaviour
    {
        [SerializeField] private List<WatchedKey> watchedKeys = new List<WatchedKey>();

        [Tooltip("APIに送るfps。入力ログのフレーム番号はこのfpsを基準とみなす。")]
        [SerializeField] private int fps = 60;

        [Tooltip("何秒分の入力履歴を保持するか")]
        [SerializeField] private float bufferSeconds = 10f;

        private class RecordedInput
        {
            public int frame; // Time.frameCount による絶対フレーム
            public string key;
            public string label;
            public int holdFrames;
            public bool released;
        }

        private readonly List<RecordedInput> _buffer = new List<RecordedInput>();
        private readonly Dictionary<KeyCode, RecordedInput> _pressed = new Dictionary<KeyCode, RecordedInput>();

        private int BufferFrames => Mathf.Max(1, Mathf.RoundToInt(fps * bufferSeconds));

        private void Update()
        {
            int frame = Time.frameCount;

            for (int i = 0; i < watchedKeys.Count; i++)
            {
                var wk = watchedKeys[i];
                if (Input.GetKeyDown(wk.key))
                {
                    var entry = new RecordedInput
                    {
                        frame = frame,
                        key = wk.glyph,
                        label = wk.label,
                        holdFrames = 0,
                        released = false,
                    };
                    _buffer.Add(entry);
                    _pressed[wk.key] = entry;
                }
                else if (Input.GetKeyUp(wk.key) && _pressed.TryGetValue(wk.key, out var pressedEntry))
                {
                    pressedEntry.holdFrames = frame - pressedEntry.frame;
                    pressedEntry.released = true;
                    _pressed.Remove(wk.key);
                }
            }

            int windowStart = frame - BufferFrames + 1;
            _buffer.RemoveAll(e => e.frame < windowStart);
        }

        /// <summary>
        /// 現時点までの入力ログを、クリップ先頭を0とした相対フレーム番号に変換して返す。
        /// 押しっぱなしで未リリースのキーは、現在フレームまでの holdFrames を都度計算する。
        /// </summary>
        public InputLogSnapshot Capture()
        {
            int currentFrame = Time.frameCount;
            int windowStart = Mathf.Max(0, currentFrame - BufferFrames + 1);

            var inputs = new InputLogEntryDto[_buffer.Count];
            for (int i = 0; i < _buffer.Count; i++)
            {
                var e = _buffer[i];
                int holdFrames = e.released ? e.holdFrames : currentFrame - e.frame;
                inputs[i] = new InputLogEntryDto
                {
                    frame = e.frame - windowStart,
                    key = e.key,
                    label = e.label,
                    holdFrames = holdFrames,
                };
            }

            return new InputLogSnapshot
            {
                fps = fps,
                durationFrames = currentFrame - windowStart + 1,
                inputs = inputs,
            };
        }
    }
}
