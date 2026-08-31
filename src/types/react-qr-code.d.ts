declare module 'react-qr-code' {
  import type { ComponentType, SVGProps } from 'react'

  type QRCodeProps = SVGProps<SVGSVGElement> & {
    value: string
    size?: number
    bgColor?: string
    fgColor?: string
    level?: 'L' | 'M' | 'Q' | 'H'
  }

  const QRCode: ComponentType<QRCodeProps>

  export default QRCode
}
