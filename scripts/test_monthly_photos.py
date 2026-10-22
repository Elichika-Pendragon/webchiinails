import io
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from PIL import Image
import monthly_photos as importer


def embed(media):
    payload = {'context': {'shortcode': 'Photo123'}, 'gql_data': {'shortcode_media': media}}
    return '"contextJSON":' + json.dumps(json.dumps(payload))


def photo(**changes):
    return {'__typename': 'GraphImage', 'shortcode': 'Photo123', 'id': '123456789',
            'owner': {'username': 'chii.nails_'}, 'is_video': False,
            'display_url': 'https://instagram.example.fbcdn.net/photo.jpg', **changes}


class MonthlyPhotosTest(unittest.TestCase):
    def test_owner_identity_and_photo_only(self):
        self.assertEqual(len(importer.photo_items(embed(photo()), 'Photo123')), 1)
        with self.assertRaises(ValueError):
            importer.photo_items(embed(photo(owner={'username': 'someone_else'})), 'Photo123')
        with self.assertRaises(ValueError):
            importer.photo_items(embed(photo()), 'Different123')
        self.assertEqual(importer.photo_items(embed(photo(__typename='GraphVideo', is_video=True)), 'Photo123'), [])

    def test_mixed_carousel_excludes_cover_and_video_children(self):
        media = photo(__typename='GraphSidecar', edge_sidecar_to_children={'edges': [
            {'node': photo(id='111111111')}, {'node': photo(id='222222222', is_video=True)},
            {'node': photo(id='333333333')}]})
        self.assertEqual([p['photoId'] for p in importer.photo_items(embed(media), 'Photo123')], ['111111111', '333333333'])

    def test_source_urls_cannot_redirect_downloads_to_arbitrary_hosts(self):
        for url in ['http://fbcdn.net/a', 'https://fbcdn.net.evil.test/a', 'https://127.0.0.1/a',
                    'https://user:secret@fbcdn.net/a', 'https://fbcdn.net:443/a']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                importer.safe_url(url, 'image')
        with self.assertRaises(ValueError):
            importer.photo_items(embed(photo(display_url='https://evil.test/a')), 'Photo123')

    def test_retention_over_five_months_does_not_protect_originals(self):
        pool = [{'name': f'original-{i}'} for i in range(6)]
        for month in range(1, 7):
            additions = [{'name': f'{month}-{i}', 'photoId': f'{month}{i}'} for i in range(10)]
            pool = importer.retained_photos(pool, additions)
            self.assertEqual(len(pool), min(6 + month * 10, 50))
            self.assertEqual(pool[:10], additions)
        self.assertFalse(any(p['name'].startswith('original') for p in pool))
        self.assertFalse(any(p['name'].startswith('1-') for p in pool))

    def test_incomplete_or_duplicate_batch_is_rejected(self):
        with self.assertRaises(ValueError):
            importer.retained_photos([], [{'photoId': str(i)} for i in range(9)])
        with self.assertRaises(ValueError):
            importer.retained_photos([], [{'photoId': 'same'}] * 10)

    def test_failed_discovery_leaves_all_collection_files_untouched(self):
        with tempfile.TemporaryDirectory(dir=importer.ROOT) as folder:
            root = Path(folder)
            (root / 'src').mkdir()
            file = root / 'src/studio-collection.json'
            previous = json.dumps({'version': 1, 'refreshMonth': None, 'photos': []})
            file.write_text(previous)
            def unavailable(url, kind, maximum):
                if kind == 'archive':
                    return json.dumps({'version': 1, 'profile': 'chii.nails_', 'posts': []}).encode()
                raise OSError('offline')
            with self.assertRaises(ValueError):
                importer.refresh(root, '2026-10', unavailable)
            self.assertEqual(file.read_text(), previous)
            self.assertFalse((root / 'public').exists())

    def test_same_month_rerun_never_fetches(self):
        with tempfile.TemporaryDirectory(dir=importer.ROOT) as folder:
            root = Path(folder)
            (root / 'src').mkdir()
            (root / 'src/studio-collection.json').write_text(json.dumps({'refreshMonth': '2026-10', 'photos': []}))
            def unexpected(*args):
                self.fail('Already-refreshed month must not access Instagram')
            self.assertEqual(importer.refresh(root, '2026-10', unexpected)['status'], 'already-refreshed')

    def test_optimized_exports_have_no_exif_or_upscaling(self):
        image = Image.new('RGB', (900, 1200), 'pink')
        source = io.BytesIO()
        exif = Image.Exif()
        exif[270] = 'Private original metadata'
        image.save(source, 'JPEG', exif=exif)
        digest, variants, width, height = importer.optimize(source.getvalue())
        self.assertEqual((width, height), (900, 1200))
        self.assertEqual(list(variants), [360, 720, 900])
        self.assertEqual(len(digest), 64)
        for size, data in variants.items():
            with Image.open(io.BytesIO(data)) as output:
                self.assertEqual(output.width, size)
                self.assertFalse(output.getexif())
                self.assertLess(len(data), 240_000)

    def test_visual_duplicate_check_survives_another_encoding(self):
        image = Image.radial_gradient('L').resize((900, 1200)).convert('RGB')
        original, recompressed = io.BytesIO(), io.BytesIO()
        image.save(original, 'JPEG', quality=90)
        image.resize((720, 960)).save(recompressed, 'WEBP', quality=80)
        previous = {'visualHash': importer.visual_hash(original.getvalue()), 'width': 900, 'height': 1200}
        self.assertTrue(importer.same_picture(importer.visual_hash(recompressed.getvalue()), 720, 960, [previous]))

    def test_order_starts_with_current_grid_and_excludes_pins_reels(self):
        posts = [{'id': key, 'url': f'https://www.instagram.com/p/{key}/'} for key in ['Pinned123', 'Older123', 'Recent123']]
        posts.append({'id': 'Reel123', 'url': 'https://www.instagram.com/reel/Reel123/'})
        archive = {'version': 1, 'profile': 'chii.nails_', 'posts': posts,
                   'recentIds': ['Recent123', 'Reel123'], 'pinnedIds': ['Pinned123']}
        self.assertEqual([p['id'] for p in importer.ordered_posts(archive)], ['Recent123', 'Older123'])

    def test_full_refresh_publishes_ten_then_removes_oldest_managed_files(self):
        with tempfile.TemporaryDirectory(dir=importer.ROOT) as folder:
            root = Path(folder)
            (root / 'src').mkdir()
            old = [{'name': f'monthly/ig-{100000+i}-aaaaaaaaaa', 'widths': [360], 'width': 720, 'height': 960,
                    'title': 'Old photo', 'alt': 'Chii photo', 'position': '50% 50%'} for i in range(40)]
            old += [{'name': f'jessica-original{letter}', 'widths': [360], 'width': 720, 'height': 960,
                     'title': 'Old photo', 'alt': 'Chii photo', 'position': '50% 50%'} for letter in 'abcdef']
            for item in old:
                file = root / f"public/images/{item['name']}-360.webp"
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(b'old asset')
            catalog = root / 'src/studio-collection.json'
            catalog.write_text(json.dumps({'version': 1, 'refreshMonth': '2026-09', 'photos': old}))
            (root / 'src/studio-fixed-photos.json').write_text(json.dumps([old[-1]]))
            ids = [f'Post123{i}' for i in range(10)]
            archive = {'version': 1, 'profile': 'chii.nails_',
                       'posts': [{'id': key, 'url': f'https://www.instagram.com/p/{key}/'} for key in ids]}
            def source(url, kind, maximum):
                if kind == 'archive':
                    return json.dumps(archive).encode()
                if kind == 'embed':
                    key = url.split('/')[4]
                    media = photo(shortcode=key, id=f'1234567{ids.index(key)}',
                                  display_url=f'https://instagram.example.fbcdn.net/{ids.index(key)}.jpg')
                    payload = {'context': {'shortcode': key}, 'gql_data': {'shortcode_media': media}}
                    return ('"contextJSON":' + json.dumps(json.dumps(payload))).encode()
                index = int(url.rsplit('/', 1)[1].split('.')[0])
                output = io.BytesIO()
                Image.new('RGB', (720, 960), (index * 20, 80, 140)).save(output, 'JPEG')
                return output.getvalue()
            with patch.object(importer, 'same_picture', return_value=False):
                result = importer.refresh(root, '2026-10', source)
            self.assertEqual(result['removed'], 6)
            state = json.loads(catalog.read_text(encoding='utf-8'))
            self.assertEqual(len(state['photos']), 50)
            self.assertEqual([p['selection'] for p in state['photos'][:10]], ['recent'] * 5 + ['archive'] * 5)
            self.assertEqual(state['photos'][10:], old[:40])
            for item in old[-6:]:
                self.assertEqual((root / f"public/images/{item['name']}-360.webp").exists(), item == old[-1])
            self.assertNotIn(old[-1], state['photos'], 'Fixed section assets still age out of the gallery pool')
            self.assertNotIn('fbcdn', catalog.read_text(encoding='utf-8'))
            self.assertNotIn('visualHash', (root / 'src/studio-photo-catalog.json').read_text(encoding='utf-8'))
            for item in state['photos'][:10]:
                for width in item['widths']:
                    self.assertTrue((root / f"public/images/{item['name']}-{width}.webp").is_file())


if __name__ == '__main__':
    unittest.main()
