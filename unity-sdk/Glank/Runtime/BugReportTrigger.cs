using System;
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// バグ報告のトリガーからAPI送信までを繋ぐサンプル実装。
    /// 動画の録画自体はSDKの範囲外。既定では <see cref="replayWatcher"/> がOSのインスタントリプレイ
    /// （Xbox Game Bar / ShadowPlay / ReLive等）の出力フォルダから最新の録画ファイルを探す。
    /// 別の取得方法を使いたい場合は <see cref="GetLatestClipPath"/> に差し込めば、そちらが優先される。
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
        /// 直近の録画クリップのファイルパスを返す関数。未設定の場合は <see cref="replayWatcher"/> を使う。
        /// Unity Recorderや自前のキャプチャ処理を使いたい場合はここに差し込んで上書きできる。
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
                tag: "crash",
                desc: "",
                who: SystemInfo.deviceName,
                build: Application.version,
                platform: Application.platform.ToString(),
                frequency: "unknown");
        }

        public void SubmitReport(string title, string tag, string desc, string who, string build, string platform, string frequency)
        {
            if (config == null || (inputLogRecorder == null && CaptureInputLog == null))
            {
                Debug.LogError("[Glank] config / inputLogRecorder（またはCaptureInputLog）が設定されていません。");
                return;
            }

            string videoPath = GetLatestClipPath != null ? GetLatestClipPath.Invoke() : replayWatcher.FindLatestClip();
            if (string.IsNullOrEmpty(videoPath))
            {
                Debug.LogWarning(
                    "[Glank] 録画ファイルが見つかりません。OSのインスタントリプレイ機能（Xbox Game Bar等）で" +
                    "直近の録画を保存してから再度お試しください。送信を中止しました。"
                );
                return;
            }

            var snapshot = CaptureInputLog != null ? CaptureInputLog.Invoke() : inputLogRecorder.Capture();
            var metadata = new ReportMetadata
            {
                projectId = config.projectId,
                title = title,
                tag = tag,
                desc = desc,
                who = who,
                build = build,
                platform = platform,
                frequency = frequency,
                fps = snapshot.fps,
                durationFrames = snapshot.durationFrames,
                inputs = snapshot.inputs,
            };

            StartCoroutine(GlankClient.SubmitReport(config, metadata, videoPath, (outcome, message) =>
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
            }));
        }
    }
}
