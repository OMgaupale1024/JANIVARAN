import { CITIZEN_STATUSES, CitizenStatus } from '@/lib/complaint-policy';

// Same hues as the status badges in the complaint list
const BAR_COLORS: Record<CitizenStatus, string> = {
    'pending': 'bg-yellow-400',
    'under-review': 'bg-purple-500',
    'in-progress': 'bg-blue-500',
    'escalated': 'bg-red-500',
    'resolved': 'bg-green-500',
    'closed': 'bg-gray-500',
    'withdrawn': 'bg-gray-300',
};

/** One row per status: label, bar and count, so nothing depends on colour alone. */
export default function ComplaintStatusChart({ counts, total }: { counts: Record<CitizenStatus, number>; total: number }) {
    const resolvedShare = Math.round((counts.resolved / total) * 100);
    const summary = `${total} complaint${total === 1 ? '' : 's'}: ` +
        CITIZEN_STATUSES.map(s => `${counts[s.key]} ${s.label.toLowerCase()}`).join(', ') + '.';

    return (
        <figure className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h3 className="text-xl font-bold text-gray-900">Your complaints by status</h3>
                <span className="text-sm text-gray-600">
                    Resolved: <strong className="text-gray-900">{counts.resolved} of {total}</strong> complaints ({resolvedShare}%)
                </span>
            </figcaption>
            <p className="sr-only">{summary}</p>
            <ul aria-hidden="true" className="space-y-2" data-testid="status-chart">
                {CITIZEN_STATUSES.map(({ key, label }) => (
                    <li key={key} data-status={key} title={`${label}: ${counts[key]} of ${total}`} className="grid grid-cols-[7.5rem_1fr_2rem] sm:grid-cols-[12rem_1fr_2.5rem] items-center gap-3 text-sm">
                        <span className="text-gray-700 leading-tight">{label}</span>
                        <span className="h-3 bg-gray-100 rounded">
                            <span className={`block h-3 rounded ${BAR_COLORS[key]}`} style={{ width: `${(counts[key] / total) * 100}%` }} />
                        </span>
                        <span className="text-right font-semibold text-gray-900 tabular-nums">{counts[key]}</span>
                    </li>
                ))}
            </ul>
            <p className="text-xs text-gray-500 mt-4">
                Each complaint is counted once, by its current status. Open a complaint for its own timeline.
            </p>
        </figure>
    );
}
