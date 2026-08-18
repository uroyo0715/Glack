#if ENABLE_INPUT_SYSTEM
using UnityEngine;

namespace Glank
{
    /// <summary>
    /// <see cref="InputLogRecorderNewInputSystem"/> を使うプロジェクト向けの橋渡し役。
    /// <see cref="BugReportTrigger.CaptureInputLog"/> はデリゲート型のためInspectorから
    /// 直接ドラッグ&amp;ドロップで割り当てられない（<see cref="BugReportTrigger.inputLogRecorder"/>
    /// はレガシー<see cref="InputLogRecorder"/>専用）。このコンポーネントを同じGameObjectに
    /// 追加し、<see cref="inputLogRecorder"/>にInputLogRecorderNewInputSystemを割り当てるだけで、
    /// 起動時に自動で配線される（コードを書く必要はない）。
    /// </summary>
    [RequireComponent(typeof(BugReportTrigger))]
    public class GlankNewInputSystemBridge : MonoBehaviour
    {
        [SerializeField] private InputLogRecorderNewInputSystem inputLogRecorder;

        private void Awake()
        {
            if (inputLogRecorder == null)
            {
                Debug.LogError("[Glank] GlankNewInputSystemBridgeにInputLogRecorderNewInputSystemが設定されていません。");
                return;
            }
            GetComponent<BugReportTrigger>().CaptureInputLog = inputLogRecorder.Capture;
        }
    }
}
#endif
