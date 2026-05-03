import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { addMinutes, addDays } from 'date-fns';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/api/events', async (req, res) => {
    const events = await prisma.event.findMany({
        where: { status: 'ACCEPTED' },
        orderBy: { startTime: 'asc' }
    });
    res.json(events);
});

app.post('/api/events/suggest', async (req, res) => {
    try {
        const { duration } = req.body;
        if (!duration || duration <= 0) return res.status(400).json({ error: 'Invalid duration' });

        const now = new Date();
        const searchStart = new Date(now);
        searchStart.setMinutes(0, 0, 0);
        searchStart.setHours(searchStart.getHours() + 1);

        const futureEvents = await prisma.event.findMany({
            where: {
                status: 'ACCEPTED',
                endTime: { gt: now }
            },
            orderBy: { startTime: 'asc' }
        });

        let proposedStart = searchStart;
        let proposedEnd = addMinutes(proposedStart, duration);
        let found = false;

        while (!found) {
            const noOverlap = futureEvents.every(ev => {
                if (!ev.startTime || !ev.endTime) return true;
                return !(proposedStart < ev.endTime && proposedEnd > ev.startTime);
            });

            const hour = proposedStart.getHours();
            const isValidTimeOfDay = hour >= 8 && hour < 22;

            if (noOverlap && isValidTimeOfDay) {
                found = true;
            } else {
                proposedStart = addMinutes(proposedStart, 30);
                proposedEnd = addMinutes(proposedStart, duration);
            }

            if (proposedStart > addDays(now, 30)) {
                return res.status(404).json({ error: 'No free time found' });
            }
        }

        res.json({ suggestedStart: proposedStart, suggestedEnd: proposedEnd });

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/events', async (req, res) => {
    try {
        const { title, description, duration, startTime, endTime, status } = req.body;

        let user = await prisma.user.findFirst();
        if (!user) {
            user = await prisma.user.create({
                data: { name: 'Demo User', email: 'demo@example.com' }
            });
        }

        const newEvent = await prisma.event.create({
            data: {
                title,
                description,
                duration,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                status: status || 'ACCEPTED',
                userId: user.id
            }
        });

        res.json(newEvent);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.event.delete({ where: { id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
