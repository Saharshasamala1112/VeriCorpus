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

SUPPORTED_AUDIO_FORMATS = {
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/flac",
    "audio/mp4",
    "audio/aac",
}
SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"}


class AudioProcessor(MediaProcessor):
    modality = "audio"

    async def validate(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        if not path.exists():
            return ProcessingResult(success=False, errors=["File not found"])

        if ctx.file_size == 0:
            return ProcessingResult(success=False, errors=["Empty file"])

        max_size = 200 * 1024 * 1024  # 200MB
        if ctx.file_size > max_size:
            return ProcessingResult(
                success=False,
                errors=[f"Audio file too large: {ctx.file_size} bytes (max {max_size})"],
            )

        ext = path.suffix.lower()
        if ext and ext not in SUPPORTED_EXTENSIONS:
            return ProcessingResult(
                success=False,
                errors=[f"Unsupported audio format: {ext}"],
            )

        # Basic corruption check: file should have some minimum size
        if ctx.file_size < 100:
            return ProcessingResult(
                success=False,
                errors=["File too small to be a valid audio file"],
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
                timeout=30,
            )
            if result.returncode == 0:
                probe = json.loads(result.stdout)
                format_info = probe.get("format", {})
                streams = probe.get("streams", [])
                audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

                metadata = {
                    "duration_seconds": float(format_info.get("duration", 0)),
                    "sample_rate": int(audio_stream.get("sample_rate", 0)),
                    "channels": int(audio_stream.get("channels", 0)),
                    "codec": audio_stream.get("codec_name", "unknown"),
                    "bit_rate": int(format_info.get("bit_rate", 0)),
                    "format_name": format_info.get("format_name", "unknown"),
                    "file_size_bytes": int(format_info.get("size", 0)),
                }
                ctx.metadata.update(metadata)
                return ProcessingResult(success=True, metadata=metadata)

        except FileNotFoundError:
            pass
        except Exception:
            pass

        # Fallback: extract basic info from file header
        return await self._extract_header_info(ctx)

    async def _extract_header_info(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        try:
            data = path.read_bytes()
            ext = path.suffix.lower()

            metadata: dict = {"duration_seconds": 0.0, "sample_rate": 0, "channels": 0, "codec": ext.lstrip(".")}

            if ext in (".mp3",) and len(data) >= 4:
                if data[:3] == b"ID3":
                    metadata["codec"] = "mp3"
                elif data[:2] == b"\xff\xfb" or data[:2] == b"\xff\xf3":
                    metadata["codec"] = "mp3"

            elif ext in (".wav",) and len(data) >= 44:
                if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
                    import struct

                    channels = struct.unpack_from("<H", data, 22)[0]
                    sample_rate = struct.unpack_from("<I", data, 24)[0]
                    metadata["channels"] = channels
                    metadata["sample_rate"] = sample_rate
                    metadata["codec"] = "wav"

            elif ext in (".ogg",) and len(data) >= 4:
                if data[:4] == b"OggS":
                    metadata["codec"] = "ogg"

            elif ext in (".flac",) and len(data) >= 4:
                if data[:4] == b"fLaC":
                    metadata["codec"] = "flac"

            ctx.metadata.update(metadata)
            return ProcessingResult(success=True, metadata=metadata)

        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to extract audio header info: {e}"])

    async def normalize(self, ctx: ProcessingContext) -> ProcessingResult:
        """Normalize audio to WAV format using ffmpeg if available."""
        path = Path(ctx.file_path)
        ext = path.suffix.lower()

        if ext == ".wav":
            ctx.metadata["normalized_path"] = str(path)
            return ProcessingResult(success=True, normalized_path=str(path))

        try:
            import subprocess

            normalized_path = ctx.file_path + ".normalized.wav"
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(path),
                    "-acodec",
                    "pcm_s16le",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    normalized_path,
                ],
                capture_output=True,
                text=True,
                timeout=60,
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
        normalized_path = ctx.metadata.get("normalized_path", ctx.file_path)
        try:
            import subprocess

            preprocessed_path = ctx.file_path + ".preprocessed.wav"
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    normalized_path,
                    "-af",
                    "highpass=f=80,lowpass=f=8000,aresample=16000",
                    "-acodec",
                    "pcm_s16le",
                    "-ac",
                    "1",
                    preprocessed_path,
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode == 0:
                ctx.metadata["preprocessed_path"] = preprocessed_path
                return ProcessingResult(success=True, normalized_path=preprocessed_path)

        except (FileNotFoundError, Exception):
            pass

        ctx.metadata["preprocessed_path"] = normalized_path
        return ProcessingResult(success=True, normalized_path=normalized_path)

    async def extract_features(self, ctx: ProcessingContext) -> ProcessingResult:
        """Extract audio features: waveform stats, spectral info."""
        path = Path(ctx.metadata.get("preprocessed_path", ctx.file_path))
        try:
            import struct

            data = path.read_bytes()

            if len(data) < 44:
                return ProcessingResult(success=True, features={"file_hash": hashlib.sha256(data).hexdigest()})

            # For WAV files, read sample data
            if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
                bits_per_sample = struct.unpack_from("<H", data, 34)[0]
                data_offset = 44
                sample_data = data[data_offset:]

                if bits_per_sample == 16:
                    samples: list[int] = list(struct.unpack(f"<{len(sample_data) // 2}h", sample_data))
                elif bits_per_sample == 8:
                    samples = [b - 128 for b in sample_data]
                else:
                    samples = []

                if samples:
                    import math

                    n = len(samples)
                    mean_val = sum(samples) / n
                    variance = sum((s - mean_val) ** 2 for s in samples) / n
                    rms = math.sqrt(variance + mean_val**2)
                    peak = max(abs(s) for s in samples)

                    # Zero crossing rate
                    zcr = sum(1 for i in range(1, n) if (samples[i] >= 0) != (samples[i - 1] >= 0)) / n

                    features = {
                        "sample_count": n,
                        "rms_amplitude": round(rms / 32768, 6) if bits_per_sample == 16 else round(rms / 128, 6),
                        "peak_amplitude": round(peak / 32768, 6) if bits_per_sample == 16 else round(peak / 128, 6),
                        "zero_crossing_rate": round(zcr, 4),
                        "dynamic_range": round(20 * math.log10(max(peak, 1) / max(rms, 1)), 2),
                        "file_hash": hashlib.sha256(data).hexdigest(),
                    }
                    ctx.features.update(features)
                    return ProcessingResult(success=True, features=features)

            # Generic fallback
            features = {
                "file_size": len(data),
                "file_hash": hashlib.sha256(data).hexdigest(),
            }
            ctx.features.update(features)
            return ProcessingResult(success=True, features=features)

        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to extract audio features: {e}"])

    async def parse_structure(self, ctx: ProcessingContext) -> ProcessingResult:
        structure = {
            "duration_seconds": ctx.metadata.get("duration_seconds", 0.0),
            "sample_rate": ctx.metadata.get("sample_rate", 0),
            "channels": ctx.metadata.get("channels", 0),
            "spectrogram_status": "not_configured",
            "transcription_status": "not_configured",
            "audio_embedding_status": "not_configured",
        }
        ctx.metadata["structure"] = structure
        return ProcessingResult(success=True, metadata={"structure": structure})


register_processor("audio", AudioProcessor)
