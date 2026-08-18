using UnityEngine;

namespace Glank
{
    /// <summary>
    /// 「誰が報告したか」を表す識別名の保存・取得。ゲーム側の好きなタイミング
    /// （設定画面、初回起動時のプロンプト等）で <see cref="SetReporterName"/> を呼んでおけば、
    /// それ以降 <see cref="BugReportTrigger"/> のホットキー即送信や <see cref="GlankReportPromptUI"/>
    /// から送られる報告の <c>who</c> 欄に自動で使われる。
    ///
    /// <see cref="PlayerPrefs"/> に保存するため、ゲームを再起動しても一度設定した名前は保持される
    /// （インストールごと・Windowsならユーザーごとに別々に保存される）。一度も設定していない間は
    /// これまで通り <see cref="SystemInfo.deviceName"/> にフォールバックするため、この機能を
    /// 使わないプロジェクトの挙動は変わらない。
    /// </summary>
    public static class GlankReporterIdentity
    {
        private const string PrefsKey = "Glank.ReporterName";

        /// <summary>現在の報告者名。未設定なら<see cref="SystemInfo.deviceName"/>を返す。</summary>
        public static string GetReporterName()
        {
            string stored = PlayerPrefs.GetString(PrefsKey, "");
            return string.IsNullOrWhiteSpace(stored) ? SystemInfo.deviceName : stored;
        }

        /// <summary>報告者名を設定して保存する。空文字/nullを渡すと未設定状態に戻る（＝以後deviceNameにフォールバック）。</summary>
        public static void SetReporterName(string name)
        {
            PlayerPrefs.SetString(PrefsKey, name ?? "");
            PlayerPrefs.Save();
        }

        /// <summary>ユーザーが明示的に報告者名を設定済みかどうか（deviceNameへのフォールバック中でないか）。</summary>
        public static bool HasReporterName()
        {
            return !string.IsNullOrWhiteSpace(PlayerPrefs.GetString(PrefsKey, ""));
        }
    }
}
