using UnityEngine;
using UnityEngine.UI;

namespace Glank
{
    /// <summary>
    /// ホットキーを押した瞬間に仮のタイトルで即送信するのではなく、QA担当がタイトル・種類・詳細・
    /// 発生頻度を入力してから送信できるようにする簡易フォームのロジック部分。
    ///
    /// 見た目（Canvas上のInputField/Dropdown/Button配置）はUnity Editor側で作る必要があるため、
    /// このスクリプトはロジックのみを提供する。Hierarchyの組み方はunity-sdk/README.mdを参照。
    /// レガシーUI（UnityEngine.UI）のみを使い、TextMeshPro等の追加パッケージには依存しない
    /// （SDK全体の「依存パッケージなし」という方針に合わせている）。
    /// </summary>
    public class GlankReportPromptUI : MonoBehaviour
    {
        [SerializeField] private BugReportTrigger trigger;
        [SerializeField] private GameObject panelRoot;

        [SerializeField] private InputField titleField;
        [Tooltip("選択肢の並び順は0:crash 1:visual 2:softlock を想定")]
        [SerializeField] private Dropdown tagDropdown;
        [SerializeField] private InputField descField;
        [Tooltip("選択肢の並び順は0:rare 1:sometimes 2:often 3:always 4:unknown を想定")]
        [SerializeField] private Dropdown frequencyDropdown;
        [SerializeField] private Button submitButton;
        [SerializeField] private Button cancelButton;

        private static readonly string[] TagValues = { "crash", "visual", "softlock" };
        private static readonly string[] FrequencyValues = { "rare", "sometimes", "often", "always", "unknown" };

        private void Awake()
        {
            if (submitButton != null) submitButton.onClick.AddListener(Submit);
            if (cancelButton != null) cancelButton.onClick.AddListener(Hide);
            Hide();
        }

        /// <summary>フォームを表示する。ゲームを一時停止したい場合は呼び出し側で別途Time.timeScale = 0にする。</summary>
        public void Show()
        {
            if (titleField != null) titleField.text = "";
            if (descField != null) descField.text = "";
            if (panelRoot != null) panelRoot.SetActive(true);
        }

        public void Hide()
        {
            if (panelRoot != null) panelRoot.SetActive(false);
        }

        public bool IsVisible => panelRoot != null && panelRoot.activeSelf;

        private void Submit()
        {
            if (trigger == null)
            {
                Debug.LogError("[Glank] GlankReportPromptUI: triggerが未設定です。");
                return;
            }

            string title = titleField != null && !string.IsNullOrWhiteSpace(titleField.text)
                ? titleField.text
                : "(no title)";
            string tag = TagValues[Mathf.Clamp(tagDropdown != null ? tagDropdown.value : 0, 0, TagValues.Length - 1)];
            string desc = descField != null ? descField.text : "";
            string frequency = FrequencyValues[Mathf.Clamp(
                frequencyDropdown != null ? frequencyDropdown.value : FrequencyValues.Length - 1,
                0, FrequencyValues.Length - 1)];

            trigger.SubmitReport(
                title: title,
                tag: tag,
                desc: desc,
                who: SystemInfo.deviceName,
                build: Application.version,
                platform: Application.platform.ToString(),
                frequency: frequency);

            Hide();
        }
    }
}
