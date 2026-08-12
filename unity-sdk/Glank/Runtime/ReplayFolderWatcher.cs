using System;
using System.IO;
using System.Linq;
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// ゲーム自体では録画を行わず、OSのインスタントリプレイ機能
    /// （Xbox Game Bar の背景録画 / NVIDIA ShadowPlay / AMD ReLive など）が
    /// 書き出した動画ファイルを検出して使う。実行時コストはフォルダの列挙のみで、
    /// 常時録画バッファをゲーム側で保持する方式（メモリ・CPU負荷が大きい）とは異なり
    /// 無視できるレベル。GPUベンダー側のハードウェアエンコーダーで
    /// 既に効率化された録画をそのまま利用する想定。
    /// </summary>
    [Serializable]
    public class ReplayFolderWatcher
    {
        [Tooltip(
            "録画ファイルの保存先候補（存在するものだけを検索する）。\n" +
            "既定値は Xbox Game Bar の背景録画（Win+Alt+G）のデフォルト保存先。\n" +
            "ShadowPlay/ReLiveを使う場合は、それぞれの設定画面で確認した保存先を追加する。"
        )]
        public string[] watchFolders =
        {
            @"%USERPROFILE%\Videos\Captures",
        };

        [Tooltip("検索対象とする拡張子")]
        public string[] extensions = { ".mp4", ".mkv", ".avi", ".webm" };

        [Tooltip("このフレームより古い（＝別の機会に録った）ファイルは無視する")]
        public float maxAgeSeconds = 300f;

        /// <summary>監視フォルダの中で最終更新日時が最も新しい動画ファイルを返す。見つからなければnull。</summary>
        public string FindLatestClip()
        {
            string latestPath = null;
            DateTime latestTime = DateTime.MinValue;

            foreach (var rawFolder in watchFolders)
            {
                string folder = Environment.ExpandEnvironmentVariables(rawFolder);
                if (!Directory.Exists(folder)) continue;

                foreach (var file in Directory.EnumerateFiles(folder))
                {
                    if (!extensions.Contains(Path.GetExtension(file).ToLowerInvariant())) continue;

                    var writeTime = File.GetLastWriteTime(file);
                    if (writeTime > latestTime)
                    {
                        latestTime = writeTime;
                        latestPath = file;
                    }
                }
            }

            if (latestPath == null) return null;
            if ((DateTime.Now - latestTime).TotalSeconds > maxAgeSeconds)
            {
                Debug.LogWarning(
                    $"[Glank] 最新の録画ファイルが古すぎます（{(DateTime.Now - latestTime).TotalSeconds:F0}秒前）。" +
                    "OSのインスタントリプレイ機能で新しく保存してから再度お試しください。"
                );
                return null;
            }

            return latestPath;
        }
    }
}
