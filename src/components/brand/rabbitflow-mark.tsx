import Image, { type ImageProps } from 'next/image'

export const RABBITFLOW_MARK_SRC = '/brand/rabbitflow-mark.png'

type RabbitFlowMarkProps = Omit<ImageProps, 'src' | 'width' | 'height' | 'alt'> & {
  alt?: string
}

/** The product mark used when a project has not supplied tenant branding. */
export function RabbitFlowMark({ alt = '', className, ...props }: RabbitFlowMarkProps) {
  return (
    <Image
      src={RABBITFLOW_MARK_SRC}
      width={512}
      height={512}
      alt={alt}
      className={className}
      draggable={false}
      {...props}
    />
  )
}
