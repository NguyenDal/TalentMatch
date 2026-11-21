import os
import boto3
from botocore.exceptions import NoCredentialsError, ClientError
from uuid import uuid4

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME")
AWS_REGION = os.getenv("AWS_REGION", "ca-central-1")

s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

def upload_file_to_s3(file_obj, filename=None, folder="avatars/"):
    """
    Upload a file-like object or FastAPI UploadFile to S3.
    Returns the S3 URL if successful, or None on failure.
    """
    if not filename:
        filename = str(uuid4())
    if folder and not folder.endswith("/"):
        folder += "/"
    s3_key = f"{folder}{filename}"

    # Detect content_type (for FastAPI UploadFile or fallback)
    content_type = getattr(file_obj, "content_type", "application/octet-stream")

    # For FastAPI UploadFile, use file_obj.file (a SpooledTemporaryFile)
    file_to_upload = getattr(file_obj, "file", file_obj)

    try:
        s3_client.upload_fileobj(
            file_to_upload,
            AWS_STORAGE_BUCKET_NAME,
            s3_key,
            ExtraArgs={"ContentType": content_type},
        )
        url = f"https://{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        return url
    except (NoCredentialsError, ClientError) as e:
        print("Error uploading to S3:", e)
        return None