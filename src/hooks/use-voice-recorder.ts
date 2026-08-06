"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ============================================================
// Voice Recorder Hook
// ============================================================

export type RecorderStatus =
  | "idle"
  | "recording"
  | "recorded"
  | "uploading"
  | "transcribing"
  | "transcribed"
  | "failed"
  | "cancelled";

export interface VoiceRecorderState {
  status: RecorderStatus;
  durationSeconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  transcription: string | null;
  error: string | null;
}

const MAX_DURATION_SECONDS = 60;

// Polyfill for browsers that don't support preferred MIME types
function getSupportedMimeType(): string {
  const types = [
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-m4a",
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm"; // fallback, may not work everywhere
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>({
    status: "idle",
    durationSeconds: 0,
    audioBlob: null,
    audioUrl: null,
    transcription: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (state.audioUrl) {
        URL.revokeObjectURL(state.audioUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(async () => {
    cleanup();

    // Revoke previous audio URL
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const duration = (Date.now() - startTimeRef.current) / 1000;

        setState((prev) => ({
          ...prev,
          status: "recorded",
          durationSeconds: Math.min(duration, MAX_DURATION_SECONDS),
          audioBlob: blob,
          audioUrl: url,
        }));

        // Stop timer and auto-stop
        if (timerRef.current) clearInterval(timerRef.current);
        if (autoStopRef.current) clearTimeout(autoStopRef.current);

        // Stop stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // collect data every 100ms

      // Start duration timer
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setState((prev) => ({
          ...prev,
          durationSeconds: Math.min(elapsed, MAX_DURATION_SECONDS),
        }));
      }, 100);

      // Auto-stop at 60 seconds
      autoStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_DURATION_SECONDS * 1000);

      setState((prev) => ({
        ...prev,
        status: "recording",
        durationSeconds: 0,
        audioBlob: null,
        audioUrl: null,
        transcription: null,
        error: null,
      }));
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在浏览器设置中允许麦克风访问"
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "未检测到麦克风设备"
            : "无法启动录音";

      setState((prev) => ({
        ...prev,
        status: "failed",
        error: message,
      }));
    }
  }, [cleanup, state.audioUrl]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    cleanup();
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }
    setState({
      status: "cancelled",
      durationSeconds: 0,
      audioBlob: null,
      audioUrl: null,
      transcription: null,
      error: null,
    });
  }, [cleanup, state.audioUrl]);

  const reset = useCallback(() => {
    cleanup();
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }
    setState({
      status: "idle",
      durationSeconds: 0,
      audioBlob: null,
      audioUrl: null,
      transcription: null,
      error: null,
    });
  }, [cleanup, state.audioUrl]);

  /**
   * Upload the recorded audio to the STT API.
   * Returns the transcription text, or throws on error.
   */
  const transcribe = useCallback(
    async (purpose?: "property" | "client"): Promise<string> => {
      if (!state.audioBlob) {
        throw new Error("没有可用的录音");
      }

      setState((prev) => ({ ...prev, status: "uploading", error: null }));

      try {
        const formData = new FormData();
        formData.append(
          "audio",
          state.audioBlob,
          `recording.${state.audioBlob.type.includes("webm") ? "webm" : "mp4"}`
        );
        if (purpose) formData.append("purpose", purpose);
        formData.append("language", "zh");
        formData.append("requestId", crypto.randomUUID());
        formData.append("duration", String(Math.round(state.durationSeconds)));

        setState((prev) => ({ ...prev, status: "transcribing" }));

        const response = await fetch("/api/ai/transcribe", {
          method: "POST",
          body: formData,
        });

        const body = await response.json();

        if (!response.ok || body.error) {
          const errorMsg = body.error?.message ?? "转写失败";
          setState((prev) => ({
            ...prev,
            status: "failed",
            error: errorMsg,
          }));
          throw new Error(errorMsg);
        }

        const text: string = body.data?.text ?? "";

        setState((prev) => ({
          ...prev,
          status: "transcribed",
          transcription: text,
        }));

        return text;
      } catch (err) {
        if (err instanceof Error && state.status === "failed") {
          // Error already set by the response handler above
          throw err;
        }
        const message =
          err instanceof Error ? err.message : "网络错误，请检查连接后重试";
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: message,
        }));
        throw new Error(message);
      }
    },
    [state.audioBlob, state.status]
  );

  const remainingSeconds = Math.max(
    0,
    MAX_DURATION_SECONDS - state.durationSeconds
  );

  return {
    ...state,
    remainingSeconds,
    maxDuration: MAX_DURATION_SECONDS,
    startRecording,
    stopRecording,
    cancelRecording,
    transcribe,
    reset,
  };
}
