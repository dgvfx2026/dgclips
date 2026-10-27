import http.client
import json
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from clipping import ass_escape, make_ass, suggest_clips
from engine import validate_url
from server import DesktopServer


class SuggestionsTests(unittest.TestCase):
    def test_no_speech_is_actionable(self):
        with self.assertRaisesRegex(ValueError, 'fala'):
            suggest_clips([], 40)

    def test_results_stay_in_video_and_do_not_overlap(self):
        segments = [{'start': i * 5.0, 'end': i * 5.0 + 4.8, 'text': f'Aprendi uma ideia importante sobre criatividade e trabalho {i}.'} for i in range(36)]
        results = suggest_clips(segments, 180, 'short')
        self.assertEqual(len(results), 3)
        for result in results:
            self.assertGreaterEqual(result['start'], 0)
            self.assertLessEqual(result['end'], 180)
            self.assertLessEqual(result['end'] - result['start'], 30.5)
        for first, second in zip(results, results[1:]):
            self.assertLessEqual(first['end'], second['start'])

    def test_short_recording_is_not_padded_beyond_the_source(self):
        results = suggest_clips([{'start': 0, 'end': 6.5, 'text': 'Uma conversa curta, mas completa.'}], 7)
        self.assertEqual(len(results), 1)
        self.assertLessEqual(results[0]['end'], 7)

    def test_caption_times_are_relative_and_escape_formatting(self):
        ass = make_ass([{'start': 50, 'end': 55, 'text': r'{\pos(0,0)} teste'}], 49, 56, 720, 1280, 'default')
        self.assertIn('0:00:01.00,0:00:06.00', ass)
        self.assertNotIn(r'{\pos', ass)
        self.assertEqual(ass_escape('Oi\n{texto}'), 'Oi (texto)')

    def test_only_supported_video_hosts(self):
        for url in ['file:///C:/Windows', 'http://127.0.0.1/', 'https://youtube.com.evil.com/watch?v=foo', 'https://user:pass@youtube.com/watch?v=abc', 'https://youtube.com:8080/watch?v=abc']:
            with self.assertRaises(ValueError):
                validate_url(url)
        self.assertEqual(validate_url('https://youtu.be/BaW_jenozKc'), 'https://youtu.be/BaW_jenozKc')


class FakeEngine:
    def list(self):
        return []


class TransportTests(unittest.TestCase):
    def setUp(self):
        # Avoid tempfile's restrictive 0700 ACL mode on some Windows build users.
        import uuid
        self.folder = Path(__file__).parent / ('test-artifacts-' + uuid.uuid4().hex)
        self.folder.mkdir()
        (self.folder / 'index.html').write_text('<html>DGCLIPS</html>')
        (self.folder / 'video.mp4').write_bytes(b'0123456789')
        self.server = DesktopServer(FakeEngine(), self.folder)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.cookie = 'dgclips-desktop=' + self.server.token

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        import shutil
        assert self.folder.resolve().is_relative_to(Path(__file__).resolve().parent)
        shutil.rmtree(self.folder)

    def request(self, method, path, headers=None, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request(method, path, headers=headers or {}, body=body)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_another_website_cannot_read_projects(self):
        self.assertEqual(self.request('GET', '/api/tasks/')[0], 401)

    def test_cookie_is_http_only_same_site_and_start_token_is_removed(self):
        status, headers, _ = self.request('GET', '/start?token=' + self.server.token)
        self.assertEqual(status, 303)
        self.assertEqual(headers['Location'], '/')
        self.assertIn('HttpOnly; SameSite=Strict', headers['Set-Cookie'])

    def test_cross_site_post_and_dns_rebinding_are_rejected(self):
        headers = {'Cookie': self.cookie, 'Origin': 'https://evil.example', 'Content-Type': 'application/json'}
        self.assertEqual(self.request('POST', '/api/tasks/create', headers, '{}')[0], 403)
        self.assertEqual(self.request('GET', '/api/tasks/', {'Cookie': self.cookie, 'Host': 'evil.example'})[0], 403)

    def test_byte_ranges_allow_preview_and_seeking(self):
        status, headers, data = self.request('GET', '/video.mp4', {'Cookie': self.cookie, 'Range': 'bytes=2-5'})
        self.assertEqual((status, data), (206, b'2345'))
        self.assertEqual(headers['Content-Range'], 'bytes 2-5/10')
        self.assertEqual(self.request('GET', '/video.mp4', {'Cookie': self.cookie, 'Range': 'bytes=90-'})[0], 416)

    def test_paths_cannot_escape_the_application(self):
        self.assertEqual(self.request('GET', '/%2e%2e/server.py', {'Cookie': self.cookie})[0], 404)
        self.assertEqual(self.request('GET', '/api/missing', {'Cookie': self.cookie})[0], 404)


if __name__ == '__main__':
    unittest.main()
