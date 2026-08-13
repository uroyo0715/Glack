import React, { useState } from 'react'
import SegmentedToggle from '../components/SegmentedToggle.jsx'
import { sdkDownloadUrl } from '../api/index.js'

function SdkDownloadButton({ engine, label }) {
  const url = sdkDownloadUrl(engine)
  if (!url) return null
  return (
    <a className="sdk-download-button" href={url} download>
      {label}をダウンロード（zip）
    </a>
  )
}

function UnityGuide() {
  return (
    <ol className="help-steps">
      <li>
        <h2>1. このWebアプリでプロジェクトを作成する</h2>
        <p>
          プロジェクト一覧画面の「新規プロジェクト」から、タイトル・ティザー画像（任意）・
          使用ゲームエンジン（Unity）を指定して作成します。作成されたプロジェクトカードに表示される
          <span className="mono">ID: 3</span> のような番号が、Unity側の設定で使うプロジェクトIDです。
        </p>
      </li>

      <li>
        <h2>2. Unity側にGlank SDKを導入する</h2>
        <p>
          下のボタンからSDK一式をダウンロードし、展開してできる<span className="mono">Glank</span>
          フォルダごと、対象UnityプロジェクトのAssetsフォルダ内の
          <span className="mono">Packages/</span> フォルダの下に置きます。または、Unityの
          Package Managerで「Add package from disk...」を選び、フォルダ内の
          <span className="mono">package.json</span> を指定しても導入できます。外部パッケージへの
          依存はないため、これだけで組み込み完了です。
        </p>
        <SdkDownloadButton engine="unity" label="Unity SDK" />
      </li>

      <li>
        <h2>3. 接続設定（GlankConfig）を作る</h2>
        <p>
          Unityのメニューから <span className="mono">Assets &gt; Create &gt; Glank &gt; Config</span>{' '}
          でScriptableObjectを作成し、次の3項目を設定します。
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
                サーバー側の<span className="mono">GLANK_API_KEY</span>環境変数と同じ値。
                サーバー側で未設定なら、ここも空欄のままでよい（開発中は認証をスキップできる）
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
          シーン内の任意のGameObjectに <span className="mono">InputLogRecorder</span> と
          <span className="mono"> BugReportTrigger</span> の2つをアタッチします。
          <span className="mono">BugReportTrigger</span> の <span className="mono">config</span>{' '}
          欄に、手順3で作った設定を割り当ててください。
          <span className="mono">InputLogRecorder</span> の <span className="mono">watchedKeys</span>{' '}
          には、ログに残したい入力キーを登録します。
        </p>
      </li>

      <li>
        <h2>5. 動画の取得方法を選ぶ</h2>
        <p>
          <strong>推奨: </strong>
          <span className="mono">InstantReplayVideoRecorder</span> を追加すると、ゲーム自身が
          直近n秒のプレイをリングバッファで保持しておき、バグ報告のタイミングで
          プラットフォームネイティブのハードウェアエンコーダーでmp4として書き出します。
          プレイヤーがOSの録画機能を事前に有効化していなくても動画が残るのが利点です。導入手順は
          <span className="mono">unity-sdk/README.md</span>の「動画録画について」を参照してください。
        </p>
        <p>
          これを追加しない場合でも、Windowsの<strong>Xbox Game Bar</strong>（背景録画）や
          <strong>NVIDIA ShadowPlay</strong>、<strong>AMD ReLive</strong>
          といったOS標準のインスタントリプレイ機能を利用する
          <span className="mono">ReplayFolderWatcher</span>
          がフォールバックとして標準で組み込まれており、追加コードは不要です。ただしこの場合、
          プレイヤー側で事前にOSの録画機能を有効にしておく必要があります。
        </p>
      </li>

      <li>
        <h2>6. バグを見つけたらホットキーを押す</h2>
        <p>
          <span className="mono">BugReportTrigger</span>のホットキー（既定は
          <span className="mono"> F12</span>）を押すと、直近の入力ログと動画がまとめて自動送信され、
          このWebアプリのプロジェクト内バグ一覧に「未対応」として表示されます。
          <span className="mono">ReplayFolderWatcher</span>のみを使っている場合は、ホットキーを押す前に
          <span className="mono">Win + Alt + G</span>を押してOS側に直近の録画を保存しておいてください。
        </p>
        <p>
          タイトルやタグをQA担当者に入力させてから送信したい場合は、
          <span className="mono">GlankReportPromptUI</span>を使うと、ホットキー即送信の代わりに
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
          プロジェクト一覧画面の「新規プロジェクト」から、タイトル・ティザー画像（任意）・
          使用ゲームエンジン（Godot）を指定して作成します。作成されたプロジェクトカードに表示される
          <span className="mono">ID: 3</span> のような番号が、Godot側の設定で使うプロジェクトIDです。
        </p>
      </li>

      <li>
        <h2>2. Godot側にGlank SDKを導入する</h2>
        <p>
          下のボタンからSDK一式をダウンロードし、展開してできる<span className="mono">glank</span>
          フォルダごと、対象Godotプロジェクトの<span className="mono">addons/glank</span>
          に置きます。続けてGodotエディタで
          <span className="mono">プロジェクト &gt; プロジェクト設定 &gt; プラグイン</span>{' '}
          を開き、「Glank Bug Report SDK」を有効化してください（Godot 4系を想定）。
        </p>
        <SdkDownloadButton engine="godot" label="Godot SDK" />
      </li>

      <li>
        <h2>3. 接続設定（GlankConfig）を作る</h2>
        <p>
          FileSystemドックを右クリック &gt; <span className="mono">New Resource &gt; GlankConfig</span>{' '}
          でリソースを作成し、次の3項目を設定します。
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
                サーバー側の<span className="mono">GLANK_API_KEY</span>環境変数と同じ値。
                サーバー側で未設定なら、ここも空欄のままでよい（開発中は認証をスキップできる）
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
          シーン内の任意のNodeに <span className="mono">InputLogRecorder</span> と
          <span className="mono"> BugReportTrigger</span> の2つをアタッチします。
          <span className="mono">BugReportTrigger</span> の <span className="mono">config</span>{' '}
          欄に、手順3で作った設定を割り当ててください。
          <span className="mono">InputLogRecorder</span> の <span className="mono">watched_keys</span>
          （<span className="mono">GlankWatchedKey</span>リソースの配列）には、ログに残したい
          入力キーを登録します。
        </p>
      </li>

      <li>
        <h2>5. 動画はOSのインスタントリプレイ機能に任せる</h2>
        <p>
          Unity版が使っている<span className="mono">InstantReplayVideoRecorder</span>（自前で
          リングバッファ録画をmp4に書き出す仕組み）に相当する、信頼できるOSSがGodotでは
          見つからなかったため、Godot版は<span className="mono">ReplayFolderWatcher</span>
          （Windowsの<strong>Xbox Game Bar</strong>や<strong>NVIDIA ShadowPlay</strong>、
          <strong>AMD ReLive</strong>といったOS標準のインスタントリプレイ機能の出力フォルダを
          監視する仕組み）のみを提供します。そのため、プレイヤー側で事前にOSの録画機能を
          有効にしておく必要があります。詳細は
          <span className="mono">godot-sdk/README.md</span>を参照してください。
        </p>
      </li>

      <li>
        <h2>6. バグを見つけたら2つのキーを押す</h2>
        <p>
          まず <span className="mono">Win + Alt + G</span> を押してOS側に直近の録画を保存させ、
          続けて<span className="mono">BugReportTrigger</span>のホットキー（既定は
          <span className="mono"> F12</span>）を押します。直近の入力ログと、いま保存された
          録画動画がまとめて自動送信され、このWebアプリのプロジェクト内バグ一覧に「未対応」として
          表示されます。
        </p>
        <p>
          タイトルやタグをQA担当者に入力させてから送信したい場合は、
          <span className="mono">GlankReportPromptUI</span>を使うと、ホットキー即送信の代わりに
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
