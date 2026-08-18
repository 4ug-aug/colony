/** Iframe src for a Preview URL, matching the page host so localhost ≠ 127.0.0.1. */
export function previewIframeSrc(previewUrl: string, pageHost: string): string {
  const url = new URL(previewUrl)
  if (url.hostname === '127.0.0.1' && pageHost === 'localhost')
    url.hostname = 'localhost'
  return url.toString()
}
