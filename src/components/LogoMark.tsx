type LogoMarkProps = {
  size?: 'sm' | 'lg'
}

const sizes = {
  sm: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
}

export function LogoMark({ size = 'lg' }: LogoMarkProps) {
  return (
    <div
      className={`${sizes[size]} grid place-items-center rounded-lg border border-blue-200 bg-white font-black tracking-normal text-blue-700 shadow-sm`}
      aria-label="Clinton Enterprise logo"
    >
      CE
    </div>
  )
}
