export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// The inverse of readFileAsDataUrl — rebuilds a real File from a data URL
// previously saved to localStorage. Needed because a saved logo/favicon/
// custom-font file can't be written back into its <input type="file">
// (browsers don't allow setting `.files` programmatically).
export async function dataUrlToFile(dataUrl, fileName, mimeType) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: mimeType || blob.type });
}

export function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'manual'
  );
}
