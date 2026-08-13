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
            if (!Input.GetKeyDown(reportHotkey)) return;

            if (promptUI != null)
            {
                promptUI.Show();
                return;
            }

            SubmitReport(
                title: "(quick report)",
                tags: new[] { "crash" },
                desc: "",
                who: SystemInfo.deviceName,
                build: Application.version,
                platform: Application.platform.ToString(),
                priority: "medium");
        }

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
