import io
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException, UploadFile
from PIL import Image
from starlette.datastructures import Headers

from test_google_auth import TEST_ENV  # Initializes the isolated app.
from app import main
from app.infrastructure import avatars


def sample_picture(image_format="PNG"):
    with Image.new("RGB", (8, 8), "#7152e8") as image:
        output = io.BytesIO()
        image.save(output, format=image_format)
        return output.getvalue()


def upload(data, content_type):
    return UploadFile(io.BytesIO(data), filename="portrait", headers=Headers({"content-type": content_type}))


class AvatarUploadTests(unittest.TestCase):
    def test_supported_formats_get_canonical_keys_and_preserve_original_bytes(self):
        for mime, (fmt, suffix) in avatars.FORMATS.items():
            with self.subTest(fmt=fmt):
                data = sample_picture(fmt)
                picture = upload(data, mime)
                user = SimpleNamespace(id=123)
                with patch.object(main, "upload_file_to_s3", return_value="https://storage.example/avatar") as storage:
                    main.upload_profile_image(picture, user, Mock())
                self.assertRegex(storage.call_args.kwargs["filename"], rf"^user_123_[0-9a-f]{{32}}\.{suffix}$")
                self.assertEqual(picture.file.read(), data)
                self.assertEqual(user.profile_image_url, storage.return_value)

    def test_unrecognized_or_mislabeled_pictures_do_not_reach_storage(self):
        for data, mime in [(b"", "image/png"), (sample_picture(), "image/jpeg"),
                           (sample_picture(), "application/octet-stream")]:
            with self.subTest(mime=mime), patch.object(main, "upload_file_to_s3") as storage:
                with self.assertRaises(HTTPException) as error:
                    main.upload_profile_image(upload(data, mime), SimpleNamespace(id=1), Mock())
                self.assertEqual(error.exception.status_code, 400)
                storage.assert_not_called()

    def test_file_byte_limit_accepts_exact_limit_and_rejects_one_over(self):
        data = sample_picture()
        with patch.object(avatars, "MAX_AVATAR_BYTES", len(data)):
            self.assertEqual(avatars.validated_avatar_extension(upload(data, "image/png")), "png")
            with self.assertRaises(HTTPException) as error:
                avatars.validated_avatar_extension(upload(data + b" ", "image/png"))
            self.assertEqual(error.exception.status_code, 413)

    def test_pixel_limit_is_checked_before_storage(self):
        data = sample_picture()
        with patch.object(avatars, "MAX_AVATAR_PIXELS", 63), patch.object(main, "upload_file_to_s3") as storage:
            with self.assertRaises(HTTPException) as error:
                main.upload_profile_image(upload(data, "image/png"), SimpleNamespace(id=1), Mock())
            self.assertEqual(error.exception.status_code, 413)
            storage.assert_not_called()
