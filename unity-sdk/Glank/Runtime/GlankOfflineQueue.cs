using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// 送信に失敗した報告（ネットワーク断・サーバー一時停止等、再送すれば直る可能性があるもの）を
    /// ディスクに退避しておき、一定間隔で再送を試みる。ゲームを再起動しても消えない
    /// （<see cref="Application.persistentDataPath"/> 配下に保存するため）。
    ///
    /// 動画ファイルは元の場所（OSのインスタントリプレイ出力フォルダ等）からこのキュー用フォルダへ
    /// コピーする。元ファイルはOS側の設定で古い録画から自動的に消されることがあるため、
    /// キューに積んだ時点でコピーしておかないと、再送しようとした時にはファイルが無い、
    /// という事態になりかねないため。
    /// </summary>
    public class GlankOfflineQueue : MonoBehaviour
    {
        [Tooltip("再送を試みる間隔（秒）")]
        [SerializeField] private float retryIntervalSeconds = 60f;

        [Tooltip("送信そのものに使うGlankConfig（BugReportTriggerと同じものでよい）")]
        [SerializeField] private GlankConfig config;

        private string QueueDir => Path.Combine(Application.persistentDataPath, "GlankQueue");
        private string FailedDir => Path.Combine(Application.persistentDataPath, "GlankQueue", "_failed");

        private bool _flushing;

        private void Start()
        {
            Directory.CreateDirectory(QueueDir);
            Directory.CreateDirectory(FailedDir);
            StartCoroutine(FlushLoop());
        }

        /// <summary>現在キューに積まれている（再送待ちの）件数。</summary>
        public int PendingCount
        {
            get
            {
                if (!Directory.Exists(QueueDir)) return 0;
                int count = 0;
                foreach (var dir in Directory.EnumerateDirectories(QueueDir))
                {
                    if (Path.GetFileName(dir) != "_failed") count++;
                }
                return count;
            }
        }

        /// <summary>
        /// 送信に失敗した報告をキューへ積む。動画ファイルはこのフォルダ配下へコピーする。
        /// </summary>
        public void Enqueue(ReportMetadata metadata, string videoFilePath)
        {
            try
            {
                Directory.CreateDirectory(QueueDir);
                string id = Guid.NewGuid().ToString("N");
                string itemDir = Path.Combine(QueueDir, id);
                Directory.CreateDirectory(itemDir);

                string videoExt = Path.GetExtension(videoFilePath);
                string queuedVideoPath = Path.Combine(itemDir, $"video{videoExt}");
                File.Copy(videoFilePath, queuedVideoPath, overwrite: true);

                File.WriteAllText(Path.Combine(itemDir, "metadata.json"), JsonUtility.ToJson(metadata));

                Debug.Log($"[Glank] 送信に失敗したためオフラインキューに退避しました（{PendingCount}件待機中）: {id}");
            }
            catch (Exception e)
            {
                Debug.LogError($"[Glank] オフラインキューへの退避に失敗しました: {e.Message}");
            }
        }

        private IEnumerator FlushLoop()
        {
            while (true)
            {
                yield return new WaitForSecondsRealtime(retryIntervalSeconds);
                yield return FlushOnce();
            }
        }

        /// <summary>キューに溜まっている報告の再送を今すぐ試みる。既に実行中なら何もしない。</summary>
        public void FlushNow()
        {
            if (!_flushing) StartCoroutine(FlushOnce());
        }

        private IEnumerator FlushOnce()
        {
            if (_flushing || config == null) yield break;
            if (!Directory.Exists(QueueDir)) yield break;

            _flushing = true;
            foreach (var itemDir in Directory.EnumerateDirectories(QueueDir))
            {
                if (Path.GetFileName(itemDir) == "_failed") continue;

                string metadataPath = Path.Combine(itemDir, "metadata.json");
                if (!File.Exists(metadataPath)) continue;

                ReportMetadata metadata;
                try
                {
                    metadata = JsonUtility.FromJson<ReportMetadata>(File.ReadAllText(metadataPath));
                }
                catch (Exception e)
                {
                    Debug.LogError($"[Glank] キュー内のmetadata.jsonが壊れています。破棄します: {e.Message}");
                    Directory.Delete(itemDir, recursive: true);
                    continue;
                }

                string videoPath = FindQueuedVideo(itemDir);
                if (videoPath == null)
                {
                    Debug.LogError("[Glank] キュー内に動画ファイルが見つかりません。破棄します。");
                    Directory.Delete(itemDir, recursive: true);
                    continue;
                }

                GlankSubmitOutcome outcome = GlankSubmitOutcome.RetryableFailure;
                string message = "";
                yield return GlankClient.SubmitReport(config, metadata, videoPath, (o, m) =>
                {
                    outcome = o;
                    message = m;
                });

                switch (outcome)
                {
                    case GlankSubmitOutcome.Success:
                        Directory.Delete(itemDir, recursive: true);
                        Debug.Log($"[Glank] オフラインキューからの再送に成功しました（残り{PendingCount}件）");
                        break;
                    case GlankSubmitOutcome.RetryableFailure:
                        // そのまま残す。次回のFlushLoopで再挑戦する。
                        break;
                    case GlankSubmitOutcome.PermanentFailure:
                        // 再送しても直らない失敗（不正なリクエスト等）。無限に溜まり続けないよう
                        // _failed フォルダへ移し、開発者が後から中身を確認できるようにしておく。
                        string failedDest = Path.Combine(FailedDir, Path.GetFileName(itemDir));
                        Directory.Move(itemDir, failedDest);
                        Debug.LogError($"[Glank] 再送しても失敗するリクエストのため中止しました: {message}");
                        break;
                }
            }
            _flushing = false;
        }

        private static string FindQueuedVideo(string itemDir)
        {
            foreach (var file in Directory.EnumerateFiles(itemDir))
            {
                if (Path.GetFileNameWithoutExtension(file) == "video") return file;
            }
            return null;
        }
    }
}
