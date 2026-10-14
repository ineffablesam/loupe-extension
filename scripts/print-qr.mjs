import QRCode from 'qrcode'

const url = process.argv[2]
if (!url) process.exit(0)

console.log(await QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'L' }))
