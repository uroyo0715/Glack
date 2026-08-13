using System;
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// <see cref="Application.logMessageReceived"/> を監視し、致命的な例外・エラーを検知したら
    /// 自動でバグ報告を送信する（tagは自動的に"crash"）。送信ロジックは既存の
    /// <see cref="BugReportTrigger.SubmitReport"/> にそのまま乗せる。
    ///
    /// <see cref="LogType.Exception"/>（未処理の例外）は常に致命的として扱う。
    /// <see cref="LogType.Error"/> は既定では対象にしない
    /// （アセット読み込み失敗など、クラッシュではない「ただのエラーログ」まで拾うと
    /// 誤検知・自動報告の乱発につながるため）。LogType.Errorも対象にしたい場合は
    /// <see cref="treatAllErrorsAsFatal"/> を有効にするか、<see cref="IsFatalError"/> に
    /// 個別の判定条件（メッセージ文字列のパターンマッチ等）を差し込む。
    ///
    /// <see cref="GlankConfig.autoDetectionEnabled"/> がfalseの間は何もしない（既定OFF）。
    /// </summary>
    public class CrashDetector : MonoBehaviour
    {
        [SerializeField] private GlankConfig config;
        [SerializeField] private BugReportTrigger trigger;

        [Tooltip("LogType.Errorもすべて致命的として扱う（既定false）。ONにすると、Unity内部の" +
            "警告的なエラーログまで拾ってしまい誤検知が増える可能性がある。特定のエラーメッセージだけを" +
            "対象にしたい場合は、これをfalseのままIsFatalErrorに判定条件を差し込む方を推奨。")]
        [SerializeField] private bool treatAllErrorsAsFatal = false;

        [Tooltip("連続クラッシュ（同じ例外がフレームごとに繰り返し出る等）で自動報告が乱発するのを" +
            "防ぐための最短間隔（秒）")]
        [SerializeField] private float cooldownSeconds = 30f;

        /// <summary>
        /// LogType.Errorのうち、どれを「致命的」として自動報告の対象にするかの判定条件を差し込む。
        /// (condition, stackTrace) を受け取り、致命的ならtrueを返す。未設定かつ
        /// treatAllErrorsAsFatalもfalseなら、LogType.ErrorはすべてsKIPされる（LogType.Exceptionのみ対象）。
        /// </summary>
        public Func<string, string, bool> IsFatalError;

        private float _lastSubmitUnscaledTime = float.NegativeInfinity;

        private void OnEnable() => Application.logMessageReceived += HandleLog;

        private void OnDisable() => Application.logMessageReceived -= HandleLog;

        private void HandleLog(string condition, string stackTrace, LogType type)
        {
            if (config == null || !config.autoDetectionEnabled || trigger == null) return;

            bool isFatal = type == LogType.Exception
                || (type == LogType.Error &&
                    (treatAllErrorsAsFatal || (IsFatalError?.Invoke(condition, stackTrace) ?? false)));
            if (!isFatal) return;

            if (Time.unscaledTime - _lastSubmitUnscaledTime < cooldownSeconds) return;
            _lastSubmitUnscaledTime = Time.unscaledTime;

            trigger.SubmitReport(
                title: "[自動検知] クラッシュ",
                tags: new[] { "crash" },
                desc: $"{condition}\n{stackTrace}",
                who: SystemInfo.deviceName,
                build: Application.version,
                platform: Application.platform.ToString(),
                priority: "high");
        }
    }
}
