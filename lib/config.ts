/** Configure no .env.local e no ambiente Preview/Production da Vercel. */
export const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") ?? "";

export function createWhatsAppUrl(message: string) {
  return whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` : "";
}
