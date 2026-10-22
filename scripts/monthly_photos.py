"""Monthly credential-free photo import; CI tests/builds before publishing.

No original uploads, expiring CDN URLs, cookies or Instagram tokens ship.
A complete batch is verified before any existing collection file is replaced.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
import re
import tempfile
import urllib.parse
import urllib.request
import warnings
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = 'https://chiinails.pages.dev/api/instagram-archive'
OWNER = 'chii.nails_'
PHOTO_LIMIT = 50
MAX_PROBES = 80
PUBLIC_FIELDS = ['name', 'title', 'alt', 'width', 'height', 'widths', 'position']
Image.MAX_IMAGE_PIXELS = 40_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)


def safe_url(value, kind):
    url = urllib.parse.urlsplit(value)
    host = (url.hostname or '').lower()
    if url.scheme != 'https' or url.username or url.password or url.port:
        raise ValueError('Unsafe source URL')
    if kind == 'image':
        allowed = any(host == suffix or host.endswith('.' + suffix)
                      for suffix in ['cdninstagram.com', 'fbcdn.net'])
    elif kind == 'embed':
        allowed = host == 'www.instagram.com' and bool(re.fullmatch(r'/p/[A-Za-z0-9_-]{5,64}/embed/', url.path))
    else:
        allowed = value == ARCHIVE
    if not allowed:
        raise ValueError('Unexpected source host or path')
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download(url, kind, maximum):
    safe_url(url, kind)
    request = urllib.request.Request(url, headers={'User-Agent': 'ChiiNailsPhotoRefresh/1.0',
                                                  'Accept': 'image/*' if kind == 'image' else '*/*'})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError('Source unavailable')
        if kind == 'image' and response.headers.get_content_type() not in ['image/jpeg', 'image/png', 'image/webp']:
            raise ValueError('Unexpected image content type')
        data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError('Source exceeds download budget')
    return data


def photo_items(html, post_id):
    match = re.search(r'"contextJSON"\s*:\s*', html)
    if not match:
        raise ValueError('Photo metadata missing')
    encoded, _ = json.JSONDecoder().raw_decode(html[match.end():])
    payload = json.loads(encoded)
    media = payload.get('gql_data', {}).get('shortcode_media', {})
    if payload.get('context', {}).get('shortcode') != post_id or media.get('shortcode') != post_id:
        raise ValueError('Post identity mismatch')
    if media.get('owner', {}).get('username') != OWNER:
        raise ValueError('Photo owner mismatch')
    if media.get('__typename') not in ['GraphImage', 'GraphSidecar'] or media.get('is_video') is not False:
        return []
    caption_edges = media.get('edge_media_to_caption', {}).get('edges', [])
    caption = caption_edges[0].get('node', {}).get('text', '') if caption_edges else ''
    caption = re.sub(r'[@#]\S+', '', caption).strip().split('\n')[0].strip()
    title = caption[:90] if caption and not re.search(r'testimoni|testimony|review', caption, re.I) else 'Karya Chii Nails'
    nodes = ([edge.get('node', {}) for edge in media.get('edge_sidecar_to_children', {}).get('edges', [])]
             if media.get('__typename') == 'GraphSidecar' else [media])
    photos = []
    for node in nodes:
        if node.get('is_video') is not False:
            continue
        if node.get('owner', {}).get('username', OWNER) != OWNER:
            continue
        image_url = safe_url(node.get('display_url', ''), 'image')
        image_id = str(node.get('id', ''))
        if not re.fullmatch(r'\d{5,30}', image_id):
            raise ValueError('Invalid photo identity')
        alt = node.get('accessibility_caption') or 'Foto nail art dan press-on karya Chii Nails'
        photos.append({'photoId': image_id, 'imageUrl': image_url, 'title': title,
                       'alt': re.sub(r'[\x00-\x1f]', ' ', str(alt))[:300], 'postId': post_id,
                       'sourceUrl': f'https://www.instagram.com/p/{post_id}/'})
    return photos


def optimize(data):
    with Image.open(io.BytesIO(data)) as probe:
        if probe.format not in ['JPEG', 'PNG', 'WEBP'] or getattr(probe, 'n_frames', 1) != 1:
            raise ValueError('Only still images are supported')
        probe.verify()
    with Image.open(io.BytesIO(data)) as source:
        source = ImageOps.exif_transpose(source)
        if source.width < 720 or source.height < 360 or not 0.5 <= source.width / source.height <= 2:
            raise ValueError('Image too small for the gallery')
        image = Image.new('RGB', source.size, 'white')
        if 'A' in source.getbands():
            rgba = source.convert('RGBA')
            image.paste(rgba, mask=rgba.getchannel('A'))
        else:
            image.paste(source.convert('RGB'))
    fingerprint = hashlib.sha256(image.tobytes()).hexdigest()
    widths = sorted(set(min(width, image.width) for width in [360, 720, 1080]))
    exports = {}
    for width in widths:
        height = round(image.height * width / image.width)
        resized = image.resize((width, height), Image.Resampling.LANCZOS)
        for quality in [80, 72, 64]:
            output = io.BytesIO()
            resized.save(output, 'WEBP', quality=quality, method=6)
            if output.tell() <= 240_000:
                break
        else:
            raise ValueError('Optimized image exceeds delivery budget')
        exports[width] = output.getvalue()
    return fingerprint, exports, widths[-1], round(image.height * widths[-1] / image.width)


def visual_hash(data):
    with Image.open(io.BytesIO(data)) as source:
        small = ImageOps.exif_transpose(source).convert('L').resize((17, 16), Image.Resampling.LANCZOS)
        pixels = list(small.get_flattened_data())
    bits = 0
    for row in range(16):
        for column in range(16):
            bits = (bits << 1) | (pixels[row * 17 + column] > pixels[row * 17 + column + 1])
    return f'{bits:064x}'


def same_picture(signature, width, height, existing):
    for photo in existing:
        previous = photo.get('visualHash')
        if previous and abs(width / height - photo['width'] / photo['height']) < 0.03:
            if (int(signature, 16) ^ int(previous, 16)).bit_count() <= 12:
                return True
    return False


def ordered_posts(archive):
    if archive.get('version') != 1 or archive.get('profile') != OWNER:
        raise ValueError('Invalid public archive')
    posts = {}
    for item in archive.get('posts', [])[:5000]:
        post_id = item.get('id', '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{5,64}', post_id):
            continue
        if item.get('url') == f'https://www.instagram.com/p/{post_id}/':
            posts[post_id] = item
    pinned = set(archive.get('pinnedIds', []))
    ids = list(dict.fromkeys([*archive.get('recentIds', []), *posts]))
    return [posts[key] for key in ids if key in posts and key not in pinned]


def retained_photos(old, additions):
    if len(additions) != 10 or len({p['photoId'] for p in additions}) != 10:
        raise ValueError('A complete unique batch of ten photos is required')
    return [*additions, *old][:PHOTO_LIMIT]


def refresh(root=ROOT, month=None, fetch=download):
    month = month or datetime.now(timezone.utc).strftime('%Y-%m')
    if not re.fullmatch(r'\d{4}-\d{2}', month):
        raise ValueError('Invalid batch month')
    catalog = root / 'src/studio-collection.json'
    state = json.loads(catalog.read_text(encoding='utf-8'))
    if state.get('refreshMonth') and state['refreshMonth'] >= month:
        return {'status': 'already-refreshed', 'month': month, 'photos': len(state['photos'])}
    old = state['photos']
    archive = json.loads(fetch(ARCHIVE, 'archive', 1_000_000))
    candidates = ordered_posts(archive)
    occupied_posts = {p.get('postId') for p in old}
    hashes = {p.get('sha256') for p in old}
    additions, exports = [], {}
    probes = 0

    def collect(post, group):
        nonlocal probes
        if post['id'] in occupied_posts or probes >= MAX_PROBES:
            return False
        probes += 1
        try:
            html = fetch(f"https://www.instagram.com/p/{post['id']}/embed/", 'embed', 1_500_000).decode('utf-8')
            for photo in photo_items(html, post['id']):
                data = fetch(photo['imageUrl'], 'image', 12_000_000)
                digest, variants, width, height = optimize(data)
                signature = visual_hash(data)
                if digest in hashes or same_picture(signature, width, height, [*old, *additions]):
                    continue
                name = f"monthly/ig-{photo['photoId']}-{digest[:10]}"
                additions.append({k: v for k, v in photo.items() if k != 'imageUrl'} | {
                    'name': name, 'source': 'instagram-photo', 'addedMonth': month, 'selection': group,
                    'sha256': digest, 'visualHash': signature, 'width': width, 'height': height, 'widths': list(variants),
                    'position': '50% 50%'})
                exports[name] = variants
                hashes.add(digest)
                occupied_posts.add(post['id'])
                return True
        except (OSError, ValueError, KeyError, TypeError, Image.DecompressionBombError) as error:
            print(f"Skipped photo candidate ({type(error).__name__})", flush=True)
        return False

    boundary = 0
    for boundary, post in enumerate(candidates, 1):
        collect(post, 'recent')
        if len(additions) == 5:
            break
    if len(additions) != 5:
        raise ValueError('Could not verify five recent photo posts; prior collection preserved')
    older = candidates[boundary:]
    random.Random(f'chii-photos:{month}').shuffle(older)
    for post in older:
        collect(post, 'archive')
        if len(additions) == 10:
            break
    photos = retained_photos(old, additions)
    # Everything above is read-only. Stage all bytes before collection mutation.
    for photo in photos[10:]:
        for width in photo['widths']:
            if not (root / f"public/images/{photo['name']}-{width}.webp").is_file():
                raise ValueError('Existing collection asset missing')
    with tempfile.TemporaryDirectory(prefix='.chii-photo-batch-', dir=root) as folder:
        staging = Path(folder)
        for name, variants in exports.items():
            for width, data in variants.items():
                target = staging / f'{name}-{width}.webp'
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                with Image.open(target) as check:
                    check.verify()
        for file in staging.rglob('*.webp'):
            destination = root / 'public/images' / file.relative_to(staging)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(file.read_bytes())
    result = {'version': 1, 'refreshMonth': month, 'photos': photos}
    pending = catalog.with_suffix('.pending')
    pending.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    pending.replace(catalog)
    public_catalog = root / 'src/studio-photo-catalog.json'
    public_pending = public_catalog.with_suffix('.pending')
    public_pending.write_text(json.dumps([{key: photo[key] for key in PUBLIC_FIELDS} for photo in photos],
                                        ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    public_pending.replace(public_catalog)
    fixed_file = root / 'src/studio-fixed-photos.json'
    fixed_names = {p['name'] for p in json.loads(fixed_file.read_text(encoding='utf-8'))} if fixed_file.exists() else set()
    kept = {p['name'] for p in photos} | fixed_names
    for photo in old:
        name = photo['name']
        if name not in kept and re.fullmatch(r'(?:monthly/ig-\d+-[a-f0-9]{10}|jessica-[a-z-]+)', name):
            for width in photo['widths']:
                (root / f'public/images/{name}-{width}.webp').unlink(missing_ok=True)
    return {'status': 'refreshed', 'month': month, 'added': 10, 'removed': len(old) + 10 - len(photos),
            'photos': len(photos), 'newVariantBytes': sum(len(data) for variants in exports.values() for data in variants.values()),
            'probes': probes}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--month', help='Batch month YYYY-MM; same-month reruns are no-ops')
    args = parser.parse_args()
    print(json.dumps(refresh(month=args.month)))
