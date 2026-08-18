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
        [Tooltip(
            "選択肢の並び順は0:crash 1:visual 2:softlock を想定。\n" +
            "このクイック入力フォームでは種類は1つだけ選べる（Web UI側は複数タグに対応済み）。" +
            "複数の種類を付けたい場合は、送信後にWeb UIの編集画面から追加できる。"
        )]
        [SerializeField] private Dropdown tagDropdown;
        [SerializeField] private InputField descField;
        [Tooltip("「誰が報告したか」欄（任意）。未設定なら報告者名の入力機能自体を使わない。" +
            "空欄のまま送信すると、これまで設定した報告者名（無ければ端末名）を使う。")]
        [SerializeField] private InputField reporterNameField;
        [Tooltip("選択肢の並び順は0:high 1:medium 2:low を想定")]
        [SerializeField] private Dropdown priorityDropdown;
        [SerializeField] private Button submitButton;
        [SerializeField] private Button cancelButton;

        private static readonly string[] TagValues = { "crash", "visual", "softlock" };
        private static readonly string[] PriorityValues = { "high", "medium", "low" };
        private const int DefaultPriorityIndex = 1; // medium

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
            // 報告者名は前回設定した値を引き継いで表示する（毎回入力し直さなくていいように）。
            if (reporterNameField != null) reporterNameField.text = GlankReporterIdentity.GetReporterName();
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
            string priority = PriorityValues[Mathf.Clamp(
                priorityDropdown != null ? priorityDropdown.value : DefaultPriorityIndex,
                0, PriorityValues.Length - 1)];

            if (reporterNameField != null && !string.IsNullOrWhiteSpace(reporterNameField.text))
            {
                GlankReporterIdentity.SetReporterName(reporterNameField.text);
            }

            trigger.SubmitReport(
                title: title,
                tags: new[] { tag },
                desc: desc,
                who: GlankReporterIdentity.GetReporterName(),
                build: Application.version,
                platform: Application.platform.ToString(),
                priority: priority);

            Hide();
        }
    }
}
