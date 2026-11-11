"""Endpoint contract tests with multipart uploads dispatched in memory."""
import asyncio
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import app, MAX_UPLOAD_BYTES
import cv2

cv2.setNumThreads(1)
BOUNDARY = b"chesstrace-test-boundary"


async def upload(path, payload, query=b""):
    body = (
        b"--" + BOUNDARY + b'\r\nContent-Disposition: form-data; name="file"; filename="board.png"'
        b"\r\nContent-Type: image/png\r\n\r\n" + payload + b"\r\n--" + BOUNDARY + b"--\r\n"
    )
    messages = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    await app({
        "type": "http", "method": "POST", "path": path, "query_string": query,
        "headers": [(b"content-type", b"multipart/form-data; boundary=" + BOUNDARY)],
        "scheme": "http", "http_version": "1.1", "server": ("localhost", 80),
    }, receive, send)
    return messages[0]["status"], json.loads(messages[-1]["body"])


class DetectTest(unittest.TestCase):
    def test_square_scores_and_compatibility(self):
        payload = (ROOT / "examples/synthetic_chesscom_neo.png").read_bytes()
        query = b"manual_orientation=white_bottom&theme=chesscom_neo"
        status, result = asyncio.run(upload("/detect", payload, query))
        self.assertEqual(status, 200)
        self.assertEqual(len({sq["square"] for sq in result["squares"]}), 64)
        self.assertEqual(result["squares"][0]["square"], "a8")
        self.assertTrue(all(0 <= sq["confidence"] <= 1 for sq in result["squares"]))
        self.assertEqual(set(result["low_confidence_squares"]),
                         {sq["square"] for sq in result["squares"] if sq["needs_review"]})
        self.assertEqual(asyncio.run(upload("/parse-screenshot", payload, query))[0], 200)

    def test_bad_image_and_upload_limit(self):
        self.assertEqual(asyncio.run(upload("/detect", b"not an image"))[0], 400)
        self.assertEqual(asyncio.run(upload("/detect", b"x" * MAX_UPLOAD_BYTES))[0], 413)


if __name__ == "__main__":
    unittest.main()
