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

        /// <summary>
        /// 直近の録画クリップのファイルパスを返す関数。未設定の場合は <see cref="replayWatcher"/> を使う。
        /// Unity Recorderや自前のキャプチャ処理を使いたい場合はここに差し込んで上書きできる。
        /// </summary>
        public Func<string> GetLatestClipPath;

        private void Update()
        {
            if (Input.GetKeyDown(reportHotkey))
            {
                SubmitReport(
                    title: "(quick report)",
                    tag: "crash",
                    desc: "",
                    who: SystemInfo.deviceName,
                    build: Application.version,
                    platform: Application.platform.ToString(),
                    frequency: "unknown");
            }
        }

        public void SubmitReport(string title, string tag, string desc, string who, string build, string platform, string frequency)
        {
            if (config == null || inputLogRecorder == null)
            {
                Debug.LogError("[Glank] config / inputLogRecorder が設定されていません。");
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

            var snapshot = inputLogRecorder.Capture();
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

            StartCoroutine(GlankClient.SubmitReport(config, metadata, videoPath, (ok, message) =>
            {
                if (ok)
                {
                    Debug.Log($"[Glank] report submitted: {message}");
                }
                else
                {
                    Debug.LogError($"[Glank] report submission failed: {message}");
                }
            }));
        }
    }
}
