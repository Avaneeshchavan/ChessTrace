"""Endpoint contract tests with multipart uploads dispatched in memory."""
import asyncio
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import app, MAX_UPLOAD_BYTES
from app.pipeline.sprite_matching import prepare_templates, reconstruction_errors
import cv2
import numpy as np

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
    def test_template_distance_matches_rendered_difference(self):
        rng = np.random.default_rng(21)
        alpha = rng.random((5, 3, 3, 1), dtype=np.float32)
        rgb = rng.random((5, 3, 3, 3), dtype=np.float32) * 255 * alpha
        background = np.array([80, 170, 220], dtype=np.float32)
        residual = rng.uniform(-80, 35, (3, 3, 3)).astype(np.float32)
        expected = np.mean((rgb - alpha * background - residual) ** 2, axis=(1, 2, 3))
        actual = reconstruction_errors(prepare_templates(rgb, alpha), background, residual, np.mean(residual ** 2))
        np.testing.assert_allclose(actual, expected, rtol=1e-5)

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

    def test_locate_and_validate_confirmed_crop(self):
        payload = (ROOT / "examples/synthetic_chesscom_neo.png").read_bytes()
        status, located = asyncio.run(upload("/locate-board", payload))
        self.assertEqual(status, 200)
        self.assertNotIn("squares", located)
        crop = located["crop"]
        self.assertGreaterEqual(crop["size"], 64)
        self.assertLessEqual(crop["x"] + crop["size"], located["width"])
        self.assertLessEqual(crop["y"] + crop["size"], located["height"])
        good = f"x={crop['x']}&y={crop['y']}&width={crop['size']}&height={crop['size']}".encode()
        self.assertEqual(asyncio.run(upload("/parse-screenshot", payload, good))[0], 200)
        for bad in (b"x=0", b"x=-1&y=0&width=64&height=64", b"x=0&y=0&width=63&height=63",
                    b"x=0&y=0&width=64&height=65", b"x=1.5&y=0&width=64&height=64",
                    f"x={located['width'] - 63}&y=0&width=64&height=64".encode()):
            with self.subTest(bad=bad):
                self.assertIn(asyncio.run(upload("/parse-screenshot", payload, bad))[0], (400, 422))

    def test_centered_proposal_is_reported(self):
        _, image = cv2.imencode(".png", np.full((160, 240, 3), 138, np.uint8))
        status, located = asyncio.run(upload("/locate-board", image.tobytes()))
        self.assertEqual(status, 200)
        self.assertTrue(located["fallback"])
        self.assertEqual(located["crop"], {"x": 40, "y": 0, "size": 160})

    def test_bad_image_and_upload_limit(self):
        self.assertEqual(asyncio.run(upload("/detect", b"not an image"))[0], 400)
        self.assertEqual(asyncio.run(upload("/detect", b"x" * MAX_UPLOAD_BYTES))[0], 413)

    def test_weak_match_explains_how_to_review(self):
        written, image = cv2.imencode(".png", np.full((192, 192, 3), 138, np.uint8))
        self.assertTrue(written)
        status, result = asyncio.run(upload("/detect", image.tobytes(), b"manual_orientation=white_bottom"))
        self.assertEqual(status, 200)
        self.assertEqual(len(result["squares"]), 64)
        self.assertTrue(any("piece set could not be matched reliably" in warning for warning in result["warnings"]))
        self.assertFalse(result["fen_valid"])


if __name__ == "__main__":
    unittest.main()
