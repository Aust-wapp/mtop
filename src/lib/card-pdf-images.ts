export interface CardSignatureUrls {
  mayorSignatureUrl: string | null
  treasurerSignatureUrl: string | null
}

/** Refresh expiring storage URLs before html2canvas reads the card. */
export async function refreshCardSignatureImages(
  card: HTMLElement,
  urls: CardSignatureUrls
): Promise<void> {
  const signatures = [
    { selector: 'img[alt="City Mayor signature"]', url: urls.mayorSignatureUrl },
    { selector: 'img[alt="City Treasurer signature"]', url: urls.treasurerSignatureUrl },
  ]

  await Promise.all(signatures.map(async ({ selector, url }) => {
    if (!url) return
    const image = card.querySelector<HTMLImageElement>(selector)
    if (!image) throw new Error("A signature is missing from the card preview.")
    image.crossOrigin = "anonymous"
    image.src = url
    await image.decode()
  }))
}
