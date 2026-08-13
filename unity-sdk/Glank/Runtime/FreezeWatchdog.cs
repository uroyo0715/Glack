using System;
using System.Threading;
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// メインスレッドが一定時間（既定10秒、<see cref="freezeThresholdSeconds"/> で変更可能）
    /// フレーム更新（<see cref="Time.frameCount"/> の進行）を止めていることを検知し、自動でバグ報告を
    /// 送信する（tagは自動的に"softlock"）。送信ロジックは既存の <see cref="BugReportTrigger.SubmitReport"/>
    /// にそのまま乗せる。
    ///
    /// メインスレッド自体が詰まっている状況を想定しているため、検知そのものは別スレッドで行う
    /// （メインスレッドのUpdate/コルーチンでは、メインスレッドが本当に固まった場合は
    /// その検知処理自体も止まってしまうため使えない）。
    ///
    /// ただし報告の送信（入力ログの取得・UnityWebRequest等）はUnity APIの制約上メインスレッドでしか
    /// 行えないため、実際の送信は「別スレッドがフリーズを検知した後、メインスレッドが応答を再開した
    /// 最初のUpdate()」で行われる。メインスレッドが完全にデッドロックして二度と応答しない場合、
    /// 原理的にどのような実装であっても報告を送信できない点に注意（ソフトウェア側の対処には限界がある。
    /// これは外部プロセスによるハングウォッチドッグ等、SDKの範囲外の仕組みでのみ対応可能）。
    ///
    /// <see cref="GlankConfig.autoDetectionEnabled"/> がfalseの間は何もしない（既定OFF）。
    /// </summary>
    public class FreezeWatchdog : MonoBehaviour
    {
        [SerializeField] private GlankConfig config;
        [SerializeField] private BugReportTrigger trigger;

        [Tooltip("この秒数フレームが進まなかったらフリーズとみなす")]
        [SerializeField] private float freezeThresholdSeconds = 10f;

        [Tooltip("監視スレッドがフレーム更新をチェックする間隔（秒）")]
        [SerializeField] private float pollIntervalSeconds = 1f;

        [Tooltip("フリーズ検知後、次のフリーズを検知できるようになるまでの最短間隔（秒）。" +
            "断続的なフリーズが続く場合に自動報告が乱発するのを防ぐ。")]
        [SerializeField] private float cooldownSeconds = 60f;

        private readonly object _lock = new object();
        private Thread _watchThread;
        private volatile bool _running;
        private int _lastSeenFrame;
        private DateTime _lastSeenUtc;
        private bool _pendingSubmit;
        private DateTime _lastDetectedUtc = DateTime.MinValue;

        private void OnEnable()
        {
            lock (_lock)
            {
                _lastSeenFrame = Time.frameCount;
                _lastSeenUtc = DateTime.UtcNow;
                _pendingSubmit = false;
            }
            _running = true;
            _watchThread = new Thread(WatchLoop) { IsBackground = true, Name = "GlankFreezeWatchdog" };
            _watchThread.Start();
        }

        private void OnDisable()
        {
            _running = false;
        }

        // メインスレッド側: フレームが進んだことを記録し、フリーズ検知が保留中ならここで報告を送信する
        // （送信自体はメインスレッド専用のUnity APIを使うため、Update()の中でしか行えない）。
        private void Update()
        {
            bool shouldSubmit;
            lock (_lock)
            {
                if (Time.frameCount != _lastSeenFrame)
                {
                    _lastSeenFrame = Time.frameCount;
                    _lastSeenUtc = DateTime.UtcNow;
                }
                shouldSubmit = _pendingSubmit;
                _pendingSubmit = false;
            }

            if (shouldSubmit) SubmitFreezeReport();
        }

        private void WatchLoop()
        {
            while (_running)
            {
                Thread.Sleep(Mathf.Max(1, Mathf.RoundToInt(pollIntervalSeconds * 1000f)));
                if (config == null || !config.autoDetectionEnabled) continue;

                lock (_lock)
                {
                    var stuckSeconds = (DateTime.UtcNow - _lastSeenUtc).TotalSeconds;
                    var sinceLastDetected = (DateTime.UtcNow - _lastDetectedUtc).TotalSeconds;
                    if (stuckSeconds >= freezeThresholdSeconds && sinceLastDetected >= cooldownSeconds && !_pendingSubmit)
                    {
                        _pendingSubmit = true;
                        _lastDetectedUtc = DateTime.UtcNow;
                    }
                }
            }
        }

        private void SubmitFreezeReport()
        {
            if (config == null || !config.autoDetectionEnabled || trigger == null) return;

            trigger.SubmitReport(
                title: "[自動検知] フリーズ",
                tags: new[] { "softlock" },
                desc: $"メインスレッドが約{freezeThresholdSeconds:F0}秒以上応答していませんでした。",
                who: SystemInfo.deviceName,
                build: Application.version,
                platform: Application.platform.ToString(),
                priority: "high");
        }
    }
}
