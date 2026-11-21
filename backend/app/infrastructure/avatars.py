"""Check profile pictures before they are stored as public image objects."""

from io import BytesIO

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError


MAX_AVATAR_BYTES = 5 * 1024 * 1024
MAX_AVATAR_PIXELS = 16_000_000
FORMATS = {
    "image/jpeg": ("JPEG", "jpg"),
    "image/png": ("PNG", "png"),
    "image/webp": ("WEBP", "webp"),
}


def validated_avatar_extension(upload: UploadFile) -> str:
    """Return a canonical suffix and rewind the upload for S3."""
    spec = FORMATS.get(upload.content_type)
    if spec is None:
        raise HTTPException(400, "Choose a JPG, PNG, or WebP profile picture.")
    image_format, extension = spec
    upload.file.seek(0)
    data = upload.file.read(MAX_AVATAR_BYTES + 1)
    upload.file.seek(0)
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(413, "Choose a profile picture of 5 MB or less.")
    try:
        with Image.open(BytesIO(data), formats=[image_format]) as picture:
            if picture.width * picture.height > MAX_AVATAR_PIXELS:
                raise HTTPException(413, "Choose a profile picture of 16 megapixels or less.")
            picture.verify()
    except Image.DecompressionBombError:
        raise HTTPException(413, "Choose a profile picture of 16 megapixels or less.") from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(400, "The picture could not be read in the selected image format.") from None
    return extension
