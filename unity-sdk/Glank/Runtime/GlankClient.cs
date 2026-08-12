using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace Glank
{
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
            Action<bool, string> onComplete)
        {
            byte[] videoBytes;
            try
            {
                videoBytes = File.ReadAllBytes(videoFilePath);
            }
            catch (Exception e)
            {
                onComplete?.Invoke(false, $"video read failed: {e.Message}");
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

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string body = request.downloadHandler != null ? request.downloadHandler.text : "";
                    onComplete?.Invoke(false, $"{request.responseCode} {request.error} {body}");
                }
                else
                {
                    onComplete?.Invoke(true, request.downloadHandler.text);
                }
            }
        }
    }
}
