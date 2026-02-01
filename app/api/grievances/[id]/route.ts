import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();

    const updated = store.updateGrievance(id, body);

    if (!updated) {
        return NextResponse.json({ error: 'Grievance not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
}
