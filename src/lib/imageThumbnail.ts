const WIDTH = 260;
const HEIGHT = 180;

export async function compactImageThumbnail(dataUrl: string): Promise<string> {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d");
    if (!context || !image.naturalWidth || !image.naturalHeight) return dataUrl;

    context.fillStyle = "#edf2f3";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const scale = Math.min(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
    const compact = canvas.toDataURL("image/webp", 0.78);
    return compact.startsWith("data:image/webp;base64,") ? compact : dataUrl;
  } catch {
    return dataUrl;
  }
}
