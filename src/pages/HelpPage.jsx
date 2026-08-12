import React from 'react'

export default function HelpPage() {
  return (
    <main className="help-page">
      <div className="list-header">
        <div className="list-header-row">
          <h1>Unity連携の使い方</h1>
        </div>
      </div>

      <div className="help-body">
        <p className="help-lead">
          Glankは「Webアプリ側のプロジェクト」と「Unityで作っているゲーム」を
          <strong>プロジェクトID</strong>で紐付けます。ゲーム内でホットキーを押すと、
          直近の録画動画と入力ログが自動でこのWebアプリに送信され、一覧に表示されます。
        </p>

        <ol className="help-steps">
          <li>
            <h2>1. このWebアプリでプロジェクトを作成する</h2>
            <p>
              プロジェクト一覧画面の「新規プロジェクト」から、ゲームのタイトルとティザー画像
              （任意）を入力して作成します。作成したプロジェクトカードには
              <span className="mono">ID: 3</span> のようにプロジェクトIDが表示されます。これが
              Unity側の設定で使う番号です。
            </p>
          </li>

          <li>
            <h2>2. Unity側にGlank SDKを導入する</h2>
            <p>
              リポジトリの <span className="mono">unity-sdk/Glank</span> フォルダを、対象の
              Unityプロジェクトの <span className="mono">Packages/</span> 以下にコピーします
              （またはPackage Managerの「Add package from disk...」で
              <span className="mono">package.json</span> を指定）。外部パッケージへの依存はありません。
            </p>
          </li>

          <li>
            <h2>3. 接続設定（GlankConfig）を作る</h2>
            <p>
              Unityのメニューから <span className="mono">Assets &gt; Create &gt; Glank &gt; Config</span>{' '}
              でScriptableObjectを作成し、以下を設定します。
            </p>
            <table className="help-table">
              <tbody>
                <tr>
                  <td className="mono">baseUrl</td>
                  <td>
                    このアプリのAPIサーバーのURL。ローカル開発なら
                    <span className="mono"> http://localhost:8787/api/v1</span>
                  </td>
                </tr>
                <tr>
                  <td className="mono">apiKey</td>
                  <td>
                    サーバー側の<span className="mono">GLANK_API_KEY</span>
                    環境変数と同じ値。未設定の間は空欄でよい（開発用に認証をスキップする）
                  </td>
                </tr>
                <tr>
                  <td className="mono">projectId</td>
                  <td>手順1で確認したプロジェクトID</td>
                </tr>
              </tbody>
            </table>
          </li>

          <li>
            <h2>4. シーンにコンポーネントを置く</h2>
            <p>
              任意のGameObjectに <span className="mono">InputLogRecorder</span> と
              <span className="mono"> BugReportTrigger</span> をアタッチし、
              <span className="mono">BugReportTrigger</span> の <span className="mono">config</span> に
              手順3で作った設定を割り当てます。
              <span className="mono">InputLogRecorder</span> には監視したいキー（
              <span className="mono">watchedKeys</span>）を登録しておきます。
            </p>
          </li>

          <li>
            <h2>5. 録画は自作しない — OSのインスタントリプレイ機能を使う</h2>
            <p>
              「常に直近n秒を録画し続ける」処理をゲーム側で自前実装すると、フル画質では
              数GB単位のメモリを消費し重くなってしまいます。そのため、Windowsの
              <strong>Xbox Game Bar</strong>（背景録画）や<strong>NVIDIA ShadowPlay</strong>、
              <strong>AMD ReLive</strong>といった、GPUのハードウェアエンコーダーで
              既に効率化されたOS標準のインスタントリプレイ機能に録画そのものは任せます。
              ゲーム本体への負荷はほぼゼロです。
            </p>
            <p>
              Windowsの設定 &gt; ゲーム &gt; Xbox Game Bar で「プレイ中にバックグラウンドで録画する」を
              有効にし、保存する長さ（直近何秒分か）を設定しておきます。
              <span className="mono">BugReportTrigger</span> にはこの録画フォルダ（既定で
              <span className="mono"> %USERPROFILE%\Videos\Captures</span>）から最新の動画を
              自動で見つける仕組み（<span className="mono">ReplayFolderWatcher</span>）が
              標準で組み込まれているため、追加コードは不要です。
            </p>
          </li>

          <li>
            <h2>6. バグを見つけたら2つのキーを押す</h2>
            <p>
              まず <span className="mono">Win + Alt + G</span>{' '}
              でOS側に直近の録画を保存させ、続けて<span className="mono">BugReportTrigger</span>の
              ホットキー（既定は<span className="mono"> F12</span>）を押します。直近の入力ログと、
              いま保存された録画動画がまとめて送信され、このWebアプリのプロジェクト内バグ一覧に
              「未対応」として現れます。
            </p>
            <p>
              タイトルやタグをQA担当者に入力させたい場合は、
              <span className="mono">BugReportTrigger.SubmitReport(...)</span>
              を自前のUIから呼び出す形に差し替えられます。ShadowPlayやReLiveなど別の録画ツールを
              使う場合は、それぞれの保存先フォルダを<span className="mono">replayWatcher</span>に
              追加してください。
            </p>
          </li>
        </ol>

        <p className="help-footer-note">
          より詳しい技術仕様は <span className="mono">unity-sdk/README.md</span> と
          <span className="mono"> docs/api-spec.md</span> を参照してください。
        </p>
      </div>
    </main>
  )
}
