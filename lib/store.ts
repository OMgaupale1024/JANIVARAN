import fs from 'fs';
import path from 'path';
import { Grievance, User, SLAState } from './types';

const DATA_FILE = path.join(process.cwd(), 'data', 'store.json');

export interface StoreData {
    grievances: Grievance[];
    currentId: number;
    virtualTimeOffset: number; // Logged in milliseconds
}

class Store {
    private data: StoreData;

    constructor() {
        this.data = this.loadData();
    }

    private loadData(): StoreData {
        try {
            if (!fs.existsSync(DATA_FILE)) {
                return { grievances: [], currentId: 1000, virtualTimeOffset: 0 };
            }
            const raw = fs.readFileSync(DATA_FILE, 'utf-8');
            return JSON.parse(raw);
        } catch (e) {
            console.error("Failed to load data", e);
            return { grievances: [], currentId: 1000, virtualTimeOffset: 0 };
        }
    }

    private saveData() {
        try {
            if (!fs.existsSync(path.dirname(DATA_FILE))) {
                fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
            }
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error("Failed to save data", e);
        }
    }

    // --- CRUD Operations ---

    getGrievances(): Grievance[] {
        this.data = this.loadData(); // Always refresh
        return this.data.grievances;
    }

    getGrievance(id: string): Grievance | undefined {
        return this.getGrievances().find(g => g.id === id);
    }

    addGrievance(partial: Omit<Grievance, 'id'>): Grievance {
        this.data = this.loadData();
        const id = `G-${this.data.currentId++}`;
        const newGrievance: Grievance = {
            ...partial,
            id,
        };
        this.data.grievances.push(newGrievance);
        this.saveData();
        return newGrievance;
    }

    updateGrievance(id: string, updates: Partial<Grievance>): Grievance | null {
        this.data = this.loadData();
        const idx = this.data.grievances.findIndex(g => g.id === id);
        if (idx === -1) return null;

        this.data.grievances[idx] = { ...this.data.grievances[idx], ...updates };
        this.saveData();
        return this.data.grievances[idx];
    }

    // --- Time Simulation ---

    getVirtualTime(): Date {
        this.data = this.loadData();
        return new Date(Date.now() + (this.data.virtualTimeOffset || 0));
    }

    addVirtualTime(hours: number) {
        this.data = this.loadData();
        this.data.virtualTimeOffset = (this.data.virtualTimeOffset || 0) + (hours * 60 * 60 * 1000);
        this.saveData();
        return this.getVirtualTime();
    }

    resetTime() {
        this.data = this.loadData();
        this.data.virtualTimeOffset = 0;
        this.saveData();
    }
}

// Singleton for API routes
export const store = new Store();
