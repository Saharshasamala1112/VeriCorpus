from __future__ import annotations

import hashlib
from pathlib import Path

from app.services.media_processors import (
    MediaProcessor,
    ProcessingContext,
    ProcessingResult,
    register_processor,
)

SUPPORTED_IMAGE_FORMATS = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
}
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif"}


class ImageProcessor(MediaProcessor):
    modality = "image"

    async def validate(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        if not path.exists():
            return ProcessingResult(success=False, errors=["File not found"])

        if ctx.file_size == 0:
            return ProcessingResult(success=False, errors=["Empty file"])

        max_size = 100 * 1024 * 1024  # 100MB
        if ctx.file_size > max_size:
            return ProcessingResult(
                success=False,
                errors=[f"Image too large: {ctx.file_size} bytes (max {max_size})"],
            )

        ext = path.suffix.lower()
        if ext and ext not in SUPPORTED_EXTENSIONS:
            return ProcessingResult(
                success=False,
                errors=[f"Unsupported image format: {ext}"],
            )

        try:
            from PIL import Image

            img = Image.open(path)
            img.verify()
        except ImportError:
            ctx.warnings.append("Pillow not installed; skipping image verification")
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Corrupt image: {e}"])

        return ProcessingResult(success=True)

    async def extract_metadata(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        try:
            import PIL.ExifTags
            from PIL import Image

            img = Image.open(path)
            width, height = img.size
            format_name = img.format or "UNKNOWN"
            mode = img.mode

            exif_data = {}
            try:
                raw_exif = img.getexif()
                if raw_exif:
                    for tag_id, value in raw_exif.items():
                        tag_name = PIL.ExifTags.TAGS.get(tag_id, str(tag_id))
                        if isinstance(value, bytes):
                            value = value.decode("utf-8", errors="replace")[:200]
                        if isinstance(value, (int, float, str)):
                            exif_data[tag_name] = value
            except (AttributeError, Exception):
                pass

            metadata = {
                "width": width,
                "height": height,
                "format": format_name,
                "mode": mode,
                "megapixels": round(width * height / 1_000_000, 2),
                "aspect_ratio": round(width / max(height, 1), 2),
                "exif": exif_data,
                "has_exif": bool(exif_data),
            }
            ctx.metadata.update(metadata)
            return ProcessingResult(success=True, metadata=metadata)

        except ImportError:
            return ProcessingResult(
                success=False,
                errors=["Pillow not installed. Install with: pip install Pillow"],
            )
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to extract image metadata: {e}"])

    async def normalize(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.file_path)
        try:
            from PIL import Image, ImageFile

            img: ImageFile.ImageFile = Image.open(path)
            needs_normalize = img.mode not in ("RGB", "RGBA")

            if needs_normalize:
                if img.mode == "P":
                    img = img.convert("RGBA")  # type: ignore[assignment]
                elif img.mode == "CMYK":
                    img = img.convert("RGB")  # type: ignore[assignment]
                elif img.mode == "L":
                    img = img.convert("RGB")  # type: ignore[assignment]
                else:
                    img = img.convert("RGBA")  # type: ignore[assignment]

            normalized_path = ctx.file_path + ".normalized.png"
            img.save(normalized_path, "PNG", optimize=True)
            ctx.metadata["normalized_path"] = normalized_path
            return ProcessingResult(success=True, normalized_path=normalized_path)

        except ImportError:
            return ProcessingResult(
                success=False,
                errors=["Pillow not installed. Install with: pip install Pillow"],
            )
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to normalize image: {e}"])

    async def preprocess(self, ctx: ProcessingContext) -> ProcessingResult:
        normalized_path = ctx.metadata.get("normalized_path", ctx.file_path)
        try:
            from PIL import Image, ImageFile, ImageFilter

            img: ImageFile.ImageFile = Image.open(normalized_path)

            # Basic preprocessing: convert to RGB if needed, denoise
            if img.mode != "RGB":
                img = img.convert("RGB")  # type: ignore[assignment]

            # Light denoising
            img = img.filter(ImageFilter.MedianFilter(size=3))  # type: ignore[assignment]

            preprocessed_path = ctx.file_path + ".preprocessed.png"
            img.save(preprocessed_path, "PNG")
            ctx.metadata["preprocessed_path"] = preprocessed_path
            return ProcessingResult(success=True, normalized_path=preprocessed_path)

        except ImportError:
            return ProcessingResult(
                success=False,
                errors=["Pillow not installed. Install with: pip install Pillow"],
            )
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to preprocess image: {e}"])

    async def extract_features(self, ctx: ProcessingContext) -> ProcessingResult:
        path = Path(ctx.metadata.get("preprocessed_path", ctx.file_path))
        try:
            import numpy as np
            from PIL import Image

            img = Image.open(path).convert("RGB")

            arr = np.array(img, dtype=np.float32)

            # Color statistics
            r_mean, g_mean, b_mean = arr[:, :, 0].mean(), arr[:, :, 1].mean(), arr[:, :, 2].mean()
            r_std, g_std, b_std = arr[:, :, 0].std(), arr[:, :, 1].std(), arr[:, :, 2].std()
            brightness = float(arr.mean())
            contrast = float(arr.std())

            # Histogram features
            hist_r = np.histogram(arr[:, :, 0], bins=16, range=(0, 255))[0]
            hist_g = np.histogram(arr[:, :, 1], bins=16, range=(0, 255))[0]
            hist_b = np.histogram(arr[:, :, 2], bins=16, range=(0, 255))[0]

            # File hash
            file_bytes = path.read_bytes()
            file_hash = hashlib.sha256(file_bytes).hexdigest()
            small = Image.open(path).convert("L").resize((8, 8))
            pixels = list(small.getdata())
            average = sum(pixels) / max(len(pixels), 1)
            perceptual_hash = "".join("1" if pixel >= average else "0" for pixel in pixels)

            features = {
                "color_means": {
                    "r": round(float(r_mean), 2),
                    "g": round(float(g_mean), 2),
                    "b": round(float(b_mean), 2),
                },
                "color_stds": {"r": round(float(r_std), 2), "g": round(float(g_std), 2), "b": round(float(b_std), 2)},
                "brightness": round(brightness, 2),
                "contrast": round(contrast, 2),
                "histogram_r": hist_r.tolist(),
                "histogram_g": hist_g.tolist(),
                "histogram_b": hist_b.tolist(),
                "file_hash": file_hash,
                "perceptual_hash": perceptual_hash,
                "visual_embedding_status": "not_configured",
            }
            ctx.features.update(features)
            return ProcessingResult(success=True, features=features)

        except ImportError:
            ctx.warnings.append("numpy/Pillow not installed; skipping feature extraction")
            return ProcessingResult(success=True, features={})
        except Exception as e:
            return ProcessingResult(success=False, errors=[f"Failed to extract image features: {e}"])

    async def parse_structure(self, ctx: ProcessingContext) -> ProcessingResult:
        structure = {
            "dimensions": [ctx.metadata.get("width"), ctx.metadata.get("height")],
            "channels": len(ctx.metadata.get("mode", "")) if ctx.metadata.get("mode") else None,
            "exif_present": bool(ctx.metadata.get("has_exif")),
        }
        ctx.metadata["structure"] = structure
        return ProcessingResult(success=True, metadata={"structure": structure})


register_processor("image", ImageProcessor)
