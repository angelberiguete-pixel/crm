from PIL import Image
import io, pathlib, urllib.request

photos = [["hero","https://at.adobe.com/VEXTiCDcPmikYw6E"],["catalogo","https://at.adobe.com/xFpqyU4bWUCmtPhx"],["web","https://at.adobe.com/clwyWJ3Da05RASvE"],["reels","https://at.adobe.com/urdxPT0PDhwgXMZU"],["pagos","https://at.adobe.com/h4KgORFKaB8D9miT"],["contenido","https://at.adobe.com/9rpI5Sak6wiTf2hV"]]
dest = pathlib.Path("commerce/public/art")
dest.mkdir(parents=True, exist_ok=True)
for name,url in photos:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; AssetSynchronizer/1.0)"})
    with urllib.request.urlopen(request, timeout=70) as response:
        payload = response.read(10000000)
    print(f"{name}: downloaded {len(payload)} bytes")
    img = Image.open(io.BytesIO(payload))
    img.verify()
    img = Image.open(io.BytesIO(payload)).convert("RGB")
    img.thumbnail((1500, 1100), Image.Resampling.LANCZOS)
    output = dest / f"ai-{name}.webp"
    img.save(output, format="WEBP", quality=82, method=6)
    print(f"Created {output}: {output.stat().st_size} bytes, {img.size}")
