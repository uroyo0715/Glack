using System;
using System.Collections;
using System.Threading.Tasks;
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// バグ報告のトリガーからAPI送信までを繋ぐサンプル実装。
    /// 動画の取得元は次の優先順で決まる。
    ///   1. <see cref="GetLatestClipPathAsync"/>（例: <see cref="InstantReplayVideoRecorder"/> のような、
    ///      ゲーム自身がリングバッファで保持している映像をその場でmp4に書き出す方式。OS側の設定に依存しない）
    ///   2. <see cref="GetLatestClipPath"/>（同期版。自前の取得処理を差し込みたい場合用）
    ///   3. <see cref="replayWatcher"/>（既定値。OSのインスタントリプレイ機能の出力フォルダから
    ///      最新の録画ファイルを探すフォールバック。プレイヤー側でXbox Game Bar等を有効化している場合のみ機能する）
    /// </summary>
    public class BugReportTrigger : MonoBehaviour
    {
        [SerializeField] private GlankConfig config;
        [SerializeField] private InputLogRecorder inputLogRecorder;
        [SerializeField] private KeyCode reportHotkey = KeyCode.F12;

        [Tooltip("OSのインスタントリプレイ機能の出力フォルダから最新の録画を探す既定の実装。")]
        [SerializeField] private ReplayFolderWatcher replayWatcher = new ReplayFolderWatcher();

        [Tooltip("送信に失敗した場合の退避先（任意）。設定しておくと、ネットワーク断やサーバー" +
            "一時停止などで送信できなかった報告を自動で再送してくれる。未設定なら失敗時は諦めてログを出すだけ。")]
        [SerializeField] private GlankOfflineQueue offlineQueue;

        [Tooltip("設定すると、ホットキーを押した際に仮タイトルで即送信する代わりにこのフォームを開き、" +
            "QA担当がタイトル・種類・詳細・発生頻度を入力してから送信できるようになる（任意）。")]
        [SerializeField] private GlankReportPromptUI promptUI;

        /// <summary>
        /// 直近の録画クリップのファイルパスを非同期に返す関数（優先度最高）。
        /// <see cref="InstantReplayVideoRecorder.GetLatestClipPathAsync"/> のように、リングバッファから
        /// その場でmp4を書き出すような、完了までフレームをまたぐ処理を差し込む場合に使う。
        /// </summary>
        public Func<Task<string>> GetLatestClipPathAsync;

        /// <summary>
        /// 直近の録画クリップのファイルパスを返す関数（同期版）。<see cref="GetLatestClipPathAsync"/>が
        /// 未設定の場合に使う。どちらも未設定なら <see cref="replayWatcher"/> を使う。
        /// </summary>
        public Func<string> GetLatestClipPath;

        /// <summary>
        /// 入力ログのキャプチャ処理を差し込んで上書きする（未設定なら<see cref="inputLogRecorder"/>を使う）。
        /// 新Input System（com.unity.inputsystem）を使うプロジェクトでは、ここに
        /// InputLogRecorderNewInputSystem.Capture を渡す。
        /// </summary>
        public Func<InputLogSnapshot> CaptureInputLog;

        private void Update()
        {
            if (!IsHotkeyDown()) return;

            if (promptUI != null)
            {
                promptUI.Show();
                return;
            }

            SubmitReport(
                title: "(quick report)",
                tags: new[] { "crash" },
                desc: "",
                who: GlankReporterIdentity.GetReporterName(),
                build: Application.version,
                platform: Application.platform.ToString(),
                priority: "medium");
        }

        /// <summary>
        /// ホットキーが押されたかどうかを判定する。レガシー<see cref="Input"/>クラスは、
        /// Player SettingsのActive Input Handlingが「Input System Package (New)」単体の
        /// プロジェクトでは呼び出すだけで例外を投げるため、その場合はInput Systemの
        /// <c>Keyboard.current</c>を使う（<see cref="reportHotkey"/>のKeyCodeをKeyへ変換して判定）。
        /// 「Both」やレガシーのみの設定では、これまで通りレガシーInputを使う。
        /// </summary>
        private bool IsHotkeyDown()
        {
#if ENABLE_INPUT_SYSTEM && !ENABLE_LEGACY_INPUT_MANAGER
            var keyboard = UnityEngine.InputSystem.Keyboard.current;
            if (keyboard == null) return false;
            var key = ConvertKeyCodeToKey(reportHotkey);
            return key != UnityEngine.InputSystem.Key.None && keyboard[key].wasPressedThisFrame;
#else
            return Input.GetKeyDown(reportHotkey);
#endif
        }

#if ENABLE_INPUT_SYSTEM
        /// <summary>
        /// よく使われるホットキー用のKeyCode→Key変換（網羅はしていない）。未対応のKeyCodeは
        /// Key.Noneを返し、その場合ホットキーは反応しない（Inspectorで別のキーを選んでもらう想定）。
        /// </summary>
        private static UnityEngine.InputSystem.Key ConvertKeyCodeToKey(KeyCode keyCode)
        {
            switch (keyCode)
            {
                case KeyCode.F1: return UnityEngine.InputSystem.Key.F1;
                case KeyCode.F2: return UnityEngine.InputSystem.Key.F2;
                case KeyCode.F3: return UnityEngine.InputSystem.Key.F3;
                case KeyCode.F4: return UnityEngine.InputSystem.Key.F4;
                case KeyCode.F5: return UnityEngine.InputSystem.Key.F5;
                case KeyCode.F6: return UnityEngine.InputSystem.Key.F6;
                case KeyCode.F7: return UnityEngine.InputSystem.Key.F7;
                case KeyCode.F8: return UnityEngine.InputSystem.Key.F8;
                case KeyCode.F9: return UnityEngine.InputSystem.Key.F9;
                case KeyCode.F10: return UnityEngine.InputSystem.Key.F10;
                case KeyCode.F11: return UnityEngine.InputSystem.Key.F11;
                case KeyCode.F12: return UnityEngine.InputSystem.Key.F12;
                case KeyCode.Space: return UnityEngine.InputSystem.Key.Space;
                case KeyCode.Tab: return UnityEngine.InputSystem.Key.Tab;
                case KeyCode.Escape: return UnityEngine.InputSystem.Key.Escape;
                case KeyCode.Return: return UnityEngine.InputSystem.Key.Enter;
                case KeyCode.Backspace: return UnityEngine.InputSystem.Key.Backspace;
                case KeyCode.Alpha0: return UnityEngine.InputSystem.Key.Digit0;
                case KeyCode.Alpha1: return UnityEngine.InputSystem.Key.Digit1;
                case KeyCode.Alpha2: return UnityEngine.InputSystem.Key.Digit2;
                case KeyCode.Alpha3: return UnityEngine.InputSystem.Key.Digit3;
                case KeyCode.Alpha4: return UnityEngine.InputSystem.Key.Digit4;
                case KeyCode.Alpha5: return UnityEngine.InputSystem.Key.Digit5;
                case KeyCode.Alpha6: return UnityEngine.InputSystem.Key.Digit6;
                case KeyCode.Alpha7: return UnityEngine.InputSystem.Key.Digit7;
                case KeyCode.Alpha8: return UnityEngine.InputSystem.Key.Digit8;
                case KeyCode.Alpha9: return UnityEngine.InputSystem.Key.Digit9;
                default:
                    // A-Z（KeyCode.A..KeyCode.Zは連番、InputSystem.Key.A..Zも連番なのでオフセットで変換できる）
                    if (keyCode >= KeyCode.A && keyCode <= KeyCode.Z)
                    {
                        int offset = keyCode - KeyCode.A;
                        return UnityEngine.InputSystem.Key.A + offset;
                    }
                    Debug.LogWarning($"[Glank] reportHotkeyの{keyCode}は新Input System向けの変換に未対応です。" +
                        "InspectorでF1〜F12・英数字・Space等の対応済みキーに変更してください。");
                    return UnityEngine.InputSystem.Key.None;
            }
        }
#endif

        public void SubmitReport(string title, string[] tags, string desc, string who, string build, string platform, string priority)
        {
            if (config == null || (inputLogRecorder == null && CaptureInputLog == null))
            {
                Debug.LogError("[Glank] config / inputLogRecorder（またはCaptureInputLog）が設定されていません。");
                return;
            }

            // 入力ログはトリガーの瞬間（この時点）でキャプチャする。動画の書き出し待ち（非同期の場合）の間に
            // リングバッファが進んでしまい、動画と噛み合わなくなるのを防ぐため。
            var snapshot = CaptureInputLog != null ? CaptureInputLog.Invoke() : inputLogRecorder.Capture();
            var metadata = new ReportMetadata
            {
                projectId = config.projectId,
                title = title,
                tags = tags,
                desc = desc,
                who = who,
                build = build,
                platform = platform,
                priority = priority,
                fps = snapshot.fps,
                durationFrames = snapshot.durationFrames,
                inputs = snapshot.inputs,
            };

            StartCoroutine(SubmitReportCoroutine(metadata));
        }

        private IEnumerator SubmitReportCoroutine(ReportMetadata metadata)
        {
            string videoPath = null;

            if (GetLatestClipPathAsync != null)
            {
                var task = GetLatestClipPathAsync.Invoke();
                while (!task.IsCompleted) yield return null;

                if (task.IsFaulted)
                {
                    Debug.LogError($"[Glank] 動画の書き出しに失敗しました: {task.Exception?.GetBaseException().Message}");
                    yield break;
                }
                videoPath = task.Result;
            }
            else
            {
                videoPath = GetLatestClipPath != null ? GetLatestClipPath.Invoke() : replayWatcher.FindLatestClip();
            }

            if (string.IsNullOrEmpty(videoPath))
            {
                Debug.LogWarning(
                    "[Glank] 録画ファイルが見つかりません。OSのインスタントリプレイ機能（Xbox Game Bar等）で" +
                    "直近の録画を保存してから再度お試しください。送信を中止しました。"
                );
                yield break;
            }

            yield return GlankClient.SubmitReport(config, metadata, videoPath, (outcome, message) =>
            {
                switch (outcome)
                {
                    case GlankSubmitOutcome.Success:
                        Debug.Log($"[Glank] report submitted: {message}");
                        break;
                    case GlankSubmitOutcome.RetryableFailure when offlineQueue != null:
                        // ネットワーク断・サーバー一時停止等。オフラインキューに退避して後で再送する。
                        offlineQueue.Enqueue(metadata, videoPath);
                        break;
                    default:
                        Debug.LogError($"[Glank] report submission failed: {message}");
                        break;
                }
            });
        }
    }
}
