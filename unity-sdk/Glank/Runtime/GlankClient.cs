using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace Glank
{
    /// <summary>
    /// 送信結果の種類。オフラインキュー（<see cref="GlankOfflineQueue"/>）が
    /// 「後で再送すれば直る可能性がある失敗」と「送っても直らない失敗」を区別するために使う。
    /// </summary>
    public enum GlankSubmitOutcome
    {
        /// <summary>送信成功。</summary>
        Success,

        /// <summary>ネットワーク断・タイムアウト・サーバー側の一時的な問題（5xx等）。後で再送すれば成功しうる。</summary>
        RetryableFailure,

        /// <summary>不正なリクエスト（4xx）や動画ファイルの読み込み失敗等。再送しても直らない。</summary>
        PermanentFailure,
    }

    /// <summary>
    /// docs/api-spec.md 3.4 `POST /reports` への送信。呼び出し側の MonoBehaviour から
    /// StartCoroutine(GlankClient.SubmitReport(...)) で実行する。
    /// </summary>
    public static class GlankClient
    {
        public static IEnumerator SubmitReport(
            GlankConfig config,
            ReportMetadata metadata,
            string videoFilePath,
            Action<GlankSubmitOutcome, string> onComplete)
        {
            byte[] videoBytes;
            try
            {
                videoBytes = File.ReadAllBytes(videoFilePath);
            }
            catch (Exception e)
            {
                // ファイルが読めないのは再送しても直らない（キューに残しても永遠に失敗し続けるだけ）。
                onComplete?.Invoke(GlankSubmitOutcome.PermanentFailure, $"video read failed: {e.Message}");
                yield break;
            }

            var form = new List<IMultipartFormSection>
            {
                new MultipartFormDataSection("metadata", JsonUtility.ToJson(metadata)),
                new MultipartFormFileSection("video", videoBytes, Path.GetFileName(videoFilePath), "video/mp4"),
            };

            using (var request = UnityWebRequest.Post($"{config.baseUrl}/reports", form))
            {
                if (!string.IsNullOrEmpty(config.apiKey))
                {
                    request.SetRequestHeader("X-Glank-Key", config.apiKey);
                }

                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    onComplete?.Invoke(GlankSubmitOutcome.Success, request.downloadHandler.text);
                    yield break;
                }

                string body = request.downloadHandler != null ? request.downloadHandler.text : "";
                string message = $"{request.responseCode} {request.error} {body}";

                // ConnectionError（サーバーに届いていない）や5xx（サーバー側の一時的な問題）は
                // 再送で直る可能性がある。4xx（ProtocolErrorのうちレスポンスが返ってきているもの）は
                // リクエスト自体が悪いので、再送してもまた同じ理由で失敗するだけ。
                bool isRetryable = request.result == UnityWebRequest.Result.ConnectionError
                    || request.responseCode == 0
                    || request.responseCode >= 500;

                onComplete?.Invoke(
                    isRetryable ? GlankSubmitOutcome.RetryableFailure : GlankSubmitOutcome.PermanentFailure,
                    message
                );
            }
        }
    }
}
