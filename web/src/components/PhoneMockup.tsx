import type { ReactNode } from 'react'

const SAMPLE_NAME = 'Anjali'

function renderTemplate(template: string): string {
  return template.replace(/\{\{\s*name\s*\}\}/g, SAMPLE_NAME)
}

function timeStamp(): string {
  const d = new Date()
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function PhoneFrame({ children, variant }: { children: ReactNode; variant: 'whatsapp' | 'sms' }) {
  const bg = variant === 'whatsapp' ? 'bg-[#0b141a]' : 'bg-[#f2f2f7]'
  const bezel = variant === 'whatsapp' ? 'from-[#1f2c34] to-[#0b141a]' : 'from-gray-800 to-gray-900'

  return (
    <div className="relative w-full max-w-[300px] mx-auto">
      {/* Phone bezel */}
      <div className={`rounded-[2.5rem] p-2 bg-gradient-to-b ${bezel} shadow-xl shadow-espresso-900/20`}>
        <div className={`rounded-[2rem] overflow-hidden ${bg}`}>
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1">
            <span className={`text-[10px] font-medium ${variant === 'whatsapp' ? 'text-white/60' : 'text-gray-500'}`}>
              {timeStamp().slice(0, 5)}
            </span>
            <div className="w-20 h-5 bg-black rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
            <div className="flex gap-0.5">
              <div className={`w-3 h-2 rounded-sm ${variant === 'whatsapp' ? 'bg-white/40' : 'bg-gray-400'}`} />
            </div>
          </div>
          {children}
        </div>
      </div>
      <p className="text-center text-[10px] text-espresso-400 mt-3 font-medium uppercase tracking-wider">
        Live preview · as {SAMPLE_NAME} sees it
      </p>
    </div>
  )
}

export function WhatsAppPreview({ body }: { body: string }) {
  const rendered = renderTemplate(body || 'Type your message above…')
  return (
    <PhoneFrame variant="whatsapp">
      {/* WA header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#1f2c34]">
        <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
          B
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">Brew Street</div>
          <div className="text-[11px] text-emerald-400">online</div>
        </div>
      </div>
      {/* Chat wallpaper */}
      <div
        className="px-4 py-5 min-h-[140px]"
        style={{ background: 'linear-gradient(180deg, #0b141a 0%, #111b21 100%)' }}
      >
        <div className="relative max-w-[88%] rounded-lg rounded-tl-none bg-[#1f2c34] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#e9edef] shadow-md">
          <p className="whitespace-pre-wrap break-words">{rendered}</p>
          <div className="mt-1.5 flex justify-end items-center gap-1 text-[10px] text-white/40">
            <span>{timeStamp()}</span>
            <svg width="14" height="10" viewBox="0 0 16 11" fill="currentColor" className="text-[#53bdeb]">
              <path d="M11.071 0.653341L4.50001 7.22434L1.42876 4.15309L0 5.5826L4.50001 10.0826L12.5 2.08258L11.071 0.653341Z" />
              <path d="M15.071 0.653341L8.50001 7.22434L7.61376 6.32184L6.18001 7.75059L8.50001 10.0826L16.5 2.08258L15.071 0.653341Z" />
            </svg>
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}

export function SmsPreview({ body }: { body: string }) {
  const rendered = renderTemplate(body || 'Type your message above…')
  return (
    <PhoneFrame variant="sms">
      <div className="px-4 py-2 border-b border-gray-200 bg-white">
        <div className="text-center text-xs font-semibold text-gray-900">Messages</div>
      </div>
      <div className="px-4 py-6 min-h-[140px] bg-white">
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-[10px] text-gray-500 font-medium">
            <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[8px] font-bold">B</span>
            BRWSTR
          </div>
        </div>
        <div className="flex">
          <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-800">
            <p className="whitespace-pre-wrap break-words">{rendered}</p>
            <div className="mt-1 text-[10px] text-gray-400 text-right">{timeStamp()}</div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}
