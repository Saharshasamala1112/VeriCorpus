from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.services.media_processors import (
    MediaProcessor,
    ProcessingContext,
    ProcessingResult,
    register_processor,
)

SUPPORTED_VIDEO_FORMATS = {
    "video/mp4",
    "video/x-msvideo",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
}
SUPPORTED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv"}


class VideoProcessor(MediaProcessor):
    modality = "video"

    async def validate(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        if not path.exists():
            return ProcessingResult(success=False, errors=["File not found"])

        if ctx.file_size == 0:
            return ProcessingResult(success=False, errors=["Empty file"])

        max_size = 2 * 1024 * 1024 * 1024  # 2GB
        if ctx.file_size > max_size:
            return ProcessingResult(
                success=False,
                errors=[f"Video file too large: {ctx.file_size} bytes (max {max_size})"],
            )

        ext = path.suffix.lower()
        if ext and ext not in SUPPORTED_EXTENSIONS:
            return ProcessingResult(
                success=False,
                errors=[f"Unsupported video format: {ext}"],
            )

        return ProcessingResult(success=True)

    async def extract_metadata(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        try:
            import subprocess

            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(path)],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode == 0:
                probe = json.loads(result.stdout)
                format_info = probe.get("format", {})
                streams = probe.get("streams", [])

                video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
                audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

                fps_str = video_stream.get("r_frame_rate", "0/1")
                fps = 0.0
                if "/" in fps_str:
                    num, den = fps_str.split("/")
                    if int(den) > 0:
                        fps = round(int(num) / int(den), 2)

                metadata = {
                    "duration_seconds": float(format_info.get("duration", 0)),
                    "width": int(video_stream.get("width", 0)),
                    "height": int(video_stream.get("height", 0)),
                    "video_codec": video_stream.get("codec_name", "unknown"),
                    "fps": fps,
                    "bit_rate": int(format_info.get("bit_rate", 0)),
                    "format_name": format_info.get("format_name", "unknown"),
                    "file_size_bytes": int(format_info.get("size", 0)),
                    "has_audio_stream": audio_stream is not None and bool(audio_stream),
                    "audio_codec": audio_stream.get("codec_name") if audio_stream else None,
                    "audio_sample_rate": int(audio_stream.get("sample_rate", 0)) if audio_stream else 0,
                    "audio_channels": int(audio_stream.get("channels", 0)) if audio_stream else 0,
                    "stream_count": len(streams),
                }
                ctx.metadata.update(metadata)
                return ProcessingResult(success=True, metadata=metadata)

        except FileNotFoundError:
            pass
        except Exception:
            pass

        return await self._extract_basic_info(ctx)

    async def _extract_basic_info(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        try:
            with open(path, "rb") as f:
                data = f.read(64)
            ext = path.suffix.lower()
            metadata: dict = {"codec": ext.lstrip("."), "has_audio_stream": False}

            if len(data) >= 12:
                if data[:4] == b"\x00\x00\x00\x1c" and data[4:8] == b"ftyp":
                    metadata["codec"] = "mp4"
                elif data[:3] == b"RIFF" and data[8:12] == b"AVI ":
                    metadata["codec"] = "avi"
                elif data[:4] == b"\x1a\x45\xdf\xa3":
                    metadata["codec"] = "mkv/webm"
                elif data[:4] == b"\x00\x00\x00\x20" and data[4:8] == b"ftyp":
                    metadata["codec"] = "mp4"

            ctx.metadata.update(metadata)
            return ProcessingResult(success=True, metadata=metadata)

        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to extract video header: {e}"])

    async def normalize(self, ctx: ProcessingContext) -> ProcessingResult:
        """Normalize video to MP4/H.264 format using ffmpeg if available."""
        path = Path(ctx.file_path)
        ext = path.suffix.lower()

        if ext == ".mp4":
            ctx.metadata["normalized_path"] = str(path)
            return ProcessingResult(success=True, normalized_path=str(path))

        try:
            import subprocess

            normalized_path = ctx.file_path + ".normalized.mp4"
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(path),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-crf",
                    "23",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-movflags",
                    "+faststart",
                    normalized_path,
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode == 0:
                ctx.metadata["normalized_path"] = normalized_path
                return ProcessingResult(success=True, normalized_path=normalized_path)

        except FileNotFoundError:
            pass
        except Exception:
            pass

        ctx.metadata["normalized_path"] = str(path)
        return ProcessingResult(success=True, normalized_path=str(path))

    async def preprocess(self, ctx: ProcessingContext) -> ProcessingResult:
        """No-op for video preprocessing. Frame extraction is done on demand."""
        ctx.metadata["preprocessed_path"] = ctx.metadata.get("normalized_path", ctx.file_path)
        return ProcessingResult(success=True)

    async def extract_features(self, ctx: ProcessingContext) -> ProcessingResult:
        """Extract video features: resolution class, duration, frame statistics."""
        metadata = ctx.metadata
        width = metadata.get("width", 0)
        height = metadata.get("height", 0)
        duration = metadata.get("duration_seconds", 0.0)
        fps = metadata.get("fps", 0.0)

        resolution_class = "unknown"
        if width > 0 and height > 0:
            pixels = width * height
            if pixels >= 3840 * 2160:
                resolution_class = "4K"
            elif pixels >= 1920 * 1080:
                resolution_class = "1080p"
            elif pixels >= 1280 * 720:
                resolution_class = "720p"
            elif pixels >= 640 * 480:
                resolution_class = "480p"
            else:
                resolution_class = "SD"

        features = {
            "resolution_class": resolution_class,
            "width": width,
            "height": height,
            "fps": fps,
            "duration_seconds": round(duration, 2),
            "total_frames": int(duration * fps) if fps > 0 else 0,
            "file_hash": hashlib.sha256(Path(ctx.file_path).read_bytes()[:8192]).hexdigest(),
        }
        ctx.features.update(features)
        return ProcessingResult(success=True, features=features)

    async def parse_structure(self, ctx: ProcessingContext) -> ProcessingResult:
        duration = float(ctx.metadata.get("duration_seconds", 0.0) or 0.0)
        segment_length = 10.0
        segments = [
            {"start_seconds": start, "end_seconds": min(start + segment_length, duration)}
            for start in range(0, int(duration), int(segment_length))
        ]
        structure = {
            "temporal_segments": segments,
            "scene_detection_status": "not_configured",
            "representative_frames_status": "available_on_demand",
            "audio_extraction_status": "available_via_ffmpeg",
            "visual_embedding_status": "not_configured",
        }
        ctx.metadata["structure"] = structure
        return ProcessingResult(success=True, metadata={"structure": structure})

    async def extract_frames(
        self, ctx: ProcessingContext, timestamps: list[float] | None = None, max_frames: int = 10
    ) -> ProcessingResult:
        """Extract frames from video at specified timestamps or at regular intervals.

        This is an on-demand operation, not part of the standard pipeline.
        """
        path = Path(ctx.metadata.get("normalized_path", ctx.file_path))
        duration = ctx.metadata.get("duration_seconds", 0.0)

        if not timestamps and duration > 0:
            interval = duration / max(max_frames, 1)
            timestamps = [i * interval for i in range(min(max_frames, int(duration / max(interval, 0.1))))]

        if not timestamps:
            return ProcessingResult(success=True, features={"frames_extracted": 0})

        output_dir = Path(ctx.file_path).parent / "frames"
        output_dir.mkdir(parents=True, exist_ok=True)

        extracted = []
        try:
            import subprocess

            for i, ts in enumerate(timestamps):
                out_path = output_dir / f"frame_{i:04d}.jpg"
                result = subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-ss",
                        str(ts),
                        "-i",
                        str(path),
                        "-frames:v",
                        "1",
                        "-q:v",
                        "2",
                        str(out_path),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if result.returncode == 0 and out_path.exists():
                    extracted.append(str(out_path))

        except (FileNotFoundError, Exception):
            pass

        return ProcessingResult(
            success=True,
            features={"frames_extracted": len(extracted), "frame_paths": extracted},
        )


register_processor("video", VideoProcessor)
