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
            "既定値はOSごとの代表的な保存先:\n" +
            "  Windows: Xbox Game Barの背景録画（Win+Alt+G）の既定保存先\n" +
            "  macOS  : QuickTime Playerで画面収録した場合の既定保存先（~/Movies）\n" +
            "  Linux  : 共通の既定保存先が無いため空。OBSのReplay Buffer等の出力先を確認して追加する\n" +
            "ShadowPlay/ReLive/OBS等を使う場合は、それぞれの設定画面で確認した保存先を追加する。"
        )]
        public string[] watchFolders = DefaultWatchFolders();

        [Tooltip("検索対象とする拡張子")]
        public string[] extensions = { ".mp4", ".mkv", ".avi", ".webm", ".mov" };

        [Tooltip("このフレームより古い（＝別の機会に録った）ファイルは無視する")]
        public float maxAgeSeconds = 300f;

        private static string[] DefaultWatchFolders()
        {
#if UNITY_STANDALONE_OSX || UNITY_EDITOR_OSX
            return new[] { "~/Movies" };
#elif UNITY_STANDALONE_LINUX || UNITY_EDITOR_LINUX
            // Linuxには「OSの機能としてのインスタントリプレイ」に相当する共通の既定保存先が無い
            // （OBS Studio の Replay Buffer 等、サードパーティのツール任せになる）ため空にしておく。
            // 利用側でそのツールの出力フォルダをInspectorから追加する。
            return Array.Empty<string>();
#else
            return new[] { @"%USERPROFILE%\Videos\Captures" };
#endif
        }

        /// <summary>環境変数（%USERPROFILE%等）と、macOS/Linuxの~（ホームディレクトリ）を展開する。</summary>
        private static string ExpandPath(string rawFolder)
        {
            string expanded = Environment.ExpandEnvironmentVariables(rawFolder);
            if (expanded.StartsWith("~"))
            {
                string home = Environment.GetFolderPath(Environment.SpecialFolder.Personal);
                // SpecialFolder.Personal は Windows では Documents を指すため、
                // macOS/Linuxで実行されている場合のみ ~ の展開先として使う
                // （このメソッドはWindowsの既定値では ~ を使わないため通常は到達しない分岐）。
                expanded = home + expanded.Substring(1);
            }
            return expanded;
        }

        /// <summary>監視フォルダの中で最終更新日時が最も新しい動画ファイルを返す。見つからなければnull。</summary>
        public string FindLatestClip()
        {
            string latestPath = null;
            DateTime latestTime = DateTime.MinValue;

            foreach (var rawFolder in watchFolders)
            {
                string folder = ExpandPath(rawFolder);
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
