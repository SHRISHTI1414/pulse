// Single big metric tile used on the Cohort Detail screen.
// Eyebrow → big number → explainer. Same rhythm everywhere.

export default function CohortMetricTile({
  eyebrow,
  value,
  explainer,
}: {
  eyebrow: string
  value: string
  explainer: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
        {eyebrow}
      </div>
      <div className="mt-2 text-4xl font-semibold text-gray-900 tabular-nums">{value}</div>
      <p className="mt-2 text-xs text-gray-500 leading-snug">{explainer}</p>
    </div>
  )
}
