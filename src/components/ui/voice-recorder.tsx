"use client";

import * as React from "react";
import { Mic, MicOff, Square, Trash2, Loader2, Play, Pause, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

// ============================================================
// Voice Recorder Component
// ============================================================

export interface VoiceRecorderProps {
  /** Callback with the final transcription text */
  onTranscription?: (text: string) => void;
  /** Purpose hint for STT optimization */
  purpose?: "property" | "client";
  /** Allow user to edit transcription before confirming */
  editable?: boolean;
  /** Custom class */
  className?: string;
}

export function VoiceRecorder({
  onTranscription,
  purpose,
  editable = true,
  className,
}: VoiceRecorderProps) {
  const recorder = useVoiceRecorder();
  const [editedText, setEditedText] = React.useState("");
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Sync editing text when transcription arrives
  React.useEffect(() => {
    if (recorder.transcription) {
      setEditedText(recorder.transcription);
    }
  }, [recorder.transcription]);

  const handleTranscribe = async () => {
    try {
      const text = await recorder.transcribe(purpose);
      onTranscription?.(text);
    } catch {
      // Error handled by hook state
    }
  };

  const handleConfirm = () => {
    const finalText = editable ? editedText : (recorder.transcription ?? "");
    onTranscription?.(finalText);
  };

  const handlePlayPause = () => {
    if (!recorder.audioUrl || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioEnded = () => setIsPlaying(false);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Hidden audio element for playback */}
      {recorder.audioUrl && (
        <audio
          ref={audioRef}
          src={recorder.audioUrl}
          onEnded={handleAudioEnded}
          className="hidden"
        />
      )}

      {/* Status: Idle */}
      {recorder.status === "idle" && (
        <button
          type="button"
          onClick={recorder.startRecording}
          className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors w-full justify-center"
        >
          <Mic className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">点击开始录音</span>
        </button>
      )}

      {/* Status: Recording */}
      {recorder.status === "recording" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center">
                <Mic className="h-5 w-5 text-white animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                正在录音...
              </p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70">
                剩余 {formatTime(recorder.remainingSeconds)}
              </p>
            </div>
            <button
              type="button"
              onClick={recorder.stopRecording}
              className="flex-shrink-0 h-10 w-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
              aria-label="停止录音"
            >
              <Square className="h-4 w-4 text-white" />
            </button>
          </div>
          {/* Duration bar */}
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-red-500 transition-all duration-300"
              style={{
                width: `${(recorder.durationSeconds / recorder.maxDuration) * 100}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            最长录音 {recorder.maxDuration} 秒，到时自动停止
          </p>
        </div>
      )}

      {/* Status: Recorded (ready to transcribe or re-record) */}
      {recorder.status === "recorded" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800">
            <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
              <Mic className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                录音完成
              </p>
              <p className="text-xs text-green-600/70 dark:text-green-400/70">
                时长 {formatTime(recorder.durationSeconds)}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePlayPause}
              className="flex-shrink-0 h-10 w-10 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
              aria-label={isPlaying ? "暂停" : "试听"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 text-white" />
              ) : (
                <Play className="h-4 w-4 text-white" />
              )}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={recorder.cancelRecording}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-muted-foreground/20 hover:bg-muted text-sm transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
            <button
              type="button"
              onClick={recorder.startRecording}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-muted-foreground/20 hover:bg-muted text-sm transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              重录
            </button>
            <button
              type="button"
              onClick={handleTranscribe}
              className="flex-[2] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
            >
              转写为文字
            </button>
          </div>
        </div>
      )}

      {/* Status: Uploading / Transcribing */}
      {(recorder.status === "uploading" ||
        recorder.status === "transcribing") && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {recorder.status === "uploading" ? "上传录音中..." : "语音转写中..."}
            </p>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
              请稍候
            </p>
          </div>
        </div>
      )}

      {/* Status: Transcribed (show text with optional editing) */}
      {recorder.status === "transcribed" && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-green-500" />
              <p className="text-xs font-medium text-green-700 dark:text-green-300">
                转写完成
              </p>
            </div>
            {editable ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full min-h-[80px] p-2 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-green-950/30 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="编辑转写结果..."
              />
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {recorder.transcription}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={recorder.reset}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-muted-foreground/20 hover:bg-muted text-sm transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              重新录音
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-[2] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
            >
              <Check className="h-4 w-4" />
              确认使用
            </button>
          </div>
        </div>
      )}

      {/* Status: Failed */}
      {recorder.status === "failed" && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
          <div className="flex items-center gap-2">
            <MicOff className="h-4 w-4 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              {recorder.error ?? "录音或转写失败"}
            </p>
          </div>
          <button
            type="button"
            onClick={recorder.reset}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-muted-foreground/20 hover:bg-muted text-sm transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        </div>
      )}

      {/* Status: Cancelled — transitions back to idle */}
      {recorder.status === "cancelled" && (
        <button
          type="button"
          onClick={recorder.startRecording}
          className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors w-full justify-center"
        >
          <Mic className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">点击开始录音</span>
        </button>
      )}
    </div>
  );
}
