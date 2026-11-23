/* Server only (Node): QR images for contri-party payments. */
import QRCode from "qrcode";

/** Inline SVG QR for a upi:// link (party pages). */
export function upiQrSvg(link: string) {
  return QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#1f1b2e", light: "#ffffff" } });
}

/** PNG QR for emails, attached inline (most email clients block SVG and data: URLs). */
export function upiQrPng(link: string) {
  return QRCode.toBuffer(link, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 360, color: { dark: "#1f1b2e", light: "#ffffff" } });
}
