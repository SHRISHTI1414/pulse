// Phone bubble preview for WhatsApp + SMS messages.
// Shown in CampaignReview so marketers SEE what their customer will receive,
// not just edit text in a vacuum.

const SAMPLE_NAME = 'Anjali'

function renderTemplate(template: string): string {
  return template.replace(/\{\{\s*name\s*\}\}/g, SAMPLE_NAME)
}

function timeStamp(): string {
  const d = new Date()
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function WhatsAppPreview({ body }: { body: string }) {
  const rendered = renderTemplate(body || ' ')
  return (
    <div className="relative w-full max-w-[280px] mx-auto rounded-[2rem] border border-gray-200 bg-[#e7dccd] p-3 shadow-sm overflow-hidden">
      {/* Header — fake brand identity */}
      <div className="flex items-center gap-2 px-2 pb-2 border-b border-black/5">
        <div className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold">
          B
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-semibold text-gray-900">Brew Street</span>
          <span className="text-[10px] text-gray-500">via WhatsApp Business</span>
        </div>
      </div>
      {/* Message bubble */}
      <div className="mt-3 flex">
        <div className="relative max-w-[85%] rounded-lg bg-white px-3 py-2 text-[13px] leading-snug text-gray-800 shadow-sm">
          <p className="whitespace-pre-wrap break-words">{rendered}</p>
          <div className="mt-1 flex justify-end items-center gap-1 text-[10px] text-gray-400">
            <span>{timeStamp()}</span>
            <svg width="12" height="8" viewBox="0 0 16 11" fill="currentColor" className="text-emerald-500">
              <path d="M11.071 0.653341L4.50001 7.22434L1.42876 4.15309L0 5.5826L4.50001 10.0826L12.5 2.08258L11.071 0.653341Z" />
              <path d="M15.071 0.653341L8.50001 7.22434L7.61376 6.32184L6.18001 7.75059L8.50001 10.0826L16.5 2.08258L15.071 0.653341Z" />
            </svg>
          </div>
        </div>
      </div>
      {/* Footer pad */}
      <div className="h-8" />
    </div>
  )
}

export function SmsPreview({ body }: { body: string }) {
  const rendered = renderTemplate(body || ' ')
  return (
    <div className="relative w-full max-w-[280px] mx-auto rounded-[2rem] border border-gray-200 bg-white p-3 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 pb-2 border-b border-gray-100">
        <span className="text-[11px] text-gray-400 font-medium">Messages</span>
        <span className="text-[10px] text-gray-400">{timeStamp()}</span>
      </div>
      {/* Sender label */}
      <div className="mt-3 text-center text-[10px] text-gray-400">
        <div className="font-medium text-gray-600">BRWSTR</div>
        <div>SMS</div>
      </div>
      {/* Message bubble */}
      <div className="mt-2 flex">
        <div className="max-w-[85%] rounded-2xl bg-gray-100 px-3 py-2 text-[13px] leading-snug text-gray-800">
          <p className="whitespace-pre-wrap break-words">{rendered}</p>
        </div>
      </div>
      <div className="h-6" />
    </div>
  )
}
