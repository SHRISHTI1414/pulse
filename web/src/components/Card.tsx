import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
}

export default function Card({ children, className = '', hover = false, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={`bg-white border border-espresso-100 rounded-2xl shadow-sm shadow-espresso-900/5 ${hover ? 'card-hover' : ''} ${className}`}
    >
      {children}
    </div>
  )
}
