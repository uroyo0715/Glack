using System;

namespace Glank
{
    /// <summary>InputLogRecorder.Capture() の戻り値。ReportMetadata に詰め替えて送信する。</summary>
    [Serializable]
    public class InputLogSnapshot
    {
        public int fps;
        public int durationFrames;
        public InputLogEntryDto[] inputs;
    }
}
