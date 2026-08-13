#if GLANK_INSTANT_REPLAY
using System.Threading.Tasks;
using InstantReplay;
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// OSのインスタントリプレイ機能（Xbox Game Bar/ShadowPlay/ReLive）に頼らず、ゲーム自身が
    /// 直近 <see cref="bufferSeconds"/> 秒のゲームプレイをリングバッファとして保持し続け、
    /// バグ報告のトリガー時にその場でmp4として書き出す。<see cref="BugReportTrigger.GetLatestClipPathAsync"/>
    /// に <see cref="GetLatestClipPathAsync"/> を差し込んで使う。
    ///
    /// 内部で CyberAgent製 InstantReplay for Unity（MIT License）を使う。
    /// https://github.com/CyberAgentGameEntertainment/InstantReplay
    /// プラットフォームネイティブのハードウェアエンコーダー
    /// （Windows: Media Foundation / macOS,iOS: VideoToolbox / Android: MediaCodec）を通すため、
    /// 常時バッファし続けてもCPU負荷は小さい。ただしLinuxのみ、システムにインストール済みの
    /// ffmpegが必要（PATHに通っている必要がある。配布時は別途案内が必要）。
    ///
    /// 導入方法・必要なスクリプティング定義シンボル(GLANK_INSTANT_REPLAY)については
    /// unity-sdk/README.md の「動画録画について」を参照。Unity 2022.3以降が必要
    /// （InstantReplay本体の要件）。
    /// </summary>
    public class InstantReplayVideoRecorder : MonoBehaviour
    {
        [Tooltip("バグ報告時に書き出す秒数（直近何秒分をmp4にするか）。実際に保持できているバッファが" +
            "これより短い場合は、保持している分だけになる。")]
        [SerializeField] private double bufferSeconds = 15.0;

        [Tooltip("常時保持するバッファの上限メモリ（バイト）。大きいほど長時間分を保持できるが、その分" +
            "メモリを使う。既定の解像度・ビットレート（720p・30fps・2.5Mbps、InstantReplay側の既定値）では" +
            "20MiBでおおむね数十秒分に相当する。bufferSecondsぶんを安定して保持できるよう、必要に応じて" +
            "増やすこと。")]
        [SerializeField] private long maxMemoryUsageBytes = 20 * 1024 * 1024;

        private RealtimeInstantReplaySession _session;

        private void OnEnable() => StartSession();

        private void OnDisable()
        {
            _session?.Dispose();
            _session = null;
        }

        private void StartSession()
        {
            var options = RealtimeEncodingOptions.Default;
            options.MaxMemoryUsageBytesForCompressedFrames = maxMemoryUsageBytes;
            _session = new RealtimeInstantReplaySession(options, onException: e =>
                Debug.LogWarning($"[Glank] InstantReplayVideoRecorder: 録画中にエラーが発生しました: {e.Message}"));
        }

        /// <summary>
        /// 直近 <see cref="bufferSeconds"/> 秒をmp4として書き出し、そのファイルパスを返す。
        /// 書き出しには現在のセッションを止める必要があるため、録画に空白期間ができないよう
        /// 先に次のセッションを開始してから書き出す。
        /// </summary>
        public async Task<string> GetLatestClipPathAsync()
        {
            var finished = _session;
            StartSession(); // 空白期間を作らないよう、書き出しの前に次のセッションを開始しておく
            try
            {
                return await finished.StopAndExportAsync(bufferSeconds).AsTask();
            }
            finally
            {
                finished.Dispose();
            }
        }
    }
}
#endif
