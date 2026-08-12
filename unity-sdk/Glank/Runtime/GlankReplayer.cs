using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Events;

namespace Glank
{
    [Serializable]
    public class GlankInputPressedEvent : UnityEvent<string, string> { } // (glyph, label)

    [Serializable]
    public class GlankInputGlyphEvent : UnityEvent<string> { } // (glyph)

    /// <summary>
    /// Webアプリのバグレポート詳細画面「JSONをダウンロード」で書き出した入力ログ
    /// （InputLogSnapshot互換JSON）を読み込み、記録時と同じタイミングで再生する。
    ///
    /// このSDKは実機の入力（UnityEngine.Input）を書き換えられないため、ゲーム側の
    /// 入力読み取りコードを「再生中はGlankReplayerに、それ以外は通常のInputに問い合わせる」
    /// 形に差し替えて使う想定。GetKeyDown/GetKey/GetKeyUp はUnityEngine.Inputの同名メソッドと
    /// 同じ意味（今フレームで押した/押されている/離した）をglyph単位で返す。
    /// </summary>
    public class GlankReplayer : MonoBehaviour
    {
        [Tooltip("再生開始時に自動的に読み込むJSONファイル（任意）。TextAssetをアサインする。")]
        [SerializeField] private TextAsset logFile;

        [Tooltip("読み込み後、自動的に再生を開始する")]
        [SerializeField] private bool playOnLoad = true;

        [Tooltip("再生速度の倍率（1 = 記録時と同じ速さ）")]
        [SerializeField] private float playbackSpeed = 1f;

        [Tooltip("押下/離上のたびに呼ばれる。glyphとlabelを引数にゲーム側のアクションを呼び出す用途。")]
        public GlankInputPressedEvent onInputPressed = new GlankInputPressedEvent();
        public GlankInputGlyphEvent onInputReleased = new GlankInputGlyphEvent();
        public UnityEvent onReplayFinished = new UnityEvent();

        /// <summary>シーン中で最後にPlay()を呼んだGlankReplayer。ゲーム側の入力コードから
        /// `GlankReplayer.Active` 経由で問い合わせられるようにするための簡易参照。</summary>
        public static GlankReplayer Active { get; private set; }

        private InputLogSnapshot _snapshot;
        private float _playbackTime;
        private bool _playing;

        private readonly HashSet<InputLogEntryDto> _firedPress = new HashSet<InputLogEntryDto>();
        private readonly HashSet<InputLogEntryDto> _firedRelease = new HashSet<InputLogEntryDto>();
        private readonly HashSet<string> _heldGlyphs = new HashSet<string>();
        private readonly HashSet<string> _pressedThisFrame = new HashSet<string>();
        private readonly HashSet<string> _releasedThisFrame = new HashSet<string>();

        public bool IsLoaded => _snapshot != null;
        public bool IsPlaying => _playing;
        public int DurationFrames => _snapshot?.durationFrames ?? 0;
        public int CurrentFrame => _snapshot == null ? 0 : Mathf.FloorToInt(_playbackTime * _snapshot.fps);

        private void Start()
        {
            if (logFile != null)
            {
                LoadFromJson(logFile.text);
                if (playOnLoad) Play();
            }
        }

        private void OnDisable()
        {
            if (Active == this) Active = null;
        }

        /// <summary>Webアプリの「JSONをダウンロード」/「JSONをコピー」で得られるJSON文字列を読み込む。</summary>
        public void LoadFromJson(string json)
        {
            _snapshot = JsonUtility.FromJson<InputLogSnapshot>(json);
            ResetPlaybackState();
        }

        /// <summary>ダウンロードしたJSONファイルをパスから読み込む。</summary>
        public bool LoadFromFile(string path)
        {
            try
            {
                LoadFromJson(File.ReadAllText(path));
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Glank] GlankReplayer: 入力ログの読み込みに失敗しました: {e.Message}");
                return false;
            }
        }

        public void Play()
        {
            if (_snapshot == null)
            {
                Debug.LogWarning("[Glank] GlankReplayer: ログが読み込まれていません。LoadFromJson()を先に呼んでください。");
                return;
            }
            Active = this;
            _playing = true;
        }

        public void Pause() => _playing = false;

        public void Stop()
        {
            _playing = false;
            Seek(0);
        }

        /// <summary>指定フレームまで巻き戻し/早送りする。押下/離上イベントは再発火しない（保持状態のみ復元する）。</summary>
        public void Seek(int frame)
        {
            if (_snapshot == null) return;
            _playbackTime = _snapshot.fps > 0 ? (float)frame / _snapshot.fps : 0f;
            _firedPress.Clear();
            _firedRelease.Clear();
            _heldGlyphs.Clear();
            _pressedThisFrame.Clear();
            _releasedThisFrame.Clear();

            foreach (var entry in _snapshot.inputs)
            {
                if (entry.frame > frame) continue;
                _firedPress.Add(entry);
                int releaseFrame = entry.frame + Mathf.Max(entry.holdFrames, 0);
                if (releaseFrame <= frame)
                {
                    _firedRelease.Add(entry);
                }
                else
                {
                    _heldGlyphs.Add(entry.key);
                }
            }
        }

        private void ResetPlaybackState()
        {
            _playbackTime = 0f;
            _firedPress.Clear();
            _firedRelease.Clear();
            _heldGlyphs.Clear();
            _pressedThisFrame.Clear();
            _releasedThisFrame.Clear();
        }

        private void Update()
        {
            _pressedThisFrame.Clear();
            _releasedThisFrame.Clear();

            if (!_playing || _snapshot == null) return;

            _playbackTime += Time.unscaledDeltaTime * playbackSpeed;
            int frame = CurrentFrame;

            foreach (var entry in _snapshot.inputs)
            {
                if (!_firedPress.Contains(entry) && frame >= entry.frame)
                {
                    _firedPress.Add(entry);
                    _pressedThisFrame.Add(entry.key);
                    _heldGlyphs.Add(entry.key);
                    onInputPressed.Invoke(entry.key, entry.label);
                }

                int releaseFrame = entry.frame + Mathf.Max(entry.holdFrames, 0);
                if (_firedPress.Contains(entry) && !_firedRelease.Contains(entry) && frame >= releaseFrame)
                {
                    _firedRelease.Add(entry);
                    _releasedThisFrame.Add(entry.key);
                    _heldGlyphs.Remove(entry.key);
                    onInputReleased.Invoke(entry.key);
                }
            }

            if (_playing && frame >= _snapshot.durationFrames)
            {
                _playing = false;
                onReplayFinished.Invoke();
            }
        }

        /// <summary>今フレームでglyphが押された瞬間か（Input.GetKeyDown相当）。</summary>
        public bool GetKeyDown(string glyph) => _pressedThisFrame.Contains(glyph);

        /// <summary>glyphが押されたままか（Input.GetKey相当）。</summary>
        public bool GetKey(string glyph) => _heldGlyphs.Contains(glyph);

        /// <summary>今フレームでglyphが離された瞬間か（Input.GetKeyUp相当）。</summary>
        public bool GetKeyUp(string glyph) => _releasedThisFrame.Contains(glyph);
    }
}
