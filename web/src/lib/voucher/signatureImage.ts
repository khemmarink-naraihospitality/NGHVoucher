import { createCanvas, loadImage } from "canvas";

// A signature upload photographed or exported from a signing pad usually
// has a lot of near-white/transparent padding around the actual ink —
// scaling that whole image (padding included) to fit the render box in
// draw.ts makes the visible strokes look small no matter how generous the
// box is (found via a real uploaded signature rendering tiny despite the
// box-fit code being correct). This crops to the actual content's bounding
// box and forces the background transparent, so it always fills the box
// and never shows a white rectangle on the voucher's orange background.
const ALPHA_BACKGROUND_THRESHOLD = 10;
const LUMINANCE_BACKGROUND_THRESHOLD = 235; // near-white counts as background even with no alpha channel
const PADDING_FRACTION = 0.08;

export async function cropSignatureToContent(buffer: Buffer): Promise<Buffer> {
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const { data, width, height } = imageData;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const isBackground = a < ALPHA_BACKGROUND_THRESHOLD || luminance > LUMINANCE_BACKGROUND_THRESHOLD;

      if (isBackground) {
        data[i + 3] = 0; // flatten background to transparent either way
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  if (maxX < minX || maxY < minY) {
    // Nothing detected as "ink" (e.g. a blank upload) — return the
    // background-cleared image as-is rather than guessing further.
    return canvas.toBuffer("image/png");
  }

  const padX = Math.max(4, Math.round((maxX - minX) * PADDING_FRACTION));
  const padY = Math.max(4, Math.round((maxY - minY) * PADDING_FRACTION));
  const cropX = Math.max(0, minX - padX);
  const cropY = Math.max(0, minY - padY);
  const cropWidth = Math.min(width, maxX + padX + 1) - cropX;
  const cropHeight = Math.min(height, maxY + padY + 1) - cropY;

  const cropped = createCanvas(cropWidth, cropHeight);
  cropped.getContext("2d").drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return cropped.toBuffer("image/png");
}
