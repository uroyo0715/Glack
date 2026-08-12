#if ENABLE_INPUT_SYSTEM
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Glank
{
    /// <summary>監視対象のキーと、Glank側での表示用ラベル（新Input System版）。</summary>
    [Serializable]
    public class WatchedKeyNewInputSystem
    {
        public Key key;
        public string glyph = "?";
        public string label = "";
    }

    /// <summary>
    /// <see cref="InputLogRecorder"/> の新Input System（com.unity.inputsystem）版。
    /// レガシー Input クラスの代わりに <see cref="Keyboard.current"/> を使う点以外は同じ挙動。
    ///
    /// このファイルは丸ごと `#if ENABLE_INPUT_SYSTEM` で囲ってあるため、Input Systemパッケージを
    /// 導入していないプロジェクトでは単純に何もコンパイルされない（エラーにならない）。
    /// 新Input Systemを使うプロジェクトでは、InputLogRecorderの代わりにこちらをアタッチする。
    /// </summary>
    public class InputLogRecorderNewInputSystem : MonoBehaviour
    {
        [SerializeField] private List<WatchedKeyNewInputSystem> watchedKeys = new List<WatchedKeyNewInputSystem>();

        [Tooltip("APIに送るfps。入力ログのフレーム番号はこのfpsを基準とみなす。")]
        [SerializeField] private int fps = 60;

        [Tooltip("何秒分の入力履歴を保持するか")]
        [SerializeField] private float bufferSeconds = 10f;

        private class RecordedInput
        {
            public int frame;
            public string key;
            public string label;
            public int holdFrames;
            public bool released;
        }

        private readonly List<RecordedInput> _buffer = new List<RecordedInput>();
        private readonly Dictionary<Key, RecordedInput> _pressed = new Dictionary<Key, RecordedInput>();

        private int BufferFrames => Mathf.Max(1, Mathf.RoundToInt(fps * bufferSeconds));

        private void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            int frame = Time.frameCount;

            for (int i = 0; i < watchedKeys.Count; i++)
            {
                var wk = watchedKeys[i];
                var control = keyboard[wk.key];

                if (control.wasPressedThisFrame)
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
                else if (control.wasReleasedThisFrame && _pressed.TryGetValue(wk.key, out var pressedEntry))
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
#endif
