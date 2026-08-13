import React, { useState } from 'react'
import SegmentedToggle from '../components/SegmentedToggle.jsx'

function UnityGuide() {
  return (
    <ol className="help-steps">
      <li>
        <h2>1. このWebアプリでプロジェクトを作成する</h2>
        <p>
          プロジェクト一覧画面の「新規プロジェクト」から、ゲームのタイトルとティザー画像
          （任意）、使用ゲームエンジン（Unity）を選んで作成します。作成したプロジェクトカードには
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
        <h2>5. 動画の取得方法を選ぶ</h2>
        <p>
          <strong>推奨: </strong>
          <span className="mono">InstantReplayVideoRecorder</span>{' '}
          を導入すると、ゲーム自身が直近n秒のプレイをリングバッファで保持し、トリガー時に
          プラットフォームネイティブのハードウェアエンコーダー経由でmp4として書き出します。
          プレイヤー側でOSの録画機能を事前に有効化していなくても動画が残るのが利点です。
          導入手順は<span className="mono">unity-sdk/README.md</span>の「動画録画について」を
          参照してください。
        </p>
        <p>
          導入しない場合は、Windowsの<strong>Xbox Game Bar</strong>（背景録画）や
          <strong>NVIDIA ShadowPlay</strong>、<strong>AMD ReLive</strong>
          といったOS標準のインスタントリプレイ機能に録画を任せる
          <span className="mono">ReplayFolderWatcher</span>
          がフォールバックとして標準で組み込まれています（追加コード不要）。この場合、
          プレイヤーは事前にOS側の録画機能を有効にしておく必要があります。
        </p>
      </li>

      <li>
        <h2>6. バグを見つけたらホットキーを押す</h2>
        <p>
          <span className="mono">BugReportTrigger</span>のホットキー（既定は
          <span className="mono"> F12</span>）を押すと、直近の入力ログと動画がまとめて送信され、
          このWebアプリのプロジェクト内バグ一覧に「未対応」として現れます
          （<span className="mono">ReplayFolderWatcher</span>のみを使う場合は、先に
          <span className="mono">Win + Alt + G</span>でOS側に直近の録画を保存してからホットキーを
          押してください）。
        </p>
        <p>
          タイトルやタグをQA担当者に入力させたい場合は、
          <span className="mono">GlankReportPromptUI</span>を使うと、ホットキーで即送信する代わりに
          簡易フォームを開けます。
        </p>
      </li>
    </ol>
  )
}

function GodotGuide() {
  return (
    <ol className="help-steps">
      <li>
        <h2>1. このWebアプリでプロジェクトを作成する</h2>
        <p>
          プロジェクト一覧画面の「新規プロジェクト」から、ゲームのタイトルとティザー画像
          （任意）、使用ゲームエンジン（Godot）を選んで作成します。作成したプロジェクトカードには
          <span className="mono">ID: 3</span> のようにプロジェクトIDが表示されます。これが
          Godot側の設定で使う番号です。
        </p>
      </li>

      <li>
        <h2>2. Godot側にGlank SDKを導入する</h2>
        <p>
          リポジトリの <span className="mono">godot-sdk/addons/glank</span> フォルダを、対象の
          Godotプロジェクトの <span className="mono">addons/glank</span> にコピーします。
          Godotエディタで <span className="mono">プロジェクト &gt; プロジェクト設定 &gt; プラグイン</span>{' '}
          から「Glank Bug Report SDK」を有効化してください（Godot 4系を想定）。
        </p>
      </li>

      <li>
        <h2>3. 接続設定（GlankConfig）を作る</h2>
        <p>
          FileSystemドックを右クリック &gt; <span className="mono">New Resource &gt; GlankConfig</span>{' '}
          でリソースを作成し、以下を設定します。
        </p>
        <table className="help-table">
          <tbody>
            <tr>
              <td className="mono">base_url</td>
              <td>
                このアプリのAPIサーバーのURL。ローカル開発なら
                <span className="mono"> http://localhost:8787/api/v1</span>
              </td>
            </tr>
            <tr>
              <td className="mono">api_key</td>
              <td>
                サーバー側の<span className="mono">GLANK_API_KEY</span>
                環境変数と同じ値。未設定の間は空欄でよい（開発用に認証をスキップする）
              </td>
            </tr>
            <tr>
              <td className="mono">project_id</td>
              <td>手順1で確認したプロジェクトID</td>
            </tr>
          </tbody>
        </table>
      </li>

      <li>
        <h2>4. シーンにNodeを置く</h2>
        <p>
          任意のNodeに <span className="mono">InputLogRecorder</span> と
          <span className="mono"> BugReportTrigger</span> をアタッチし、
          <span className="mono">BugReportTrigger</span> の <span className="mono">config</span> に
          手順3で作った設定を割り当てます。
          <span className="mono">InputLogRecorder</span> には監視したいキー（
          <span className="mono">watched_keys</span>、<span className="mono">GlankWatchedKey</span>
          リソースの配列）を登録しておきます。
        </p>
      </li>

      <li>
        <h2>5. 動画はOSのインスタントリプレイ機能に任せる</h2>
        <p>
          GodotにはUnity版の<span className="mono">InstantReplayVideoRecorder</span>に相当する、
          自前でリングバッファ録画をmp4に書き出せる信頼できるOSSが見当たらなかったため、
          Godot版は現状<span className="mono">ReplayFolderWatcher</span>
          （Windowsの<strong>Xbox Game Bar</strong>や<strong>NVIDIA ShadowPlay</strong>、
          <strong>AMD ReLive</strong>といったOS標準のインスタントリプレイ機能の出力フォルダを
          検出する仕組み）のみを提供します。プレイヤーは事前にOS側の録画機能を有効にしておく
          必要があります。詳細は<span className="mono">godot-sdk/README.md</span>を参照してください。
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
          <span className="mono">GlankReportPromptUI</span>を使うと、ホットキーで即送信する代わりに
          簡易フォームを開けます。
        </p>
      </li>
    </ol>
  )
}

export default function HelpPage({ defaultEngine = 'unity' }) {
  const [engine, setEngine] = useState(defaultEngine === 'godot' ? 'godot' : 'unity')

  return (
    <main className="help-page">
      <div className="list-header">
        <div className="list-header-row">
          <h1>SDK連携の使い方</h1>
          <SegmentedToggle
            value={engine}
            onChange={setEngine}
            options={[
              { value: 'unity', label: 'Unity' },
              { value: 'godot', label: 'Godot' },
            ]}
          />
        </div>
      </div>

      <div className="help-body">
        <p className="help-lead">
          Glankは「Webアプリ側のプロジェクト」と「{engine === 'godot' ? 'Godot' : 'Unity'}
          で作っているゲーム」を<strong>プロジェクトID</strong>で紐付けます。ゲーム内でホットキーを
          押すと、直近の録画動画と入力ログが自動でこのWebアプリに送信され、一覧に表示されます。
        </p>

        {engine === 'godot' ? <GodotGuide /> : <UnityGuide />}

        <p className="help-footer-note">
          より詳しい技術仕様は{' '}
          <span className="mono">{engine === 'godot' ? 'godot-sdk/README.md' : 'unity-sdk/README.md'}</span>{' '}
          と<span className="mono"> docs/api-spec.md</span> を参照してください。
        </p>
      </div>
    </main>
  )
}
